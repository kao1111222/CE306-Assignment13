import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/stats", requireAuth, requireRole("STAFF", "ADMIN"), async (_req, res) => {
  const now = new Date();
  const [pending, approved, borrowed, overdue, lost, openIncidents, available, repair, total, fines] = await Promise.all([
    prisma.borrowRequest.count({ where: { status: "PENDING" } }),
    prisma.borrowRequest.count({ where: { status: "APPROVED" } }),
    prisma.borrowRequest.count({ where: { status: { in: ["BORROWED", "OVERDUE"] } } }),
    prisma.borrowRequest.count({
      where: {
        status: { in: ["BORROWED", "OVERDUE"] },
        dueDate: { lt: now },
      },
    }),
    prisma.borrowRequest.count({ where: { status: "LOST" } }),
    prisma.borrowIncident.count({ where: { status: "OPEN" } }),
    prisma.equipment.count({ where: { status: "AVAILABLE" } }),
    prisma.equipment.count({ where: { status: "REPAIR" } }),
    prisma.equipment.count({ where: { status: { not: "RETIRED" } } }),
    prisma.borrowRequest.aggregate({ _sum: { fineAmount: true }, where: { fineAmount: { gt: 0 }, finePaid: false } }),
  ]);
  res.json({ pending, approved, borrowed, overdue, lost, openIncidents, unpaidFines: fines._sum.fineAmount ?? 0, equipment: { total, available, repair } });
});

export default router;
