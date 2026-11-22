import "dotenv/config";
import path from "node:path";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";

import authRoutes from "./routes/auth.js";
import categoryRoutes from "./routes/categories.js";
import equipmentRoutes from "./routes/equipment.js";
import requestRoutes from "./routes/requests.js";
import supportRequestRoutes from "./routes/support-requests.js";
import dashboardRoutes from "./routes/dashboard.js";
import userRoutes from "./routes/users.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/api", (_req, res) => {
  res.json({ message: "Equipment borrowing API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/support-requests", supportRequestRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);

const frontendDir = path.resolve(import.meta.dirname, "../../frontend");
app.use(express.static(frontendDir));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const error = err as { code?: string };
  if (error?.code === "P2002") return res.status(409).json({ error: "ข้อมูลซ้ำกับที่มีอยู่แล้ว" });
  if (error?.code === "P2025") return res.status(404).json({ error: "ไม่พบข้อมูล" });
  console.error(err);
  res.status(500).json({ error: "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์" });
});

export default app;
