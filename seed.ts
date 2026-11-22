import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const users = [
    { studentId: "admin", name: "ผู้ดูแลระบบ", email: "admin@uni.ac.th", role: "ADMIN" as const, envKey: "SEED_ADMIN_PASSWORD" },
    { studentId: "staff", name: "เจ้าหน้าที่ ", email: "staff@uni.ac.th", role: "STAFF" as const, envKey: "SEED_STAFF_PASSWORD" },
  ];

  for (const { envKey, ...u } of users) {
    const fromEnv = process.env[envKey];
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing && !fromEnv) continue; 

    const plain = fromEnv ?? randomBytes(6).toString("hex");
    const passwordHash = await bcrypt.hash(plain, 10);
    if (existing) {
      await prisma.user.update({ where: { email: u.email }, data: { passwordHash } });
    } else {
      await prisma.user.create({ data: { ...u, passwordHash } });
      if (!fromEnv) console.log(`สร้างบัญชี ${u.email} รหัสผ่านที่สุ่มได้: ${plain}  (จดไว้ แล้วเปลี่ยนในหน้าเว็บได้)`);
    }
  }

  const cats = ["กล้อง", "โน้ตบุ๊ก", "โปรเจกเตอร์", "อุปกรณ์เครือข่าย", "ไมโครคอนโทรลเลอร์"];
  const catMap: Record<string, string> = {};
  for (const name of cats) {
    const c = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    catMap[name] = c.id;
  }

  const items = [
    ["CAM-001", "กล้อง DSLR Canon 200D", "กล้อง", "ห้องสื่อ ชั้น 2"],
    ["CAM-002", "กล้อง Mirrorless Sony A6400", "กล้อง", "ห้องสื่อ ชั้น 2"],
    ["NB-001", "โน้ตบุ๊ก Lenovo ThinkPad", "โน้ตบุ๊ก", "ห้องคอมพิวเตอร์ 301"],
    ["NB-002", "โน้ตบุ๊ก ASUS Vivobook", "โน้ตบุ๊ก", "ห้องคอมพิวเตอร์ 301"],
    ["PJ-001", "โปรเจกเตอร์ Epson EB-X06", "โปรเจกเตอร์", "ห้องสื่อ ชั้น 2"],
    ["NET-001", "Router Cisco 2901", "อุปกรณ์เครือข่าย", "แล็บเครือข่าย"],
    ["MCU-001", "Arduino Uno Kit", "ไมโครคอนโทรลเลอร์", "แล็บอิเล็กทรอนิกส์"],
    ["MCU-002", "Raspberry Pi 4 Kit", "ไมโครคอนโทรลเลอร์", "แล็บอิเล็กทรอนิกส์"],
  ];
  for (const [code, name, cat, location] of items) {
    await prisma.equipment.upsert({
      where: { code },
      update: {},
      create: { code, name, location, categoryId: catMap[cat] },
    });
  }
  console.log("Seed เสร็จแล้ว");
}

main().finally(() => prisma.$disconnect());
