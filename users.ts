import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { auditEntry } from "../lib/audit.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", async (_req, res) => {
  res.json(
    await prisma.user.findMany({
      select: { id: true, studentId: true, name: true, email: true, faculty: true, role: true },
      orderBy: { createdAt: "desc" },
    })
  );
});

router.get("/audit", async (req, res) => {
  const parsedLimit = Number(req.query.limit);
  const parsedOffset = Number(req.query.offset);
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
  const offset = Number.isInteger(parsedOffset) ? Math.max(parsedOffset, 0) : 0;
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
    prisma.auditLog.count(),
  ]);
  res.json({ items, total, limit, offset });
});

router.patch("/:id/role", async (req, res) => {
  const { role } = req.body ?? {};
  if (!["STUDENT", "STAFF", "ADMIN"].includes(role)) return res.status(400).json({ error: "บทบาทไม่ถูกต้อง" });
  const id = String(req.params.id);
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) return res.status(404).json({ error: "ไม่พบผู้ใช้" });
  const u = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id }, data: { role } });
    await tx.auditLog.create({
      data: auditEntry(req.user!, "USER_ROLE_CHANGED", "User", id, { from: before.role, to: updated.role }),
    });
    return updated;
  });
  res.json({ id: u.id, role: u.role });
});

router.delete("/:id", async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) {
    return res.status(400).json({ error: "ลบบัญชีของตัวเองไม่ได้" });
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

  if (user.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) return res.status(400).json({ error: "ลบผู้ดูแลระบบคนสุดท้ายไม่ได้" });
  }

  const active = await prisma.borrowRequest.count({
    where: { userId: id, status: { in: ["PENDING", "APPROVED", "BORROWED", "OVERDUE", "LOST"] } },
  });
  if (active > 0) {
    return res.status(400).json({ error: "ลบไม่ได้ ผู้ใช้นี้ยังมีคำขอค้างหรือมีอุปกรณ์สูญหายที่ยังไม่ได้รับคืน" });
  }
  const openIncidents = await prisma.borrowIncident.count({
    where: { status: "OPEN", request: { userId: id } },
  });
  if (openIncidents > 0) {
    return res.status(400).json({ error: "ลบไม่ได้ ผู้ใช้นี้ยังมีเคสอุปกรณ์ที่อยู่ระหว่างติดตาม" });
  }

  await prisma.$transaction([
    prisma.borrowRequest.updateMany({ where: { approvedById: id }, data: { approvedById: null } }),
    prisma.borrowRequest.deleteMany({ where: { userId: id } }),
    prisma.auditLog.create({
      data: auditEntry(req.user!, "USER_DELETED", "User", id, { studentId: user.studentId, email: user.email, role: user.role }),
    }),
    prisma.user.delete({ where: { id } }),
  ]);
  res.json({ ok: true });
});

export default router;
