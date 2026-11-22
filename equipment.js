// หน้ารายการอุปกรณ์ + ฟอร์มขอยืม (ผู้ยืม)

let equipmentRefreshTimer = null;

async function renderEquipment() {
  if (equipmentRefreshTimer) clearInterval(equipmentRefreshTimer);
  const [cats, initialItems, eligibility] = await Promise.all([
    api("/categories"),
    api("/equipment"),
    me?.role === "STUDENT" ? api("/requests/eligibility") : Promise.resolve({ allowed: true, reason: null }),
  ]);
  let items = initialItems;
  $("#app").innerHTML = `
  ${!eligibility.allowed ? `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--bad)"><b>ระงับการยืมชั่วคราว</b><div class="muted">${esc(eligibility.reason)}</div></div>` : ""}
  <div class="card" style="margin-bottom:14px"><div class="row">
    <div><label>ค้นหา</label><input id="q" placeholder="ชื่อหรือรหัสอุปกรณ์"></div>
    <div><label>หมวดหมู่</label><select id="cat"><option value="">ทั้งหมด</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
    <div><label>สถานะ</label><select id="st"><option value="">ทั้งหมด</option><option value="AVAILABLE">ว่าง</option><option value="BORROWED">ถูกยืมหรือจองแล้ว</option><option value="REPAIR">ซ่อมบำรุง</option></select></div>
  </div></div>
  <div class="grid" id="list"></div>`;
  const draw = () => {
    const q = $("#q").value.toLowerCase(), c = $("#cat").value, s = $("#st").value;
    const f = items.filter((i) => i.status !== "RETIRED" && (!q || (i.name + i.code).toLowerCase().includes(q)) && (!c || i.categoryId === c) && (!s || (s === "BORROWED" ? ["BORROWED", "RESERVED"].includes(i.status) : i.status === s)));
    $("#list").innerHTML = f.length ? f.map((i) => `
      <div class="card"><div class="row" style="justify-content:space-between"><b>${esc(i.name)}</b><span class="badge ${i.status}" style="flex:0">${i.status === "RESERVED" ? "จองแล้ว" : i.status === "BORROWED" ? "กำลังยืม" : STATUS_TH[i.status]}</span></div>
      <p class="muted">${esc(i.code)} · ${esc(i.category.name)}<br>📍 ${esc(i.location || "-")}</p>
      ${i.status === "RESERVED" ? '<p class="muted">มีคำขออนุมัติแล้ว รอส่งมอบอุปกรณ์</p>' : ""}
      <button class="btn sm" data-req="${i.id}" ${i.status !== "AVAILABLE" || !eligibility.allowed ? "disabled" : ""}>${i.status === "BORROWED" ? "กำลังยืม" : i.status === "RESERVED" ? "จองแล้ว" : i.status === "REPAIR" ? "กำลังซ่อม" : !eligibility.allowed ? "ระงับการยืม" : "ขอยืม"}</button></div>`).join("") : `<p class="muted">ไม่พบอุปกรณ์</p>`;
    document.querySelectorAll("[data-req]").forEach((b) => (b.onclick = () => openRequestDialog(items.find((i) => i.id === b.dataset.req))));
  };
  ["q","cat","st"].forEach((id) => ($("#" + id).oninput = draw)); draw();

  equipmentRefreshTimer = setInterval(async () => {
    if (tab !== "equipment") {
      clearInterval(equipmentRefreshTimer);
      equipmentRefreshTimer = null;
      return;
    }
    try {
      items = await api("/equipment");
      draw();
    } catch (err) {
      clearInterval(equipmentRefreshTimer);
      equipmentRefreshTimer = null;
      toast(err.message);
    }
  }, 5000);
}

async function openRequestDialog(item) {
  const eligibility = await api("/requests/eligibility");
  if (!eligibility.allowed) {
    toast(eligibility.reason);
    return;
  }
  if (!me.phone) {
    toast("กรุณาเพิ่มเบอร์โทรศัพท์ในหน้าโปรไฟล์ก่อนยืม");
    tab = "profile";
    render();
    return;
  }
  const detail = await api("/equipment/" + item.id);
  const { perDay } = await api("/requests/fine-rate");
  const booked = detail.requests.map((r) => `${fmt(r.borrowDate)} – ${fmt(r.dueDate)}`).join("<br>") || "ยังไม่มีการจอง";
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const val = (d) => new Date(+now + d * 86400000).toISOString().slice(0, 16);
  const dlg = $("#dlg");
  dlg.innerHTML = `<form method="dialog" id="rf"><h3>ขอยืม: ${esc(item.name)}</h3>
    <div class="muted">ผู้ยืม: ${esc(me.name)} · รหัส ${esc(me.studentId)}<br>โทร ${esc(me.phone)} · ${esc(me.email)}</div>
    <p class="muted">ช่วงที่ถูกจองแล้ว:<br>${booked}</p>
    <p class="muted">⚠ คืนเกินกำหนดปรับวันละ ${perDay} บาท (นับเป็นวัน ปัดเศษขึ้น)</p>
    <label>วันที่รับ</label><input type="datetime-local" name="borrowDate" value="${val(0)}" required>
    <label>วันที่และเวลาที่กำหนดคืน (3–7 วัน)</label><input type="datetime-local" name="dueDate" value="${val(3)}" required>
    <label>วัตถุประสงค์</label><textarea name="purpose" rows="2"></textarea>
    <label style="display:flex;gap:8px;align-items:flex-start;margin:14px 0">
      <input type="checkbox" name="agreementAccepted" required style="width:auto;margin-top:4px">
      <span>ข้าพเจ้ารับทราบและยอมรับเงื่อนไขการยืม จะคืนอุปกรณ์ตามกำหนด และรับผิดชอบกรณีสูญหายหรือเสียหายตามระเบียบของมหาวิทยาลัย</span>
    </label>
    <div class="row"><button type="button" class="btn sec" id="cx">ยกเลิก</button><button class="btn" id="sb" value="x">ส่งคำขอ</button></div></form>`;
  dlg.showModal();
  $("#cx").onclick = () => dlg.close();
  $("#rf").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const durationDays = (new Date(d.dueDate) - new Date(d.borrowDate)) / 86400000;
    if (durationDays < 3 || durationDays > 7) return toast("กำหนดระยะเวลายืมได้ตั้งแต่ 3 ถึง 7 วัน");
    try {
      await api("/requests", "POST", {
        equipmentId: item.id,
        borrowDate: new Date(d.borrowDate).toISOString(),
        dueDate: new Date(d.dueDate).toISOString(),
        purpose: d.purpose,
        agreementAccepted: e.target.elements.agreementAccepted.checked,
      });
      dlg.close(); toast("ส่งคำขอแล้ว รอเจ้าหน้าที่อนุมัติ"); tab = "my"; render();
    } catch (err) { toast(err.message); }
  };
}
