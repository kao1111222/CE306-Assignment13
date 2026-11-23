# ระบบยืม-คืนอุปกรณ์มหาวิทยาลัย

เว็บแอปสำหรับจัดการการยืมและคืนอุปกรณ์ภายในมหาวิทยาลัย ครอบคลุมการสมัครสมาชิก การอนุมัติคำขอ การส่งมอบ การคืนอุปกรณ์ การติดตามอุปกรณ์เกินกำหนด การแจ้งเหตุ และการแจ้งปัญหา รูปแบบหน้าเว็บใช้แนว 8-bit พร้อมระบบขนาดเต็มที่เสิร์ฟจาก Express

## เทคโนโลยี

- Frontend: HTML, CSS และ JavaScript แบบ vanilla
- Backend: Node.js, Express 5 และ TypeScript
- Database: PostgreSQL และ Prisma 7
- Authentication: JSON Web Token (JWT)
- Email: Nodemailer ผ่าน SMTP

## โครงสร้างโปรเจกต์

```text
un/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── lib/
│   │   └── server.ts
│   ├── uploads/request-photos/
│   ├── .env
│   └── .env.example
└── frontend/
    ├── index.html
    ├── css/
    └── js/
```

เอกสาร API อยู่ที่ [docs/API.md](docs/API.md)

## ความต้องการของระบบ

- Node.js เวอร์ชัน LTS
- npm
- PostgreSQL

## การติดตั้งและรัน

1. เปิด PostgreSQL และสร้างฐานข้อมูล เช่น `project1`
2. เข้าโฟลเดอร์ backend และติดตั้ง dependencies

```powershell
cd backend
npm install
```

3. คัดลอกไฟล์ตั้งค่า

```powershell
Copy-Item .env.example .env
```

4. แก้ไข `backend/.env` โดยกำหนด PostgreSQL URL และ JWT secret ของระบบ ห้ามใช้ secret หรือรหัสผ่านจริงที่ใช้ในระบบอื่น

5. สร้าง Prisma Client, ซิงก์ schema และเพิ่มข้อมูลเริ่มต้น

```powershell
npx prisma generate
npx prisma db push
npm run db:seed
```

6. เริ่มเซิร์ฟเวอร์

```powershell
npm run dev
```

เปิดเว็บไซต์ที่ <http://localhost:3001>

> ต้องเปิดผ่าน backend ไม่ใช่เปิด `frontend/index.html` ด้วย Live Server เพราะหน้าเว็บจะเรียก API ที่ `/api`

## ตัวแปรสภาพแวดล้อม

เพิ่มหรือแก้ไขค่าเหล่านี้ใน `backend/.env`

| ตัวแปร | จำเป็น | ค่าเริ่มต้น | ใช้สำหรับ |
|---|---:|---:|---|
| `DATABASE_URL` | ใช่ | - | เชื่อมต่อ PostgreSQL |
| `PORT` | ไม่ | `3001` | พอร์ตของ Express server |
| `JWT_SECRET` | ใช่ใน production | `dev-secret-change-me` | ลงนาม JWT |
| `FINE_PER_DAY` | ไม่ | `20` | ค่าปรับคืนเกินกำหนดต่อวัน (บาท) |
| `APP_URL` | ไม่ | `http://localhost:3001` | URL ในลิงก์รีเซ็ตรหัสผ่าน |
| `SEED_ADMIN_PASSWORD` | ไม่ | สุ่มระหว่าง seed | กำหนดรหัสผ่านบัญชีผู้ดูแลเริ่มต้น |
| `SEED_STAFF_PASSWORD` | ไม่ | สุ่มระหว่าง seed | กำหนดรหัสผ่านบัญชีเจ้าหน้าที่เริ่มต้น |
| `SMTP_HOST` | ไม่ | - | SMTP server |
| `SMTP_PORT` | ไม่ | `587` | พอร์ต SMTP |
| `SMTP_USER` | ไม่ | - | บัญชี SMTP |
| `SMTP_PASS` | ไม่ | - | รหัสผ่านหรือ App Password ของ SMTP |
| `SMTP_FROM` | ไม่ | - | ผู้ส่งที่แสดงในอีเมล |

ตัวอย่าง:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/project1?schema=public"
PORT=3001
JWT_SECRET="replace-with-a-long-random-secret"
FINE_PER_DAY=20

APP_URL=http://localhost:3001
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="ระบบยืม-คืนอุปกรณ์ <your-email@gmail.com>"

SEED_ADMIN_PASSWORD="change-me"
SEED_STAFF_PASSWORD="change-me"
```

## บัญชีเริ่มต้น

คำสั่ง `npm run db:seed` สร้างข้อมูลหมวดหมู่ อุปกรณ์ และบัญชีดังนี้:

| บทบาท | อีเมล | รหัสนักศึกษา |
|---|---|---|
| ผู้ดูแลระบบ | `admin@uni.ac.th` | `admin` |
| เจ้าหน้าที่ | `staff@uni.ac.th` | `staff` |

- หากกำหนด `SEED_ADMIN_PASSWORD` และ `SEED_STAFF_PASSWORD` จะใช้รหัสผ่านเหล่านั้น
- หากไม่กำหนด ระบบจะสุ่มรหัสผ่านตอน seed ครั้งแรกและแสดงรหัสผ่านใน terminal เพียงตอนสร้างบัญชี
- ใน production ต้องเปลี่ยนรหัสผ่านเริ่มต้นและตั้ง `JWT_SECRET` ที่แข็งแรง
- ผู้ใช้ทั่วไปสมัครสมาชิกได้เองจากหน้าล็อกอิน โดยมีบทบาท `STUDENT`

## การใช้ระบบ

### ผู้ยืม

- ค้นหาและดูรายละเอียดอุปกรณ์ พร้อมช่วงเวลาที่ถูกจอง
- ส่งคำขอยืมระยะเวลา 3–7 วันและยืนยันข้อตกลง
- ยกเลิกคำขอที่ยังอยู่ในสถานะ `PENDING`
- ขอรหัสรับอุปกรณ์ 6 หลักหลังคำขอได้รับอนุมัติ รหัสมีอายุ 10 นาที ใช้ครั้งเดียว
- แก้ไขชื่อ เบอร์โทร ที่อยู่ และเปลี่ยนรหัสผ่านในหน้าข้อมูลส่วนตัว
- ส่งหลักฐานรูปถ่ายพร้อมหมายเหตุเมื่อยืนยันการส่งคืน
- ใช้ลิงก์ลืมรหัสผ่านเพื่อขอรีเซ็ตผ่านอีเมล ลิงก์มีอายุ 30 นาทีและใช้ได้ครั้งเดียว
- ส่งคำร้องแจ้งปัญหาและติดตามสถานะได้ที่หน้าคำร้องของฉัน

### เจ้าหน้าที่

- สร้างและแก้ไขหมวดหมู่และอุปกรณ์
- อนุมัติหรือปฏิเสธคำขอยืม
- ตรวจรหัสรับอุปกรณ์และถ่ายภาพสภาพก่อนส่งมอบ
- ตรวจภาพยืนยันส่งคืนจากผู้ยืมและถ่ายภาพรับคืนพร้อมบันทึกสภาพ
- บันทึกเคสชำรุด สูญหาย หรือติดต่อผู้ยืมไม่ได้
- บันทึกการติดตามสำหรับคำขอเกินกำหนด

### ผู้ดูแลระบบ

- จัดการบทบาทและบัญชีผู้ใช้
- ดูประวัติ audit log
- จัดการคำร้องแจ้งปัญหา
- บันทึกผลตรวจสอบรายการเกินกำหนด 7 วัน
- ยืนยันปิดเคสสูญหายหรือชำรุด
- ลบข้อมูลคำขอหรือผู้ใช้เมื่อเงื่อนไขในระบบอนุญาต

## สถานะคำขอ

```text
PENDING -> APPROVED -> BORROWED -> OVERDUE -> RETURNED
              |                       |
              +-> REJECTED            +-> LOST
PENDING -> CANCELLED
```

- Scheduler ตรวจรายการคืนอุปกรณ์ทุกชั่วโมง
- สถานะจะเปลี่ยนเป็น `OVERDUE` เมื่อเกินกำหนดคืนตั้งแต่ 1 วัน
- ระบบส่งอีเมลเตือนก่อนกำหนด 24 ชั่วโมง วันครบกำหนด และเกินกำหนด 1, 3 และ 7 วัน เมื่อ SMTP ถูกตั้งค่า
- หากยังไม่มี SMTP การเปลี่ยนสถานะเกินกำหนดและรายการติดตามในเว็บไซต์ยังทำงานปกติ
- ค่าปรับคืนเกินกำหนดคำนวณจากจำนวนวันปัดเศษขึ้นแล้วคูณ `FINE_PER_DAY` ขณะเจ้าหน้าที่รับคืน
- ผู้ยืมที่มีรายการเกินกำหนด คำขอ `LOST` ที่ยังไม่มีเครื่องคืน หรือเคสติดตามที่ยังเปิดอยู่จะไม่สามารถส่งคำขอหรือรับอนุมัติคำขอใหม่ได้

## รูปภาพหลักฐาน

- รองรับ JPG, PNG และ WebP
- จำกัดไม่เกิน 1.5 MB ต่อรูป
- เก็บใน `backend/uploads/request-photos`
- เข้าดูได้เฉพาะเจ้าของคำขอหรือเจ้าหน้าที่/ผู้ดูแล
- รูปส่งคืนของผู้ยืมต้องถูกยืนยันก่อนเจ้าหน้าที่รับคืน

## คำสั่งที่ใช้บ่อย

```powershell
cd backend
npm install             # ติดตั้ง dependencies
npx prisma generate     # สร้าง Prisma Client
npx prisma db push      # ซิงก์ schema กับ PostgreSQL
npm run db:seed         # สร้างบัญชีและข้อมูลตัวอย่าง
npm run dev             # รันแบบ watch
npm run build           # ตรวจและ compile TypeScript
npm start               # รัน TypeScript ผ่าน tsx
```

เมื่อแก้ไข `prisma/schema.prisma` ให้รัน `npx prisma generate` และ `npx prisma db push`

## การแก้ปัญหา

| อาการ | วิธีแก้ |
|---|---|
| `Cannot find module ... generated/prisma/client.js` | รัน `npx prisma generate` |
| `TableDoesNotExist (P2021)` | ตรวจ `DATABASE_URL` แล้วรัน `npx prisma db push` |
| รันไม่พบ `package.json` | ย้ายเข้าโฟลเดอร์ `backend` ก่อน |
| เว็บเข้าไม่ได้หรือ login ไม่ได้ | รัน `npm run dev` และเปิด <http://localhost:3001> |
| `EADDRINUSE` | ปิดโปรเซสหรือ terminal เซิร์ฟเวอร์เก่า |
| หน้าค้าง/ข้อมูลไม่อัปเดต | กด `Ctrl+F5` และตรวจ console ของ browser |
| ไม่ได้รับอีเมล | ตรวจ SMTP ใน `backend/.env` และลองใช้ App Password |

เอกสาร API รายละเอียด: [docs/API.md](docs/API.md)
