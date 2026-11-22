import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { auditEntry } from "../lib/audit.js";
import { PhotoValidationError, readRequestPhoto, removeRequestPhoto, saveRequestPhoto } from "../lib/request-photos.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);
const staff = requireRole("STAFF", "ADMIN");

const include = {
  equipment: { include: { category: true } },
  user: { select: { id: true, name: true, studentId: true, email: true, phone: true, address: true, faculty: true } },
  incidents: { orderBy: { createdAt: "desc" as const } },
  overdueContacts: { orderBy: { contactedAt: "desc" as const } },
};
const incidentInclude = {
  request: {
    include: {
      user: { select: { id: true, name: true, studentId: true, email: true, phone: true, address: true } },
      equipment: { select: { id: true, code: true, name: true, status: true } },
    },
  },
};
const LOAN_AGREEMENT_TEXT = "ข้าพเจ้ารับทราบและยอมรับเงื่อนไขการยืม จะคืนอุปกรณ์ตามกำหนด และรับผิดชอบกรณีสูญหายหรือเสียหายตามระเบียบของมหาวิทยาลัย";
const PICKUP_CODE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_PICKUP_CODE_ATTEMPTS = 5;

// ค่าปรับต่อวัน (ตั้งได้ใน .env ด้วย FINE_PER_DAY) นับเป็นวัน ปัดเศษขึ้น
const FINE_PER_DAY = Number(process.env.FINE_PER_DAY) || 20;

function calcFine(due: Date, at: Date) {
  if (at.getTime() <= due.getTime()) return 0;
  return Math.ceil((at.getTime() - due.getTime()) / 86400000) * FINE_PER_DAY;
}

const withOverdue = <T extends { status: string; dueDate: Date }>(r: T) => {
  const overdue = r.status === "OVERDUE" || (r.status === "BORROWED" && r.dueDate.getTime() < Date.now());
  return { ...r, overdue, currentFine: overdue ? calcFine(r.dueDate, new Date()) : 0 };
};

router.get("/fine-rate", (_req, res) => {
  res.json({ perDay: FINE_PER_DAY });
});

async function findBorrowingBlock(tx: Prisma.TransactionClient, userId: string) {
  const request = await tx.borrowRequest.findFirst({
    where: {
      userId,
      OR: [
        { status: "BORROWED", dueDate: { lt: new Date() } },
        { status: "OVERDUE" },
        { status: "LOST" },
        { incidents: { some: { status: "OPEN" } } },
      ],
    },
    include: { incidents: { where: { status: "OPEN" }, select: { type: true } } },
    orderBy: { dueDate: "asc" },
  });
  if (!request) return null;
  if (request.status === "LOST") {
    return "มีอุปกรณ์สูญหายที่ยังไม่ได้รับคืน กรุณาติดต่อเจ้าหน้าที่";
  }
  if (request.status === "OVERDUE" || (request.status === "BORROWED" && request.dueDate < new Date())) {
    return "มีอุปกรณ์เกินกำหนดคืน กรุณาคืนอุปกรณ์ก่อนจึงจะยืมรายการใหม่ได้";
  }
  if (request.incidents.some((incident) => incident.type === "LOST")) {
    return "บัญชีมีเคสอุปกรณ์สูญหายที่ยังติดตามอยู่ กรุณาติดต่อเจ้าหน้าที่";
  }
  return "มีเคสอุปกรณ์ที่ยังอยู่ระหว่างติดตาม กรุณาติดต่อเจ้าหน้าที่";
}

router.get("/eligibility", async (req, res) => {
  const reason = await findBorrowingBlock(prisma, req.user!.id);
  res.json({ allowed: !reason, reason });
});

router.get("/overdue-followups", staff, async (_req, res) => {
  const now = new Date();
  const requests = await prisma.borrowRequest.findMany({
    where: {
      status: { in: ["BORROWED", "OVERDUE"] },
      dueDate: { lte: new Date(now.getTime() - 3 * 86400000) },
    },
    include: {
      user: { select: { id: true, name: true, studentId: true, email: true, phone: true, address: true } },
      equipment: { select: { id: true, code: true, name: true } },
      overdueContacts: { orderBy: { contactedAt: "desc" } },
    },
    orderBy: { dueDate: "asc" },
  });
  res.json(requests.map((request) => ({
    ...request,
    overdueDays: Math.floor((now.getTime() - request.dueDate.getTime()) / 86400000),
    currentFine: calcFine(request.dueDate, now),
  })));
});

router.post("/:id/overdue-contact", staff, async (req, res) => {
  const requestId = String(req.params.id);
  const method = req.body?.method;
  const note = String(req.body?.note ?? "").trim();
  if (!["PHONE", "EMAIL"].includes(method)) {
    return res.status(400).json({ error: "เลือกช่องทางติดตามเป็นโทรศัพท์หรืออีเมล" });
  }
  if (note.length < 3) return res.status(400).json({ error: "กรอกรายละเอียดผลการติดตามอย่างน้อย 3 ตัวอักษร" });

  const request = await prisma.borrowRequest.findUnique({ where: { id: requestId } });
  if (!request) return res.status(404).json({ error: "ไม่พบคำขอยืม" });
  if (!["BORROWED", "OVERDUE"].includes(request.status) || Date.now() - request.dueDate.getTime() < 3 * 86400000) {
    return res.status(400).json({ error: "บันทึกการติดตามได้เมื่อเกินกำหนดอย่างน้อย 3 วัน" });
  }
  const [contact, audit] = await prisma.$transaction([
    prisma.overdueContactLog.create({
      data: { requestId, contactedById: req.user!.id, method, note },
    }),
    prisma.auditLog.create({
      data: auditEntry(req.user!, "OVERDUE_CONTACT_RECORDED", "BorrowRequest", requestId, { method, note }),
    }),
  ]);
  res.status(201).json({ ...contact, auditId: audit.id });
});

router.post("/:id/overdue-review", requireRole("ADMIN"), async (req, res) => {
  const requestId = String(req.params.id);
  const note = String(req.body?.note ?? "").trim();
  if (note.length < 3) return res.status(400).json({ error: "กรอกผลการตรวจสอบอย่างน้อย 3 ตัวอักษร" });
  const request = await prisma.borrowRequest.findUnique({ where: { id: requestId } });
  if (!request) return res.status(404).json({ error: "ไม่พบคำขอยืม" });
  if (!["BORROWED", "OVERDUE"].includes(request.status) || Date.now() - request.dueDate.getTime() < 7 * 86400000) {
    return res.status(400).json({ error: "ส่งตรวจสอบผู้ดูแลได้เมื่อเกินกำหนดอย่างน้อย 7 วัน" });
  }
  const reviewedAt = new Date();
  const [updated] = await prisma.$transaction([
    prisma.borrowRequest.update({
      where: { id: requestId },
      data: { overdueReviewedAt: reviewedAt, overdueReviewedById: req.user!.id, overdueReviewNote: note },
      select: { id: true, overdueReviewedAt: true, overdueReviewedById: true, overdueReviewNote: true },
    }),
    prisma.auditLog.create({
      data: auditEntry(req.user!, "OVERDUE_ADMIN_REVIEWED", "BorrowRequest", requestId, { note, reviewedAt }),
    }),
  ]);
  res.json(updated);
});

router.get("/incidents", requireRole("STAFF", "ADMIN"), async (req, res) => {
  const status = req.query.status;
  if (status === "RECOVERABLE") {
    const incidents = await prisma.borrowIncident.findMany({
      where: { type: "LOST", recoveredAt: null, request: { status: "LOST" } },
      include: incidentInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json(incidents);
  }
  const incidents = await prisma.borrowIncident.findMany({
    where: { status: status === "RESOLVED" ? "RESOLVED" : "OPEN" },
    include: incidentInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(incidents);
});

router.patch("/incidents/:incidentId/recover", staff, async (req, res) => {
  const incidentId = String(req.params.incidentId);
  const condition = req.body?.condition;
  const recoveryNote = String(req.body?.recoveryNote ?? "").trim();
  if (!["GOOD", "DAMAGED"].includes(condition)) {
    return res.status(400).json({ error: "เลือกสภาพอุปกรณ์หลังพบให้ถูกต้อง" });
  }
  if (recoveryNote.length < 3) {
    return res.status(400).json({ error: "กรอกรายละเอียดการพบอุปกรณ์อย่างน้อย 3 ตัวอักษร" });
  }

  const incident = await prisma.borrowIncident.findUnique({
    where: { id: incidentId },
    include: { request: true },
  });
  if (!incident) return res.status(404).json({ error: "ไม่พบเคสติดตาม" });
  if (incident.type !== "LOST") {
    return res.status(400).json({ error: "เปิดขั้นตอนกู้คืนได้เฉพาะเคสอุปกรณ์สูญหาย" });
  }
  if (incident.recoveredAt || incident.request.status !== "LOST") {
    return res.status(400).json({ error: "เคสนี้บันทึกการพบอุปกรณ์แล้วหรือไม่อยู่ในสถานะสูญหาย" });
  }

  let photoFilename: string;
  try {
    photoFilename = await saveRequestPhoto(req.body?.photo);
  } catch (error) {
    if (error instanceof PhotoValidationError) return res.status(400).json({ error: error.message });
    throw error;
  }

  try {
    const recoveredAt = new Date();
    const recovered = await prisma.$transaction(async (tx) => {
      await tx.borrowRequest.update({
        where: { id: incident.requestId, status: "LOST" },
        data: {
          status: "RETURNED",
          returnedAt: recoveredAt,
          returnCondition: condition,
          returnPhoto: photoFilename,
          staffNote: `พบอุปกรณ์คืนแล้ว: ${recoveryNote}`,
        },
      });
      await tx.equipment.update({
        where: { id: incident.request.equipmentId, status: "RETIRED" },
        data: { status: condition === "GOOD" ? "AVAILABLE" : "REPAIR" },
      });
      if (condition === "DAMAGED") {
        await tx.borrowIncident.create({
          data: {
            requestId: incident.requestId,
            type: "DAMAGED",
            note: `พบอุปกรณ์สูญหายคืนแล้วแต่ชำรุด: ${recoveryNote}`,
            createdById: req.user!.id,
          },
        });
      }
      const updatedIncident = await tx.borrowIncident.update({
        where: { id: incidentId, recoveredAt: null },
        data: { recoveredAt, recoveredById: req.user!.id, recoveryNote },
        include: incidentInclude,
      });
      await tx.auditLog.create({
        data: auditEntry(req.user!, "LOST_EQUIPMENT_RECOVERED", "BorrowIncident", incidentId, {
          requestId: incident.requestId,
          equipmentId: incident.request.equipmentId,
          condition,
          equipmentStatus: condition === "GOOD" ? "AVAILABLE" : "REPAIR",
          recoveryNote,
          returnPhoto: true,
        }),
      });
      return updatedIncident;
    });
    res.json(recovered);
  } catch (error) {
    await removeRequestPhoto(photoFilename);
    throw error;
  }
});

router.patch("/incidents/:incidentId/resolve", requireRole("ADMIN"), async (req, res) => {
  const incidentId = String(req.params.incidentId);
  const resolutionNote = String(req.body?.resolutionNote ?? "").trim();
  if (resolutionNote.length < 3) {
    return res.status(400).json({ error: "กรอกผลการติดตามอย่างน้อย 3 ตัวอักษร" });
  }
  const incident = await prisma.borrowIncident.findUnique({ where: { id: incidentId } });
  if (!incident) return res.status(404).json({ error: "ไม่พบเคสติดตาม" });
  if (incident.status !== "OPEN") return res.status(400).json({ error: "เคสนี้ปิดแล้ว" });
  const resolvedAt = new Date();
  const [updated] = await prisma.$transaction([
    prisma.borrowIncident.update({
      where: { id: incidentId },
      data: { status: "RESOLVED", resolutionNote, resolvedById: req.user!.id, resolvedAt },
      include: incidentInclude,
    }),
    prisma.auditLog.create({
      data: auditEntry(req.user!, "INCIDENT_RESOLVED", "BorrowIncident", incidentId, {
        type: incident.type,
        requestId: incident.requestId,
        resolutionNote,
      }),
    }),
  ]);
  res.json(updated);
});

// ผู้ยืมเห็นของตัวเอง / เจ้าหน้าที่เห็นทั้งหมด
router.get("/", async (req, res) => {
  const isStaff = req.user!.role !== "STUDENT";
  const status = req.query.status as string | undefined;
  const rows = await prisma.borrowRequest.findMany({
    where: {
      ...(isStaff ? {} : { userId: req.user!.id }),
      ...(status ? { status: status as any } : {}),
    },
    include: isStaff ? include : { ...include, overdueContacts: false },
    orderBy: { createdAt: "desc" },
  });
  const result = rows.map(withOverdue);
  res.json(isStaff ? result : result.map(({
    overdueContacts: _contacts,
    overdueReviewedAt: _reviewedAt,
    overdueReviewedById: _reviewedById,
    overdueReviewNote: _reviewNote,
    ...request
  }) => request));
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = String(req.params.id);
  const request = await prisma.borrowRequest.findUnique({
    where: { id },
    select: {
      status: true,
      equipmentId: true,
      returnedAt: true,
      returnCondition: true,
      fineAmount: true,
      finePaid: true,
      handoutPhoto: true,
      returnPhoto: true,
      borrowerReturnPhoto: true,
    },
  });
  if (!request) return res.status(404).json({ error: "ไม่พบคำขอยืม" });
  if (request.status !== "RETURNED") {
    return res.status(400).json({ error: "ลบได้เฉพาะประวัติรายการที่รับคืนแล้ว" });
  }

  const photoFilenames = [...new Set([
    request.handoutPhoto,
    request.borrowerReturnPhoto,
    request.returnPhoto,
  ].filter((filename): filename is string => Boolean(filename)))];

  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.borrowRequest.deleteMany({ where: { id, status: "RETURNED" } });
    if (result.count === 0) return false;
    await tx.auditLog.create({
      data: auditEntry(req.user!, "RETURNED_REQUEST_DELETED", "BorrowRequest", id, {
        equipmentId: request.equipmentId,
        returnedAt: request.returnedAt?.toISOString() ?? null,
        returnCondition: request.returnCondition,
        fineAmount: request.fineAmount,
        finePaid: request.finePaid,
        deletedPhotos: photoFilenames.length,
      }),
    });
    return true;
  });
  if (!deleted) return res.status(409).json({ error: "ข้อมูลรายการเปลี่ยนแปลงแล้ว กรุณารีเฟรชข้อมูล" });

  const cleanupResults = await Promise.allSettled(photoFilenames.map(removeRequestPhoto));
  const cleanupErrors = cleanupResults.filter((result) => result.status === "rejected");
  if (cleanupErrors.length > 0) {
    console.error(`Failed to remove ${cleanupErrors.length} photo file(s) for deleted borrow request ${id}:`, cleanupErrors);
  }
  res.json({ deleted: true, photoCleanupFailed: cleanupErrors.length > 0 });
});

router.get("/:id/photos/:kind", async (req, res) => {
  const id = String(req.params.id);
  const kind = req.params.kind;
  if (!["handout", "return", "borrower-return"].includes(kind)) {
    return res.status(400).json({ error: "ประเภทภาพไม่ถูกต้อง" });
  }
  const request = await prisma.borrowRequest.findUnique({
    where: { id },
    select: { userId: true, handoutPhoto: true, returnPhoto: true, borrowerReturnPhoto: true },
  });
  if (!request) return res.status(404).json({ error: "ไม่พบคำขอ" });
  if (req.user!.role === "STUDENT" && request.userId !== req.user!.id) {
    return res.status(403).json({ error: "ไม่มีสิทธิ์ดูรูปภาพนี้" });
  }
  const filename = kind === "handout"
    ? request.handoutPhoto
    : kind === "return"
      ? request.returnPhoto
      : request.borrowerReturnPhoto;
  if (!filename) return res.status(404).json({ error: "ไม่มีรูปภาพนี้" });
  const photo = await readRequestPhoto(filename);
  res.setHeader("Cache-Control", "private, no-store");
  res.type(photo.contentType).send(photo.data);
});

router.post("/:id/return-submission", async (req, res) => {
  if (req.user!.role !== "STUDENT") return res.status(403).json({ error: "ขั้นตอนนี้สำหรับผู้ยืมเท่านั้น" });
  const id = String(req.params.id);
  const note = String(req.body?.note ?? "").trim();
  const existing = await prisma.borrowRequest.findUnique({
    where: { id },
    select: { userId: true, status: true, borrowerReturnSubmittedAt: true },
  });
  if (!existing || existing.userId !== req.user!.id) {
    return res.status(404).json({ error: "ไม่พบคำขอยืม" });
  }
  if (!["BORROWED", "OVERDUE"].includes(existing.status)) {
    return res.status(400).json({ error: "ส่งคืนได้เฉพาะอุปกรณ์ที่กำลังยืมอยู่" });
  }
  if (existing.borrowerReturnSubmittedAt) {
    return res.status(409).json({ error: "ส่งหลักฐานคืนแล้ว กรุณารอเจ้าหน้าที่ตรวจรับ" });
  }

  let photoFilename: string;
  try {
    photoFilename = await saveRequestPhoto(req.body?.photo);
  } catch (error) {
    if (error instanceof PhotoValidationError) return res.status(400).json({ error: error.message });
    throw error;
  }

  try {
    const submittedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const request = await tx.borrowRequest.update({
        where: { id, userId: req.user!.id, status: { in: ["BORROWED", "OVERDUE"] }, borrowerReturnSubmittedAt: null },
        data: {
          borrowerReturnPhoto: photoFilename,
          borrowerReturnSubmittedAt: submittedAt,
          borrowerReturnNote: note || null,
        },
        include,
      });
      await tx.auditLog.create({
        data: auditEntry(req.user!, "RETURN_SUBMITTED_BY_BORROWER", "BorrowRequest", id, {
          submittedAt,
          note: note || null,
          photo: true,
        }),
      });
      return request;
    });
    res.json(updated);
  } catch (error) {
    await removeRequestPhoto(photoFilename);
    throw error;
  }
});

// ขอยืม
router.post("/", async (req, res) => {
  const { equipmentId, borrowDate, dueDate, purpose, agreementAccepted } = req.body ?? {};
  if (!equipmentId || !borrowDate || !dueDate) {
    return res.status(400).json({ error: "เลือกอุปกรณ์และวันที่ยืม/คืนให้ครบ" });
  }
  if (agreementAccepted !== true) {
    return res.status(400).json({ error: "กรุณายืนยันข้อตกลงก่อนส่งคำขอ" });
  }
  const borrower = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { studentId: true, name: true, email: true, phone: true },
  });
  if (!borrower?.studentId || !borrower.name || !borrower.email || !borrower.phone) {
    return res.status(400).json({ error: "กรุณากรอกข้อมูลประจำตัวและเบอร์โทรศัพท์ให้ครบในหน้าโปรไฟล์ก่อนยืม" });
  }
  const start = new Date(borrowDate);
  const end = new Date(dueDate);
  if (isNaN(+start) || isNaN(+end)) return res.status(400).json({ error: "รูปแบบวันที่ไม่ถูกต้อง" });
  if (end <= start) return res.status(400).json({ error: "วันคืนต้องหลังวันยืม" });

  const durationDays = (+end - +start) / 86400000;
  if (durationDays < 3 || durationDays > 7) {
    return res.status(400).json({ error: "กำหนดระยะเวลายืมได้ตั้งแต่ 3 ถึง 7 วัน" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const borrowingBlock = await findBorrowingBlock(tx, req.user!.id);
      if (borrowingBlock) return { kind: "blocked" as const, reason: borrowingBlock };
      const equipment = await tx.equipment.findUnique({ where: { id: equipmentId } });
      if (!equipment) return { kind: "not_found" as const };
      if (equipment.status === "REPAIR" || equipment.status === "RETIRED") {
        return { kind: "unavailable" as const };
      }

      const conflict = await tx.borrowRequest.findFirst({
        where: {
          equipmentId,
          OR: [
            { status: "OVERDUE" },
            { status: "BORROWED", dueDate: { lt: new Date() } },
            {
              status: { in: ["PENDING", "APPROVED", "BORROWED"] },
              borrowDate: { lt: end },
              dueDate: { gt: start },
            },
          ],
        },
        select: { id: true },
      });
      if (conflict) return { kind: "conflict" as const };

      const request = await tx.borrowRequest.create({
        data: {
          userId: req.user!.id,
          equipmentId,
          borrowDate: start,
          dueDate: end,
          purpose,
          agreementAcceptedAt: new Date(),
          agreementText: LOAN_AGREEMENT_TEXT,
          borrowerName: borrower.name,
          borrowerStudentId: borrower.studentId,
          borrowerPhone: borrower.phone,
          borrowerEmail: borrower.email,
        },
        include,
      });
      await tx.auditLog.create({
        data: auditEntry(req.user!, "REQUEST_CREATED", "BorrowRequest", request.id, {
          status: request.status,
          equipmentId,
          agreementAcceptedAt: request.agreementAcceptedAt,
          borrowerStudentId: request.borrowerStudentId,
        }),
      });
      return { kind: "created" as const, request };
    }, { isolationLevel: "Serializable" });

    if (result.kind === "not_found") return res.status(404).json({ error: "ไม่พบอุปกรณ์" });
    if (result.kind === "blocked") return res.status(403).json({ error: result.reason });
    if (result.kind === "unavailable") return res.status(400).json({ error: "อุปกรณ์นี้ไม่พร้อมให้ยืม" });
    if (result.kind === "conflict") {
      return res.status(409).json({ error: "ช่วงเวลานี้มีผู้ขอหรือจองอุปกรณ์ชิ้นนี้อยู่แล้ว" });
    }
    return res.status(201).json(result.request);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
      return res.status(409).json({ error: "มีผู้ขออุปกรณ์ในช่วงเวลาเดียวกัน กรุณาเลือกช่วงเวลาอื่น" });
    }
    throw error;
  }
});

// ยกเลิก (เฉพาะของตัวเอง และต้องยัง PENDING)
router.patch("/:id/cancel", async (req, res) => {
  const r = await prisma.borrowRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!r || r.userId !== req.user!.id) return res.status(404).json({ error: "ไม่พบคำขอ" });
  if (r.status !== "PENDING") return res.status(400).json({ error: "ยกเลิกได้เฉพาะคำขอที่รออนุมัติ" });
  const updated = await prisma.$transaction(async (tx) => {
    const request = await tx.borrowRequest.update({ where: { id: r.id }, data: { status: "CANCELLED" }, include });
    await tx.auditLog.create({
      data: auditEntry(req.user!, "REQUEST_CANCELLED", "BorrowRequest", r.id, { from: "PENDING", to: "CANCELLED" }),
    });
    return request;
  });
  res.json(updated);
});

async function getWithStatus(id: string, expected: string, res: any) {
  const r = await prisma.borrowRequest.findUnique({ where: { id } });
  if (!r) {
    res.status(404).json({ error: "ไม่พบคำขอ" });
    return null;
  }
  if (r.status !== expected) {
    res.status(400).json({ error: `คำขอนี้อยู่ในสถานะ ${r.status} ทำรายการนี้ไม่ได้` });
    return null;
  }
  return r;
}

router.patch("/:id/approve", staff, async (req, res) => {
  const r = await getWithStatus(String(req.params.id), "PENDING", res);
  if (!r) return;
  const borrowingBlock = await findBorrowingBlock(prisma, r.userId);
  if (borrowingBlock) return res.status(400).json({ error: borrowingBlock });
  const updated = await prisma.$transaction(async (tx) => {
    const request = await tx.borrowRequest.update({
      where: { id: r.id },
      data: { status: "APPROVED", approvedById: req.user!.id, staffNote: req.body?.note },
      include,
    });
    await tx.auditLog.create({
      data: auditEntry(req.user!, "REQUEST_APPROVED", "BorrowRequest", r.id, { from: "PENDING", to: "APPROVED" }),
    });
    return request;
  });
  res.json(updated);
});

router.patch("/:id/reject", staff, async (req, res) => {
  const r = await getWithStatus(String(req.params.id), "PENDING", res);
  if (!r) return;
  const updated = await prisma.$transaction(async (tx) => {
    const request = await tx.borrowRequest.update({
      where: { id: r.id },
      data: { status: "REJECTED", approvedById: req.user!.id, staffNote: req.body?.note },
      include,
    });
    await tx.auditLog.create({
      data: auditEntry(req.user!, "REQUEST_REJECTED", "BorrowRequest", r.id, { from: "PENDING", to: "REJECTED" }),
    });
    return request;
  });
  res.json(updated);
});

router.post("/:id/pickup-code", async (req, res) => {
  const request = await prisma.borrowRequest.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true, userId: true, status: true },
  });
  if (!request || request.userId !== req.user!.id) {
    return res.status(404).json({ error: "ไม่พบคำขอยืม" });
  }
  if (request.status !== "APPROVED") {
    return res.status(400).json({ error: "ขอรหัสรับอุปกรณ์ได้เมื่อคำขอได้รับอนุมัติแล้วเท่านั้น" });
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + PICKUP_CODE_LIFETIME_MS);
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.pickupVerification.upsert({
    where: { requestId: request.id },
    create: { requestId: request.id, codeHash, expiresAt },
    update: { codeHash, expiresAt, failedAttempts: 0, createdAt: new Date() },
  });
  res.json({ code, expiresAt });
});

// ส่งมอบอุปกรณ์
router.patch("/:id/handout", staff, async (req, res) => {
  const r = await getWithStatus(String(req.params.id), "APPROVED", res);
  if (!r) return;
  const pickupCode = String(req.body?.pickupCode ?? "").trim();
  if (!/^\d{6}$/.test(pickupCode)) {
    return res.status(400).json({ error: "กรอกรหัสรับอุปกรณ์ 6 หลัก" });
  }
  const verification = await prisma.pickupVerification.findUnique({ where: { requestId: r.id } });
  if (!verification) {
    return res.status(400).json({ error: "ยังไม่มีรหัสรับอุปกรณ์ กรุณาให้ผู้ยืมขอรหัสจากหน้าคำขอของฉัน" });
  }
  if (verification.expiresAt <= new Date()) {
    await prisma.pickupVerification.deleteMany({ where: { id: verification.id, codeHash: verification.codeHash } });
    return res.status(400).json({ error: "รหัสรับอุปกรณ์หมดอายุแล้ว กรุณาให้ผู้ยืมขอรหัสใหม่" });
  }
  if (verification.failedAttempts >= MAX_PICKUP_CODE_ATTEMPTS) {
    await prisma.pickupVerification.deleteMany({ where: { id: verification.id, codeHash: verification.codeHash } });
    return res.status(429).json({ error: "กรอกรหัสผิดเกินจำนวนครั้ง กรุณาให้ผู้ยืมขอรหัสใหม่" });
  }
  if (!(await bcrypt.compare(pickupCode, verification.codeHash))) {
    await prisma.$transaction(async (tx) => {
      await tx.pickupVerification.updateMany({
        where: {
          id: verification.id,
          codeHash: verification.codeHash,
          failedAttempts: { lt: MAX_PICKUP_CODE_ATTEMPTS },
        },
        data: { failedAttempts: { increment: 1 } },
      });
      const current = await tx.pickupVerification.findUnique({ where: { id: verification.id } });
      if (current?.codeHash === verification.codeHash && current.failedAttempts >= MAX_PICKUP_CODE_ATTEMPTS) {
        await tx.pickupVerification.delete({ where: { id: verification.id } });
      }
    });
    return res.status(400).json({ error: "รหัสรับอุปกรณ์ไม่ถูกต้อง" });
  }

  const eq = await prisma.equipment.findUnique({ where: { id: r.equipmentId } });
  if (eq?.status !== "AVAILABLE") return res.status(400).json({ error: "อุปกรณ์ยังไม่พร้อม (ยังไม่ถูกคืน/ซ่อมอยู่)" });

  let photoFilename: string;
  try {
    photoFilename = await saveRequestPhoto(req.body?.photo);
  } catch (error) {
    if (error instanceof PhotoValidationError) return res.status(400).json({ error: error.message });
    throw error;
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const consumed = await tx.pickupVerification.deleteMany({
        where: {
          id: verification.id,
          codeHash: verification.codeHash,
          expiresAt: { gt: new Date() },
          failedAttempts: { lt: MAX_PICKUP_CODE_ATTEMPTS },
        },
      });
      if (consumed.count !== 1) return null;

      const [updated] = await Promise.all([
        tx.borrowRequest.update({
          where: { id: r.id, status: "APPROVED" },
          data: { status: "BORROWED", handedOutAt: new Date(), handoutPhoto: photoFilename },
          include,
        }),
        tx.equipment.update({ where: { id: r.equipmentId, status: "AVAILABLE" }, data: { status: "BORROWED" } }),
        tx.auditLog.create({
          data: auditEntry(req.user!, "REQUEST_HANDED_OUT", "BorrowRequest", r.id, {
            requestStatus: { from: "APPROVED", to: "BORROWED" },
            equipmentStatus: { from: "AVAILABLE", to: "BORROWED" },
            handoutPhoto: true,
            pickupCodeVerified: true,
          }),
        }),
      ]);
      return updated;
    }, { isolationLevel: "Serializable" });
    if (!result) {
      await removeRequestPhoto(photoFilename);
      return res.status(400).json({ error: "รหัสรับอุปกรณ์หมดอายุหรือถูกใช้ไปแล้ว กรุณาให้ผู้ยืมขอรหัสใหม่" });
    }
    res.json(result);
  } catch (error) {
    await removeRequestPhoto(photoFilename);
    throw error;
  }
});

// รับคืน  body: { condition: "GOOD" | "DAMAGED", note? }
router.patch("/:id/return", staff, async (req, res) => {
  const r = await prisma.borrowRequest.findUnique({ where: { id: String(req.params.id) } });
  if (!r) return res.status(404).json({ error: "ไม่พบคำขอ" });
  if (!["BORROWED", "OVERDUE"].includes(r.status)) {
    return res.status(400).json({ error: `คำขอนี้อยู่ในสถานะ ${r.status} ทำรายการนี้ไม่ได้` });
  }
  if (!r.borrowerReturnSubmittedAt || !r.borrowerReturnPhoto) {
    return res.status(400).json({ error: "รอผู้ยืมแนบรูปยืนยันการคืนก่อน เจ้าหน้าที่จึงจะตรวจรับได้" });
  }
  const condition = req.body?.condition === "DAMAGED" ? "DAMAGED" : "GOOD";
  const damageNote = String(req.body?.note ?? "").trim();
  const estimatedValue = req.body?.estimatedValue === undefined || req.body?.estimatedValue === ""
    ? null
    : Number(req.body.estimatedValue);
  if (condition === "DAMAGED" && damageNote.length < 3) {
    return res.status(400).json({ error: "กรอกรายละเอียดความเสียหายอย่างน้อย 3 ตัวอักษร" });
  }
  if (estimatedValue !== null && (!Number.isInteger(estimatedValue) || estimatedValue < 0)) {
    return res.status(400).json({ error: "มูลค่าประเมินต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป" });
  }
  const now = new Date();
  const fineAmount = calcFine(r.dueDate, now);
  let photoFilename: string;
  try {
    photoFilename = await saveRequestPhoto(req.body?.photo);
  } catch (error) {
    if (error instanceof PhotoValidationError) return res.status(400).json({ error: error.message });
    throw error;
  }
  try {
    const [updated] = await prisma.$transaction(async (tx) => {
      const request = await tx.borrowRequest.update({
        where: { id: r.id, status: { in: ["BORROWED", "OVERDUE"] } },
        data: {
          status: "RETURNED",
          returnedAt: now,
          returnCondition: condition,
          fineAmount,
          returnPhoto: photoFilename,
          staffNote: condition === "DAMAGED" ? damageNote : req.body?.note ?? r.staffNote,
        },
        include,
      });
      await tx.equipment.update({
        where: { id: r.equipmentId, status: "BORROWED" },
        data: { status: condition === "DAMAGED" ? "REPAIR" : "AVAILABLE" },
      });
      if (condition === "DAMAGED") {
        await tx.borrowIncident.create({
          data: {
            requestId: r.id,
            type: "DAMAGED",
            note: damageNote,
            estimatedValue,
            createdById: req.user!.id,
          },
        });
      }
      await tx.auditLog.create({
        data: auditEntry(req.user!, "REQUEST_RETURNED", "BorrowRequest", r.id, {
          requestStatus: { from: r.status, to: "RETURNED" },
          equipmentStatus: { from: "BORROWED", to: condition === "DAMAGED" ? "REPAIR" : "AVAILABLE" },
          condition,
          returnPhoto: true,
          ...(condition === "DAMAGED" ? { damageNote, estimatedValue } : {}),
          fineAmount,
        }),
      });
      return [request];
    });
    res.json(updated);
  } catch (error) {
    await removeRequestPhoto(photoFilename);
    throw error;
  }
});

router.post("/:id/incidents", staff, async (req, res) => {
  const requestId = String(req.params.id);
  const type = req.body?.type;
  const note = String(req.body?.note ?? "").trim();
  const estimatedValue = req.body?.estimatedValue === undefined || req.body?.estimatedValue === ""
    ? null
    : Number(req.body.estimatedValue);
  if (!["LOST", "UNREACHABLE"].includes(type)) {
    return res.status(400).json({ error: "ประเภทเคสไม่ถูกต้อง" });
  }
  if (note.length < 3) return res.status(400).json({ error: "กรอกรายละเอียดการติดตามอย่างน้อย 3 ตัวอักษร" });
  if (estimatedValue !== null && (!Number.isInteger(estimatedValue) || estimatedValue < 0)) {
    return res.status(400).json({ error: "มูลค่าประเมินต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป" });
  }

  const request = await prisma.borrowRequest.findUnique({ where: { id: requestId } });
  if (!request) return res.status(404).json({ error: "ไม่พบคำขอยืม" });
  if (!["BORROWED", "OVERDUE"].includes(request.status)) return res.status(400).json({ error: "เปิดเคสได้เฉพาะรายการที่กำลังยืม" });

  const incident = await prisma.$transaction(async (tx) => {
    const created = await tx.borrowIncident.create({
      data: { requestId, type, note, estimatedValue, createdById: req.user!.id },
      include: incidentInclude,
    });
    if (type === "LOST") {
      await tx.borrowRequest.update({ where: { id: requestId }, data: { status: "LOST" } });
      await tx.equipment.update({ where: { id: request.equipmentId }, data: { status: "RETIRED" } });
    }
    await tx.auditLog.create({
      data: auditEntry(req.user!, "INCIDENT_OPENED", "BorrowIncident", created.id, {
        type,
        requestId,
        equipmentId: request.equipmentId,
        note,
        estimatedValue,
      }),
    });
    return created;
  });
  res.status(201).json(incident);
});

// บันทึกว่าชำระค่าปรับแล้ว
router.patch("/:id/pay-fine", staff, async (req, res) => {
  const r = await getWithStatus(String(req.params.id), "RETURNED", res);
  if (!r) return;
  if (r.fineAmount <= 0) return res.status(400).json({ error: "คำขอนี้ไม่มีค่าปรับ" });
  if (r.finePaid) return res.status(400).json({ error: "ชำระค่าปรับแล้ว" });
  const updated = await prisma.$transaction(async (tx) => {
    const request = await tx.borrowRequest.update({ where: { id: r.id }, data: { finePaid: true }, include });
    await tx.auditLog.create({
      data: auditEntry(req.user!, "FINE_PAID", "BorrowRequest", r.id, { fineAmount: r.fineAmount, finePaid: true }),
    });
    return request;
  });
  res.json(updated);
});

export default router;
