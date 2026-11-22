import { prisma } from "./prisma.js";
import { getMailer } from "./mailer.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

type ReminderEmail = { to: string; subject: string; text: string };
type SendEmail = (message: ReminderEmail) => Promise<unknown>;

const stages = [
  {
    kind: "DUE_SOON",
    offset: -DAY_MS,
    subject: "เตือนเตรียมคืนอุปกรณ์ภายใน 1 วัน",
    message: (name: string, equipment: string, due: string) =>
      `สวัสดี ${name}\nอุปกรณ์ ${equipment} มีกำหนดคืนพรุ่งนี้ (${due}) กรุณาเตรียมส่งคืนตามกำหนด`,
    recipients: "borrower",
  },
  {
    kind: "DUE_TODAY",
    offset: 0,
    subject: "วันนี้ครบกำหนดคืนอุปกรณ์",
    message: (name: string, equipment: string, due: string) =>
      `สวัสดี ${name}\nวันนี้ (${due}) เป็นวันสุดท้ายที่ต้องคืนอุปกรณ์ ${equipment} กรุณานำมาคืนภายในวันนี้`,
    recipients: "borrower",
  },
  {
    kind: "OVERDUE_1",
    offset: DAY_MS,
    subject: "อุปกรณ์เกินกำหนดคืน 1 วัน",
    message: (name: string, equipment: string, due: string) =>
      `สวัสดี ${name}\nอุปกรณ์ ${equipment} เกินกำหนดคืน 1 วันแล้ว (กำหนดคืน ${due}) กรุณาติดต่อเจ้าหน้าที่และนำอุปกรณ์มาคืนโดยเร็ว`,
    recipients: "borrower-staff",
  },
  {
    kind: "OVERDUE_3",
    offset: 3 * DAY_MS,
    subject: "ติดตามพิเศษ: อุปกรณ์เกินกำหนดคืน 3 วัน",
    message: (_name: string, equipment: string, due: string) =>
      `อุปกรณ์ ${equipment} เกินกำหนดคืน 3 วัน (กำหนดคืน ${due}) กรุณาติดต่อผู้ยืมทางโทรศัพท์หรืออีเมลและบันทึกผลการติดตามในระบบ`,
    recipients: "staff",
  },
  {
    kind: "OVERDUE_7",
    offset: 7 * DAY_MS,
    subject: "ส่งเรื่องผู้ดูแล: อุปกรณ์เกินกำหนดคืน 7 วัน",
    message: (name: string, equipment: string, due: string) =>
      `ผู้ยืม ${name} ยังไม่คืนอุปกรณ์ ${equipment} ซึ่งเกินกำหนด 7 วัน (กำหนดคืน ${due}) กรุณาตรวจสอบข้อเท็จจริงและบันทึกการดำเนินการตามระเบียบมหาวิทยาลัย`,
    recipients: "admin",
  },
] as const;

export async function sendDueReminders(now = new Date(), sendEmail?: SendEmail) {
  const mail = sendEmail ? null : getMailer();

  const overdueThreshold = new Date(now.getTime() - DAY_MS);
  const newlyOverdue = await prisma.borrowRequest.findMany({
    where: { status: "BORROWED", dueDate: { lte: overdueThreshold } },
    select: { id: true },
  });
  let statusChanges = 0;
  for (const request of newlyOverdue) {
    const changed = await prisma.$transaction(async (tx) => {
      const result = await tx.borrowRequest.updateMany({
        where: { id: request.id, status: "BORROWED", dueDate: { lte: overdueThreshold } },
        data: { status: "OVERDUE" },
      });
      if (result.count) {
        await tx.auditLog.create({
          data: {
            action: "REQUEST_MARKED_OVERDUE",
            targetType: "BorrowRequest",
            targetId: request.id,
            changes: { from: "BORROWED", to: "OVERDUE", changedAt: now.toISOString() },
          },
        });
      }
      return result.count;
    });
    statusChanges += changed;
  }

  const [requests, staffUsers, admins] = await Promise.all([
    prisma.borrowRequest.findMany({
      where: { status: { in: ["BORROWED", "OVERDUE"] } },
      include: {
        user: { select: { email: true, name: true } },
        equipment: { select: { name: true } },
        reminders: { select: { kind: true } },
      },
    }),
    prisma.user.findMany({ where: { role: { in: ["STAFF", "ADMIN"] } }, select: { email: true } }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } }),
  ]);
  const staffEmails = staffUsers.map((user) => user.email);
  const adminEmails = admins.map((user) => user.email);
  const send = sendEmail ?? (mail
    ? (message: ReminderEmail) => mail.transporter.sendMail({ from: mail.from, ...message })
    : undefined);

  let sent = 0;
  let considered = 0;
  for (const request of requests) {
    const due = request.dueDate;
    const dueLabel = due.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    for (const stage of stages) {
      const scheduledAt = new Date(due.getTime() + stage.offset);
      if (now < scheduledAt || request.reminders.some((reminder) => reminder.kind === stage.kind)) continue;
      considered++;

      const recipients = stage.recipients === "borrower"
        ? [request.user.email]
        : stage.recipients === "borrower-staff"
          ? [request.user.email, ...staffEmails]
          : stage.recipients === "staff"
            ? staffEmails
            : adminEmails;
      if (!send) continue;
      if (!recipients.length) {
        console.warn(`No email recipients configured for ${stage.kind} reminder on request ${request.id}`);
        continue;
      }

      const scheduledFor = utcDay(scheduledAt);
      const claim = await prisma.dueReminder.createMany({
        data: [{ requestId: request.id, kind: stage.kind, scheduledFor }],
        skipDuplicates: true,
      });
      if (claim.count === 0) continue;

      try {
        await send({
          to: [...new Set(recipients)].join(","),
          subject: stage.subject,
          text: stage.message(request.user.name, request.equipment.name, dueLabel),
        });
        sent++;
      } catch (error) {
        await prisma.dueReminder.deleteMany({ where: { requestId: request.id, kind: stage.kind, scheduledFor } });
        console.error(`Failed to send ${stage.kind} reminder for borrow request ${request.id}:`, error);
      }
    }
  }
  return { sent, considered, statusChanges };
}

export function startDueReminderScheduler() {
  if (!getMailer()) console.warn("SMTP is not configured; reminder emails are disabled, but overdue status updates remain active");

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await sendDueReminders();
      if (result.considered > 0 || result.statusChanges > 0) {
        console.info(`Due reminders sent: ${result.sent}/${result.considered}; overdue status changes: ${result.statusChanges}`);
      }
    } catch (error) {
      console.error("Due reminder job failed:", error);
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(() => void run(), 60_000);
  const interval = setInterval(() => void run(), 60 * 60 * 1000);
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
