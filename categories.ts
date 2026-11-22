import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await prisma.category.findMany({ orderBy: { name: "asc" } }));
});

router.post("/", requireAuth, requireRole("STAFF", "ADMIN"), async (req, res) => {
  const { name } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "กรอกชื่อหมวดหมู่" });
  res.status(201).json(await prisma.category.create({ data: { name } }));
});

export default router;
