// แบบฟอร์มแจ้งปัญหาสำหรับผู้ใช้ที่เข้าสู่ระบบ

const SUPPORT_STATUS_TH = {
  OPEN: "รอตรวจสอบ",
  IN_PROGRESS: "กำลังดำเนินการ",
  RESOLVED: "ดำเนินการเสร็จแล้ว",
};

async function renderSupport() {
  const [equipment, requests] = await Promise.all([api("/equipment"), api("/support-requests/mine")]);
  $("#app").innerHTML = `<section class="card">
    <h3>แจ้งปัญหา</h3>
    <p class="muted">ส่งคำร้องให้ผู้ดูแลระบบ โดยระบบจะบันทึกคำร้องและแจ้งเตือนทางอีเมล</p>
    <form id="support-form">
      <label>ประเภทปัญหา</label>
      <select name="category" required>
        <option value="EQUIPMENT">อุปกรณ์</option>
        <option value="SYSTEM">ระบบ</option>
        <option value="OTHER">อื่น ๆ</option>
      </select>
      <label>อุปกรณ์ที่เกี่ยวข้อง (ถ้ามี)</label>
      <select name="equipmentId">
        <option value="">ไม่ระบุ</option>
        ${equipment.map((item) => `<option value="${esc(item.id)}">${esc(item.name)} (${esc(item.code)})</option>`).join("")}
      </select>
      <label>หัวข้อ</label>
      <input name="subject" maxlength="120" minlength="3" required placeholder="สรุปปัญหาที่พบ">
      <label>รายละเอียด</label>
      <textarea name="description" rows="5" maxlength="3000" minlength="10" required placeholder="อธิบายปัญหาและสิ่งที่ต้องการให้ช่วยตรวจสอบ"></textarea>
      <div class="row"><button class="btn" type="submit">ส่งคำร้อง</button></div>
      <p id="support-status" class="muted" role="status"></p>
    </form>
  </section>
  <section class="card" style="margin-top:14px">
    <h3>คำร้องของฉัน</h3>
    ${requests.length ? requests.map((request) => `<article class="card" style="margin:10px 0">
      <div class="row" style="justify-content:space-between">
        <b>${esc(request.subject)}</b>
        <span class="badge ${request.status}">${SUPPORT_STATUS_TH[request.status] || "ไม่ทราบสถานะ"}</span>
      </div>
      <div class="muted">ส่งเมื่อ ${fmt(request.createdAt)} · ${request.category === "EQUIPMENT" ? "อุปกรณ์" : request.category === "SYSTEM" ? "ระบบ" : "อื่น ๆ"}</div>
      ${request.equipment ? `<div class="muted">อุปกรณ์: ${esc(request.equipment.name)} (${esc(request.equipment.code)})</div>` : ""}
      <p style="white-space:pre-wrap">${esc(request.description)}</p>
      ${request.resolvedAt ? `<div class="muted">ปิดเมื่อ ${fmt(request.resolvedAt)}</div>` : ""}
    </article>`).join("") : '<p class="muted">ยังไม่มีคำร้องแจ้งปัญหา</p>'}
  </section>`;

  $("#support-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const status = $("#support-status");
    submit.disabled = true;
    status.textContent = "กำลังส่งคำร้อง...";
    try {
      const result = await api("/support-requests", "POST", {
        category: form.elements.category.value,
        equipmentId: form.elements.equipmentId.value || null,
        subject: form.elements.subject.value.trim(),
        description: form.elements.description.value.trim(),
      });
      const message = result.notificationSent
        ? `ส่งคำร้อง ${result.id} และแจ้งเตือนผู้ดูแลทางอีเมลแล้ว`
        : `บันทึกคำร้อง ${result.id} แล้ว แต่แจ้งเตือนทางอีเมลไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบโดยตรง`;
      await renderSupport();
      $("#support-status").textContent = message;
    } catch (error) {
      status.textContent = error.message;
      toast(error.message);
    } finally {
      submit.disabled = false;
    }
  };
}

async function renderSupportAdmin() {
  const requests = await api("/support-requests");
  $("#app").innerHTML = `<section class="card">
    <h3>จัดการคำร้องแจ้งปัญหา</h3>
    <p class="muted">ตรวจสอบข้อมูลผู้แจ้งและอัปเดตสถานะ ระบบจะแจ้งผู้ใช้ทางอีเมลเมื่อสถานะเปลี่ยน</p>
    ${requests.length ? requests.map((request) => `<article class="card" style="margin:10px 0">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>${esc(request.subject)}</b>
        <span class="badge ${request.status}">${SUPPORT_STATUS_TH[request.status] || "ไม่ทราบสถานะ"}</span>
      </div>
      <div class="muted">ส่งเมื่อ ${fmt(request.createdAt)} · ผู้แจ้ง: ${esc(request.reporterName)} · <a href="mailto:${encodeURIComponent(request.reporterEmail)}">${esc(request.reporterEmail)}</a></div>
      <div class="muted">ประเภท: ${request.category === "EQUIPMENT" ? "อุปกรณ์" : request.category === "SYSTEM" ? "ระบบ" : "อื่น ๆ"}${request.equipment ? ` · อุปกรณ์: ${esc(request.equipment.name)} (${esc(request.equipment.code)})` : ""}</div>
      <p style="white-space:pre-wrap">${esc(request.description)}</p>
      ${request.resolvedAt ? `<div class="muted">ดำเนินการเสร็จเมื่อ ${fmt(request.resolvedAt)}</div>` : ""}
      <label for="support-status-${esc(request.id)}">อัปเดตสถานะ</label>
      <select id="support-status-${esc(request.id)}" data-support-status="${esc(request.id)}">
        ${Object.entries(SUPPORT_STATUS_TH).map(([status, label]) => `<option value="${status}" ${status === request.status ? "selected" : ""}>${label}</option>`).join("")}
      </select>
      <button class="btn bad sm" type="button" data-delete-support="${esc(request.id)}" data-subject="${esc(request.subject)}">ลบคำร้อง</button>
    </article>`).join("") : '<p class="muted">ยังไม่มีคำร้องแจ้งปัญหา</p>'}
  </section>`;

  document.querySelectorAll("[data-delete-support]").forEach((button) => {
    button.onclick = async () => {
      if (!confirm(`ยืนยันลบคำร้อง "${button.dataset.subject}"?\nเมื่อลบแล้ว ผู้ใช้จะไม่เห็นคำร้องนี้ในประวัติอีก`)) return;
      button.disabled = true;
      try {
        await api(`/support-requests/${button.dataset.deleteSupport}`, "DELETE");
      } catch (error) {
        toast(error.message);
        button.disabled = false;
        return;
      }
      try {
        await renderSupportAdmin();
        toast("ลบคำร้องแล้ว");
      } catch (error) {
        toast(`ลบคำร้องแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ: ${error.message}`);
      }
    };
  });

  document.querySelectorAll("[data-support-status]").forEach((select) => {
    select.onchange = async () => {
      const previousStatus = requests.find((request) => request.id === select.dataset.supportStatus)?.status;
      if (select.value === previousStatus) return;
      select.disabled = true;
      let result;
      try {
        result = await api(`/support-requests/${select.dataset.supportStatus}/status`, "PATCH", { status: select.value });
      } catch (error) {
        toast(error.message);
        select.value = previousStatus;
        select.disabled = false;
        return;
      }
      const badge = select.closest("article").querySelector(".badge");
      badge.className = `badge ${result.status}`;
      badge.textContent = SUPPORT_STATUS_TH[result.status];
      toast(result.notificationSent
        ? "อัปเดตสถานะและส่งอีเมลแจ้งผู้ใช้แล้ว"
        : "อัปเดตสถานะแล้ว แต่ส่งอีเมลแจ้งผู้ใช้ไม่สำเร็จ");
      try {
        await renderSupportAdmin();
      } catch (error) {
        toast(`อัปเดตสถานะแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ: ${error.message}`);
      }
    };
  });
}
