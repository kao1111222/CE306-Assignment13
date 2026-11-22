import { Router, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { auditEntry } from "../lib/audit.js";
import { getMailer } from "../lib/mailer.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const categories = ["EQUIPMENT", "SYSTEM", "OTHER"] as const;
const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
const categoryLabels: Record<(typeof categories)[number], string> = {
  EQUIPMENT: "อุปกรณ์",
  SYSTEM: "ระบบ",
  OTHER: "อื่น ๆ",
};
const statusLabels: Record<(typeof statuses)[number], string> = {
  OPEN: "รอตรวจสอบ",
  IN_PROGRESS: "กำลังดำเนินการ",
  RESOLVED: "ดำเนินการเสร็จแล้ว",
};

function isCategory(value: string): value is (typeof categories)[number] {
  return categories.some((category) => category === value);
}

function isStatus(value: string): value is (typeof statuses)[number] {
  return statuses.some((status) => status === value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
}

router.post("/", async (req, res) => {
  const category = String(req.body?.category ?? "");
  const subject = String(req.body?.subject ?? "").trim();
  const description = String(req.body?.description ?? "").trim();
  const equipmentId = req.body?.equipmentId ? String(req.body.equipmentId) : null;
  if (!isCategory(category)) {
    return res.status(400).json({ error: "เลือกประเภทปัญหาให้ถูกต้อง" });
  }
  if (subject.length < 3 || subject.length > 120 || /[\r\n]/.test(subject)) {
    return res.status(400).json({ error: "หัวข้อต้องมี 3 ถึง 120 ตัวอักษร" });
  }
  if (description.length < 10 || description.length > 3000) {
    return res.status(400).json({ error: "รายละเอียดต้องมี 10 ถึง 3,000 ตัวอักษร" });
  }

  const [user, equipment] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { name: true, email: true },
    }),
    equipmentId
      ? prisma.equipment.findUnique({ where: { id: equipmentId }, select: { id: true, name: true, code: true } })
      : Promise.resolve(null),
  ]);
  if (!user) return res.status(401).json({ error: "ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่" });
  if (equipmentId && !equipment) return res.status(400).json({ error: "ไม่พบอุปกรณ์ที่เลือก" });

  const supportRequest = await prisma.supportRequest.create({
    data: {
      userId: req.user!.id,
      reporterName: user.name,
      reporterEmail: user.email,
      category,
      subject,
      description,
      equipmentId,
    },
    include: { equipment: { select: { name: true, code: true } } },
  });

  let notificationSent = false;
  const mail = getMailer();
  if (mail) {
    try {
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { email: true },
      });
      const recipients = admins.map((admin) => admin.email);
      if (recipients.length) {
        const equipmentLabel = supportRequest.equipment
          ? `${supportRequest.equipment.name} (${supportRequest.equipment.code})`
          : "ไม่ได้ระบุ";
        const subjectText = `คำร้องแจ้งปัญหาใหม่: ${supportRequest.subject}`;
        const details = [
          `ผู้แจ้ง: ${supportRequest.reporterName}`,
          `อีเมล: ${supportRequest.reporterEmail}`,
          `ประเภท: ${categoryLabels[category]}`,
          `อุปกรณ์: ${equipmentLabel}`,
          `รายละเอียด: ${supportRequest.description}`,
          `เลขที่คำร้อง: ${supportRequest.id}`,
        ].join("\n");
        await mail.transporter.sendMail({
          from: mail.from,
          to: recipients,
          subject: subjectText,
          text: details,
          html: `<h2>มีคำร้องแจ้งปัญหาใหม่</h2>
            <p><b>หัวข้อ:</b> ${escapeHtml(supportRequest.subject)}</p>
            <p><b>ผู้แจ้ง:</b> ${escapeHtml(supportRequest.reporterName)} (${escapeHtml(supportRequest.reporterEmail)})</p>
            <p><b>ประเภท:</b> ${escapeHtml(categoryLabels[category])}</p>
            <p><b>อุปกรณ์:</b> ${escapeHtml(equipmentLabel)}</p>
            <p><b>รายละเอียด:</b><br>${escapeHtml(supportRequest.description).replace(/\n/g, "<br>")}</p>
            <p><b>เลขที่คำร้อง:</b> ${escapeHtml(supportRequest.id)}</p>`,
        });
        notificationSent = true;
      } else {
        console.warn(`No admin email recipients for support request ${supportRequest.id}`);
      }
    } catch (error) {
      console.error(`Failed to notify admins about support request ${supportRequest.id}`, error);
    }
  } else {
    console.warn(`SMTP is not configured for support request ${supportRequest.id}`);
  }

  res.status(201).json({ id: supportRequest.id, notificationSent });
});

router.get("/mine", async (req, res) => {
  const requests = await prisma.supportRequest.findMany({
    where: { userId: req.user!.id },
    select: {
      id: true,
      category: true,
      subject: true,
      description: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      equipment: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(requests);
});

router.get("/", requireRole("ADMIN"), async (_req, res) => {
  const requests = await prisma.supportRequest.findMany({
    include: { equipment: { select: { name: true, code: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(requests);
});

async function setSupportRequestStatus(id: string, status: (typeof statuses)[number], res: Response) {
  const supportRequest = await prisma.supportRequest.findUnique({ where: { id } });
  if (!supportRequest) {
    res.status(404).json({ error: "ไม่พบคำร้องแจ้งปัญหา" });
    return;
  }
  if (supportRequest.status === status) {
    res.json({ id, status, resolvedAt: supportRequest.resolvedAt, notificationSent: false });
    return;
  }
  const updated = await prisma.supportRequest.update({
    where: { id },
    data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
  });

  let notificationSent = false;
  const mail = getMailer();
  if (mail) {
    try {
      await mail.transporter.sendMail({
        from: mail.from,
        to: supportRequest.reporterEmail,
        subject: `อัปเดตสถานะคำร้อง: ${supportRequest.subject}`,
        text: `สวัสดี ${supportRequest.reporterName}\n\nคำร้อง "${supportRequest.subject}" ได้รับการอัปเดตสถานะเป็น "${statusLabels[status]}"\n\nรายละเอียดคำร้อง:\n${supportRequest.description}`,
        html: `<p>สวัสดี ${escapeHtml(supportRequest.reporterName)}</p>
          <p>คำร้อง <b>${escapeHtml(supportRequest.subject)}</b> ได้รับการอัปเดตสถานะเป็น <b>${escapeHtml(statusLabels[status])}</b></p>
          <p><b>รายละเอียดคำร้อง:</b><br>${escapeHtml(supportRequest.description).replace(/\n/g, "<br>")}</p>`,
      });
      notificationSent = true;
    } catch (error) {
      console.error(`Failed to email user about support request ${id} status change`, error);
    }
  } else {
    console.warn(`SMTP is not configured for support request ${id} status change`);
  }

  res.json({ id: updated.id, status: updated.status, resolvedAt: updated.resolvedAt, notificationSent });
}

router.patch("/:id/status", requireRole("ADMIN"), async (req, res) => {
  const status = String(req.body?.status ?? "");
  if (!isStatus(status)) {
    return res.status(400).json({ error: "สถานะคำร้องไม่ถูกต้อง" });
  }
  await setSupportRequestStatus(String(req.params.id), status, res);
});

router.patch("/:id/resolve", requireRole("ADMIN"), async (req, res) => {
  await setSupportRequestStatus(String(req.params.id), "RESOLVED", res);
});

router.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const id = String(req.params.id);
  const supportRequest = await prisma.supportRequest.findUnique({ where: { id } });
  if (!supportRequest) return res.status(404).json({ error: "ไม่พบคำร้องแจ้งปัญหา" });

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: auditEntry(req.user!, "SUPPORT_REQUEST_DELETED", "SupportRequest", id, {
        subject: supportRequest.subject,
        reporterEmail: supportRequest.reporterEmail,
        status: supportRequest.status,
      }),
    });
    await tx.supportRequest.delete({ where: { id } });
  });
  res.json({ ok: true });
});

export default router;
