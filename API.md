# API Reference

Base URL: `http://localhost:3001/api` — ส่ง token ใน header `Authorization: Bearer <token>`

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| POST | /auth/register | - | สมัครสมาชิก `{studentId, name, phone, email, password}` |
| POST | /auth/login | - | เข้าสู่ระบบด้วยรหัสนักศึกษาหรืออีเมล `{identifier, password}` |
| PATCH | /auth/profile | ผู้ใช้ | แก้ไขชื่อ เบอร์โทร และที่อยู่ติดต่อ (ไม่บังคับ, สูงสุด 500 ตัวอักษร) `{name, phone, address?}` |
| POST | /auth/forgot-password | - | ขออีเมลลิงก์ตั้งรหัสผ่านใหม่ `{email}` |
| POST | /auth/reset-password | - | ตั้งรหัสผ่านใหม่ด้วยลิงก์ `{token, newPassword}` |
| GET | /auth/me | ผู้ใช้ | ข้อมูลผู้ใช้ปัจจุบัน |
| GET | /categories | - | รายการหมวดหมู่ |
| POST | /categories | เจ้าหน้าที่ | เพิ่มหมวดหมู่ |
| GET | /equipment | - | ค้นหา (?q= &categoryId= &status=) |
| GET | /equipment/:id | - | รายละเอียด + ช่วงที่ถูกจอง |
| POST / PUT | /equipment, /equipment/:id | เจ้าหน้าที่ | เพิ่ม / แก้ไข |
| DELETE | /equipment/:id | ผู้ดูแล | ตัดจำหน่าย |
| POST | /support-requests | ผู้ใช้ | ส่งคำร้องแจ้งปัญหา `{category: EQUIPMENT|SYSTEM|OTHER, subject, description, equipmentId?}`; บันทึกคำร้องและแจ้งอีเมลผู้ดูแล |
| GET | /support-requests/mine | ผู้ใช้ | ดูคำร้องของตนเองพร้อมสถานะและวันที่ปิด |
| GET | /support-requests | ผู้ดูแล | ดูคำร้องแจ้งปัญหาล่าสุด 100 รายการ |
| PATCH | /support-requests/:id/status | ผู้ดูแล | อัปเดตสถานะ `{status: OPEN|IN_PROGRESS|RESOLVED}` และส่งอีเมลแจ้งผู้ร้อง |
| PATCH | /support-requests/:id/resolve | ผู้ดูแล | ปิดคำร้องแจ้งปัญหา (รองรับ API เดิม) |
| DELETE | /support-requests/:id | ผู้ดูแล | ลบคำร้องและเก็บประวัติการลบใน audit log |
| GET | /requests | ผู้ใช้ | ของตัวเอง (เจ้าหน้าที่เห็นทั้งหมด) |
| DELETE | /requests/:id | ผู้ดูแล | ลบรายการที่รับคืนแล้วทั้งรายการ รวมข้อมูลติดตามและภาพ พร้อมเก็บ audit log |
| GET | /requests/overdue-followups | เจ้าหน้าที่ | รายการที่เกินกำหนดอย่างน้อย 3 วัน พร้อมช่องทางติดต่อและประวัติการติดตาม |
| POST | /requests/:id/overdue-contact | เจ้าหน้าที่ | บันทึกการติดตาม `{method: PHONE|EMAIL, note}` |
| POST | /requests/:id/overdue-review | ผู้ดูแล | บันทึกผลตรวจสอบรายการเกินกำหนด 7 วัน `{note}` |
| POST | /requests | ผู้ใช้ | ขอยืม `{equipmentId, borrowDate, dueDate, purpose, agreementAccepted: true}` (3–7 วัน) |
| PATCH | /requests/:id/cancel | เจ้าของ | ยกเลิก (เฉพาะ PENDING) |
| PATCH | /requests/:id/approve | เจ้าหน้าที่ | อนุมัติ |
| PATCH | /requests/:id/reject | เจ้าหน้าที่ | ปฏิเสธ `{note}` |
| POST | /requests/:id/pickup-code | เจ้าของคำขอ | สร้างรหัสรับอุปกรณ์ 6 หลัก ใช้ครั้งเดียว อายุ 10 นาที |
| PATCH | /requests/:id/handout | เจ้าหน้าที่ | ส่งมอบพร้อมภาพและรหัสรับอุปกรณ์ `{pickupCode, photo: dataURL}`; รหัสผิดได้ไม่เกิน 5 ครั้ง |
| POST | /requests/:id/return-submission | เจ้าของคำขอ | ส่งรูปและหมายเหตุยืนยันเวลาส่งคืน `{photo: dataURL, note?}`; รอเจ้าหน้าที่ตรวจรับ |
| PATCH | /requests/:id/return | เจ้าหน้าที่ | ตรวจรับคืนพร้อมภาพหลังตรวจ `{condition: GOOD|DAMAGED, photo: dataURL, note?}`; ต้องมีรูปยืนยันคืนจากผู้ยืมก่อน |
| GET | /requests/:id/photos/:kind | เจ้าของคำขอ/เจ้าหน้าที่ | ดูภาพ `kind=handout|borrower-return|return` |
| GET | /requests/eligibility | ผู้ใช้ | ตรวจสอบว่าสามารถยืมได้หรือไม่ |
| GET | /requests/incidents?status=OPEN | เจ้าหน้าที่ | รายการเคสติดตาม |
| POST | /requests/:id/incidents | เจ้าหน้าที่ | เปิดเคส `{type: LOST|UNREACHABLE, note, estimatedValue?}` |
| PATCH | /requests/incidents/:incidentId/recover | เจ้าหน้าที่ | บันทึกอุปกรณ์สูญหายที่พบคืน `{condition: GOOD|DAMAGED, recoveryNote, photo}`; เคสยังรอผู้ดูแลปิด |
| PATCH | /requests/incidents/:incidentId/resolve | ผู้ดูแล | ยืนยันปิดเคส `{resolutionNote}` |
| GET | /dashboard/stats | เจ้าหน้าที่ | สถิติ |
| GET | /users | ผู้ดูแล | รายชื่อผู้ใช้ |
| GET | /users/audit | ผู้ดูแล | ประวัติการเปลี่ยนแปลง (`limit`, `offset`) |

ที่อยู่ติดต่อเป็นข้อมูลส่วนบุคคล ใช้สำหรับติดตามคำขอยืมเท่านั้น โดยจะแสดงในหน้าจัดการคำขอและรายการติดตามแก่เจ้าหน้าที่/ผู้ดูแลระบบ ไม่แสดงในรายชื่อผู้ใช้ทั่วไป
| PATCH | /users/:id/role | ผู้ดูแล | เปลี่ยนบทบาท |

## สถานะคำขอ

`PENDING → APPROVED → BORROWED → OVERDUE → RETURNED` (แยก: `REJECTED`, `CANCELLED`, `LOST`) โดยระบบเปลี่ยนเป็น `OVERDUE` เมื่อพ้นกำหนดคืน 1 วัน รายการสถานะ `BORROWED` และ `OVERDUE` ยังส่งหลักฐานคืนและให้เจ้าหน้าที่ตรวจรับได้ตามปกติ

ผู้ยืมที่มีรายการเกินกำหนด, คำขอ `LOST` ที่อุปกรณ์ยังไม่ได้รับคืน, หรือมีเคสติดตามที่ยังเปิดอยู่ จะขอยืมหรือรับอนุมัติคำขอใหม่ไม่ได้ การรับคืนแบบชำรุดจะเปิดเคสติดตามและส่งอุปกรณ์เข้าซ่อม ส่วนการแจ้งสูญหายจะเปลี่ยนคำขอเป็น `LOST` และอุปกรณ์เป็น `RETIRED` เคสปิดได้โดยผู้ดูแลระบบพร้อมบันทึกผลการติดตามเท่านั้น

หากพบอุปกรณ์สูญหาย เจ้าหน้าที่บันทึกการพบพร้อมภาพและตรวจสภาพ: `GOOD` จะคืนคำขอเป็น `RETURNED` และอุปกรณ์เป็น `AVAILABLE`; `DAMAGED` จะคืนคำขอเป็น `RETURNED` และอุปกรณ์เป็น `REPAIR` พร้อมเปิดเคสชำรุดแยกต่างหาก ประวัติเคสสูญหายยังคงอยู่และต้องให้ผู้ดูแลยืนยันปิด

## เพิ่มเติม

| Method | Path | สิทธิ์ | หน้าที่ |
|---|---|---|---|
| POST | /auth/change-password | ผู้ใช้ | เปลี่ยนรหัสผ่านตัวเอง `{oldPassword, newPassword}` |
| DELETE | /equipment/:id | เจ้าหน้าที่ | ลบอุปกรณ์ (ถ้าเคยมีประวัติยืมจะตัดจำหน่ายแทน) |
| DELETE | /users/:id | ผู้ดูแล | ลบผู้ใช้ (ลบตัวเอง/แอดมินคนสุดท้าย/คนที่มีคำขอค้างไม่ได้) |
| GET | /requests/fine-rate | ผู้ใช้ | อัตราค่าปรับต่อวัน |
| PATCH | /requests/:id/pay-fine | เจ้าหน้าที่ | บันทึกว่าชำระค่าปรับแล้ว |

## ค่าปรับ

คืนเกินกำหนดปรับวันละ `FINE_PER_DAY` บาท (ค่าเริ่มต้น 20) นับเป็นวัน ปัดเศษขึ้น คำนวณตอนเจ้าหน้าที่กดรับคืน เก็บใน `fineAmount` ระหว่างที่ยังไม่คืนจะแสดงค่าปรับสะสมให้เห็น

## ระบบติดตามการคืน

เมื่อกำหนดค่า `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` และ `SMTP_FROM` ครบ ระบบตรวจทุกชั่วโมงและส่งอีเมลแบบไม่ซ้ำตามกำหนดคืน:

1. 24 ชั่วโมงก่อนกำหนดคืน ส่งอีเมลเตรียมคืนให้ผู้ยืม
2. เมื่อถึงกำหนดคืน ส่งอีเมลแจ้งวันครบกำหนดให้ผู้ยืม
3. เกินกำหนด 1 วัน เปลี่ยนสถานะเป็น `OVERDUE` และส่งอีเมลให้ผู้ยืมกับเจ้าหน้าที่
4. เกินกำหนด 3 วัน ส่งอีเมลให้เจ้าหน้าที่และแสดงรายการติดตามพร้อมเบอร์โทร/อีเมลในหน้าจัดการคำขอ เจ้าหน้าที่กดโทรหรืออีเมลเพื่อเริ่มติดต่อ แล้วบันทึกผลการติดตามในระบบ
5. เกินกำหนด 7 วัน ส่งอีเมลให้ผู้ดูแลระบบ และแสดงรายการให้ผู้ดูแลบันทึกผลตรวจสอบตามระเบียบมหาวิทยาลัย

การเปลี่ยนสถานะเป็น `OVERDUE` ยังทำงานได้แม้ไม่ได้ตั้งค่า SMTP; อีเมลจะถูกปิดใช้งานจนกว่าจะตั้งค่าถูกต้อง ผู้รับการแจ้งเตือนเจ้าหน้าที่และผู้ดูแลคือบัญชีที่มีบทบาท `STAFF` และ `ADMIN` ตามลำดับ
