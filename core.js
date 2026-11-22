// ตัวแปรกลาง, ฟังก์ชันช่วย, เมนูนำทาง

const API = "/api";
let token = localStorage.getItem("token");
let me = null;
let tab = "equipment";

const STATUS_TH = { AVAILABLE:"ว่าง", BORROWED:"ถูกยืม", REPAIR:"ซ่อมบำรุง", RETIRED:"ตัดจำหน่าย",
  RESERVED:"จองแล้ว", PENDING:"รออนุมัติ", APPROVED:"อนุมัติแล้ว", REJECTED:"ปฏิเสธ", OVERDUE:"เกินกำหนด", RETURNED:"คืนแล้ว", CANCELLED:"ยกเลิก", LOST:"สูญหาย" };
const ROLE_TH = { STUDENT:"ผู้ยืม", STAFF:"เจ้าหน้าที่", ADMIN:"ผู้ดูแลระบบ" };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const money = (n) => Number(n || 0).toLocaleString("th-TH") + " บาท";
const fmt = (d) => d ? new Date(d).toLocaleString("th-TH", { dateStyle:"medium", timeStyle:"short" }) : "-";
const isStaff = () => me && me.role !== "STUDENT";

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.style.display = "block"; setTimeout(() => (t.style.display = "none"), 2800); }

async function api(path, method = "GET", body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { logout(); }
  if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
  return data;
}
const act = async (fn, okMsg) => { try { await fn(); if (okMsg) toast(okMsg); render(); } catch (e) { toast(e.message); } };

let requestPhotoUrls = [];

function releaseRequestPhotoUrls() {
  requestPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  requestPhotoUrls = [];
}

async function requestPhotoUrl(requestId, kind) {
  const res = await fetch(`${API}/requests/${encodeURIComponent(requestId)}/photos/${kind}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "โหลดรูปภาพไม่สำเร็จ");
  }
  const url = URL.createObjectURL(await res.blob());
  requestPhotoUrls.push(url);
  return url;
}

async function equipmentPhotoData(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("รองรับรูปภาพ JPG, PNG หรือ WebP เท่านั้น");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const photo = canvas.toDataURL("image/jpeg", 0.78);
  if (photo.length > 2_000_000) throw new Error("รูปใหญ่เกินไป กรุณาถ่ายภาพใหม่");
  return photo;
}

function logout() { token = null; me = null; localStorage.removeItem("token"); render(); }

function renderNav() {
  const nav = $("#nav");
  if (!me) { nav.innerHTML = ""; return; }
  const tabs = [["equipment","อุปกรณ์"], ["my","คำขอของฉัน"], ["support","แจ้งปัญหา"], ["profile","ข้อมูลผู้ยืม"], ["password","เปลี่ยนรหัสผ่าน"]];
  if (isStaff()) tabs.push(["staff","จัดการคำขอ"], ["manage","จัดการอุปกรณ์"]);
  if (me.role === "ADMIN") tabs.push(["support-admin","คำร้องแจ้งปัญหา"], ["users","ผู้ใช้"]);
  nav.innerHTML = tabs.map(([k, l]) => `<button class="${tab===k?"active":""}" data-tab="${k}">${l}</button>`).join("")
    + `<button data-logout>ออกจากระบบ (${esc(me.name)} · ${ROLE_TH[me.role]})</button>`;
  nav.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); }));
  nav.querySelector("[data-logout]").onclick = logout;
}
