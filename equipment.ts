import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auditEntry } from "../lib/audit.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
const STATUSES = ["AVAILABLE", "BORROWED", "REPAIR", "RETIRED"];

router.get("/", async (req, res) => {
  const { q, categoryId, status } = req.query as Record<string, string | undefined>;
  const items = await prisma.equipment.findMany({
    where: {
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
      ...(categoryId ? { categoryId } : {}),
    },
    include: {
      category: true,
      requests: {
        where: { status: { in: ["APPROVED", "BORROWED", "OVERDUE"] } },
        select: { status: true },
      },
    },
    orderBy: { code: "asc" },
  });
  const withCurrentStatus = items.map(({ requests, ...item }) => ({
    ...item,
    status: requests.some((request) => request.status === "BORROWED" || request.status === "OVERDUE")
      ? "BORROWED"
      : item.status === "REPAIR"
        ? "REPAIR"
        : requests.some((request) => request.status === "APPROVED")
          ? "RESERVED"
          : item.status,
  }));
  res.json(status && STATUSES.includes(status)
    ? withCurrentStatus.filter((item) => status === "BORROWED"
      ? item.status === "BORROWED" || item.status === "RESERVED"
      : item.status === status)
    : withCurrentStatus);
});

router.get("/:id", async (req, res) => {
  const item = await prisma.equipment.findUnique({
    where: { id: String(req.params.id) },
    include: {
      category: true,
      requests: {
        where: { status: { in: ["PENDING", "APPROVED", "BORROWED", "OVERDUE"] } },
        select: { borrowDate: true, dueDate: true, status: true },
        orderBy: { borrowDate: "asc" },
      },
    },
  });
  if (!item) return res.status(404).json({ error: "ไม่พบอุปกรณ์" });
  const isBorrowed = item.requests.some((request) => request.status === "BORROWED" || request.status === "OVERDUE");
  const isReserved = item.requests.some((request) => request.status === "APPROVED");
  res.json({
    ...item,
    status: isBorrowed ? "BORROWED" : item.status === "REPAIR" ? "REPAIR" : isReserved ? "RESERVED" : item.status,
  });
});

router.post("/", requireAuth, requireRole("STAFF", "ADMIN"), async (req, res) => {
  const { code, name, description, location, categoryId } = req.body ?? {};
  if (!code || !name || !categoryId) {
    return res.status(400).json({ error: "กรอกรหัส ชื่อ และหมวดหมู่ให้ครบ" });
  }
  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.equipment.create({
      data: { code, name, description, location, categoryId },
      include: { category: true },
    });
    await tx.auditLog.create({
      data: auditEntry(req.user!, "EQUIPMENT_CREATED", "Equipment", item.id, { code, name, categoryId }),
    });
    return item;
  });
  res.status(201).json(created);
});

router.put("/:id", requireAuth, requireRole("STAFF", "ADMIN"), async (req, res) => {
  const { name, description, location, categoryId, status } = req.body ?? {};
  if (status && !STATUSES.includes(status)) return res.status(400).json({ error: "สถานะไม่ถูกต้อง" });
  const id = String(req.params.id);
  const before = await prisma.equipment.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "ไม่พบอุปกรณ์" });
  if (status === "BORROWED") {
    return res.status(400).json({ error: "สถานะกำลังยืมจะอัปเดตอัตโนมัติเมื่อเจ้าหน้าที่กดส่งมอบอุปกรณ์" });
  }
  if (status && status !== before.status) {
    const activeLoan = await prisma.borrowRequest.findFirst({
      where: { equipmentId: id, status: { in: ["BORROWED", "OVERDUE"] } },
      select: { id: true },
    });
    if (activeLoan) {
      return res.status(400).json({ error: "อุปกรณ์กำลังถูกยืม สถานะจะเปลี่ยนอัตโนมัติเมื่อเจ้าหน้าที่รับคืน" });
    }
  }
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.equipment.update({
      where: { id },
      data: { name, description, location, categoryId, status },
      include: { category: true },
    });
    await tx.auditLog.create({
      data: auditEntry(req.user!, "EQUIPMENT_UPDATED", "Equipment", id, {
        before: { name: before.name, description: before.description, location: before.location, categoryId: before.categoryId, status: before.status },
        after: { name: item.name, description: item.description, location: item.location, categoryId: item.categoryId, status: item.status },
      }),
    });
    return item;
  });
  res.json(updated);
});

// ลบอุปกรณ์: ถ้าไม่เคยมีประวัติยืมจะลบจริง ถ้าเคยมีจะตัดจำหน่ายแทน (เก็บประวัติไว้)
router.delete("/:id", requireAuth, requireRole("STAFF", "ADMIN"), async (req, res) => {
  const id = String(req.params.id);
  const equipment = await prisma.equipment.findUnique({ where: { id } });
  if (!equipment) return res.status(404).json({ error: "ไม่พบอุปกรณ์" });

  const active = await prisma.borrowRequest.count({
    where: { equipmentId: id, status: { in: ["PENDING", "APPROVED", "BORROWED", "OVERDUE"] } },
  });
  if (active > 0) {
    return res.status(400).json({ error: "ลบไม่ได้ อุปกรณ์นี้ยังมีคำขอค้างอยู่ (รออนุมัติ/อนุมัติแล้ว/กำลังยืม)" });
  }

  const history = await prisma.borrowRequest.count({ where: { equipmentId: id } });
  if (history > 0) {
    await prisma.$transaction([
      prisma.equipment.update({ where: { id }, data: { status: "RETIRED" } }),
      prisma.auditLog.create({
        data: auditEntry(req.user!, "EQUIPMENT_RETIRED", "Equipment", id, { from: equipment.status, to: "RETIRED" }),
      }),
    ]);
    return res.json({ ok: true, mode: "retired" });
  }

  await prisma.$transaction([
    prisma.auditLog.create({
      data: auditEntry(req.user!, "EQUIPMENT_DELETED", "Equipment", id, { code: equipment.code, name: equipment.name }),
    }),
    prisma.equipment.delete({ where: { id } }),
  ]);
  res.json({ ok: true, mode: "deleted" });
});

export default router;
