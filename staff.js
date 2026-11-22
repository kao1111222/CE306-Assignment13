// หน้าเจ้าหน้าที่: อนุมัติ / ส่งมอบ / รับคืน + Dashboard

function openHandoutDialog(requestId) {
  const dlg = $("#dlg");
  dlg.innerHTML = `<form id="handout-form">
    <h3>ยืนยันตัวผู้รับและส่งมอบอุปกรณ์</h3>
    <p class="muted">ตรวจบัตรนักศึกษาก่อนรับมอบ แล้วกรอกรหัส 6 หลักที่ผู้ยืมแสดงให้ รหัสใช้ได้ครั้งเดียวและหมดอายุใน 10 นาที</p>
    <label>รหัสรับอุปกรณ์</label>
    <input name="pickupCode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6" autocomplete="one-time-code" required>
    <label>รูปสภาพอุปกรณ์ก่อนส่งมอบ</label>
    <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required>
    <div class="row"><button type="button" class="btn sec" id="cancel-handout">ยกเลิก</button>
      <button type="submit" class="btn">ยืนยันส่งมอบ</button></div>
    <p id="handout-status" class="muted" role="status"></p>
  </form>`;
  dlg.showModal();
  $("#cancel-handout").onclick = () => dlg.close();
  $("#handout-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const status = $("#handout-status");
    const pickupCode = form.elements.pickupCode.value.trim();
    const photoFile = form.elements.photo.files?.[0];
    if (!/^\d{6}$/.test(pickupCode)) {
      status.textContent = "กรอกรหัสรับอุปกรณ์ 6 หลัก";
      return;
    }
    if (!photoFile) {
      status.textContent = "กรุณาถ่ายหรือเลือกรูปสภาพอุปกรณ์ก่อนส่งมอบ";
      return;
    }
    submit.disabled = true;
    status.textContent = "กำลังตรวจรหัสและบันทึกรูปก่อนส่งมอบ...";
    try {
      const photo = await equipmentPhotoData(photoFile);
      await api(`/requests/${requestId}/handout`, "PATCH", { pickupCode, photo });
      dlg.close();
      toast("ยืนยันรหัสและบันทึกการส่งมอบแล้ว");
      await render();
    } catch (error) {
      status.textContent = error.message || "ส่งมอบไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่";
      submit.disabled = false;
    }
  };
}

function openReturnInspectionDialog(requestId, condition) {
  const damaged = condition === "DAMAGED";
  const dlg = $("#dlg");
  dlg.innerHTML = `<form id="return-inspection-form">
    <h3>${damaged ? "ตรวจรับคืนอุปกรณ์ (ชำรุด)" : "ตรวจรับคืนอุปกรณ์ (ปกติ)"}</h3>
    <p class="muted">ตรวจอุปกรณ์และรูปที่ผู้ยืมส่งมาก่อนยืนยัน กรุณาถ่ายรูปสภาพอุปกรณ์ขณะเจ้าหน้าที่รับคืน ระบบจะบันทึกเวลารับคืนเมื่อกดยืนยัน</p>
    ${damaged ? `<label>รายละเอียดความเสียหาย</label><textarea name="note" rows="3" minlength="3" required placeholder="ระบุส่วนที่เสียหายและอาการ"></textarea>
      <label>มูลค่าประเมิน (บาท, ถ้าทราบ)</label><input name="estimatedValue" type="number" min="0" step="1" placeholder="เว้นว่างได้">` : ""}
    <label>รูปสภาพอุปกรณ์ตอนเจ้าหน้าที่ตรวจรับ</label>
    <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required>
    <div class="row"><button type="button" class="btn sec" id="cancel-return-inspection">ยกเลิก</button>
      <button type="submit" class="btn ${damaged ? "warn" : "ok"}">${damaged ? "ยืนยันรับคืนและส่งซ่อม" : "ยืนยันรับคืน"}</button></div>
    <p id="return-inspection-status" class="muted" role="status"></p>
  </form>`;
  dlg.showModal();
  $("#cancel-return-inspection").onclick = () => dlg.close();
  $("#return-inspection-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const status = $("#return-inspection-status");
    const photoFile = form.elements.photo.files?.[0];
    if (!photoFile) {
      status.textContent = "กรุณาเลือกหรือถ่ายรูปอุปกรณ์ก่อนยืนยัน";
      return;
    }
    submit.disabled = true;
    status.textContent = "กำลังอัปโหลดรูปและบันทึกการตรวจรับ...";
    try {
      const photo = await equipmentPhotoData(photoFile);
      const note = damaged ? form.elements.note.value.trim() : undefined;
      const estimatedValue = damaged ? form.elements.estimatedValue.value : undefined;
      await api(`/requests/${requestId}/return`, "PATCH", {
        condition,
        photo,
        ...(damaged ? { note, estimatedValue } : {}),
      });
      dlg.close();
      toast(damaged ? "รับคืนแล้ว ส่งอุปกรณ์เข้าซ่อมและบันทึกเคสชำรุดแล้ว" : "รับคืนอุปกรณ์และบันทึกเวลาแล้ว");
      await render();
    } catch (error) {
      status.textContent = error.message || "บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่";
      submit.disabled = false;
    }
  };
}

async function renderStaff() {
  releaseRequestPhotoUrls();
  const [stats, rows, incidents, recoverableLost, overdueFollowups] = await Promise.all([
    api("/dashboard/stats"),
    api("/requests"),
    api("/requests/incidents"),
    api("/requests/incidents?status=RECOVERABLE"),
    api("/requests/overdue-followups"),
  ]);
  const photoUrls = new Map();
  await Promise.all(rows.flatMap((r) => ["handout", "borrower-return", "return"].map(async (kind) => {
    const photoField = { handout: "handoutPhoto", return: "returnPhoto", "borrower-return": "borrowerReturnPhoto" }[kind];
    if (!r[photoField]) return;
    photoUrls.set(`${r.id}:${kind}`, await requestPhotoUrl(r.id, kind));
  })));
  const photoMarkup = (r) => ["handout", "borrower-return", "return"].map((kind) => photoUrls.has(`${r.id}:${kind}`)
    ? `<a href="${photoUrls.get(`${r.id}:${kind}`)}" target="_blank" rel="noopener"><img src="${photoUrls.get(`${r.id}:${kind}`)}" alt="${kind === "handout" ? "สภาพก่อนส่งมอบ" : kind === "borrower-return" ? "ภาพยืนยันส่งคืนจากผู้ยืม" : "สภาพหลังเจ้าหน้าที่ตรวจรับ"}" style="width:64px;height:64px;object-fit:cover;border-radius:8px"><small>${kind === "handout" ? "ก่อนส่งมอบ" : kind === "borrower-return" ? "ผู้ยืมส่งคืน" : "เจ้าหน้าที่ตรวจรับ"}</small></a>`
    : "").join("");
  const todo = rows.filter((r) => ["PENDING", "APPROVED", "BORROWED", "OVERDUE"].includes(r.status) || (r.status === "RETURNED" && r.fineAmount > 0 && !r.finePaid));
  const returned = rows.filter((r) => r.status === "RETURNED");
  const activeLoanButtons = (r) => `${r.borrowerReturnSubmittedAt ? `<button class="btn ok sm" data-a="return" data-id="${r.id}">ตรวจรับคืน (ปกติ)</button> <button class="btn warn sm" data-a="return-bad" data-id="${r.id}">ตรวจรับคืน (ชำรุด)</button><div class="muted">ผู้ยืมส่งหลักฐาน ${fmt(r.borrowerReturnSubmittedAt)}${r.borrowerReturnNote ? `<br>${esc(r.borrowerReturnNote)}` : ""}</div>` : `<span class="muted">รอผู้ยืมแนบรูปยืนยันคืน</span>`}<div style="margin-top:5px"><button class="btn bad sm" data-a="lost" data-id="${r.id}">แจ้งสูญหาย</button> <button class="btn sm" data-a="unreachable" data-id="${r.id}">ติดต่อไม่ได้</button></div>`;
  const btns = (r) => ({
    PENDING: `<button class="btn ok sm" data-a="approve" data-id="${r.id}">อนุมัติ</button> <button class="btn bad sm" data-a="reject" data-id="${r.id}">ปฏิเสธ</button>`,
    APPROVED: `<button class="btn sm" data-a="handout" data-id="${r.id}">ส่งมอบ</button>`,
    RETURNED: `<button class="btn warn sm" data-a="payfine" data-id="${r.id}">รับชำระค่าปรับ ${money(r.fineAmount)}</button>`,
    BORROWED: activeLoanButtons(r),
    OVERDUE: activeLoanButtons(r),
  }[r.status]);
  $("#app").innerHTML = `
  <div class="stats">
    <div class="card stat"><b>${stats.pending}</b>รออนุมัติ</div><div class="card stat"><b>${stats.approved}</b>รอรับของ</div>
    <div class="card stat"><b>${stats.borrowed}</b>กำลังยืม</div><div class="card stat"><b style="color:var(--bad)">${stats.overdue}</b>เกินกำหนด</div>
    <div class="card stat"><b style="color:var(--bad)">${stats.openIncidents}</b>เคสติดตามเปิดอยู่</div>
    <div class="card stat"><b>${stats.lost}</b>อุปกรณ์สูญหาย</div>
    <div class="card stat"><b>${stats.equipment.available}/${stats.equipment.total}</b>อุปกรณ์ว่าง</div>
    <div class="card stat"><b style="color:var(--bad)">${money(stats.unpaidFines)}</b>ค่าปรับค้างชำระ</div>
  </div>
  <div class="card" style="margin-bottom:14px;border-left:4px solid var(--bad)">
    <h3>อุปกรณ์สูญหายที่ยังไม่ได้รับคืน (${recoverableLost.length})</h3>
    ${recoverableLost.length ? recoverableLost.map((incident) => `<article class="card" style="margin:10px 0">
      <div class="row"><div><b>${esc(incident.request.equipment.name)} (${esc(incident.request.equipment.code)})</b>
        <div>${esc(incident.request.borrowerName || incident.request.user.name)} · ${esc(incident.request.borrowerStudentId || incident.request.user.studentId)} · ${esc(incident.request.borrowerPhone || incident.request.user.phone || "-")}</div>
        ${incident.request.user.address ? `<div class="muted">ที่อยู่สำหรับติดต่อ: ${esc(incident.request.user.address)}</div>` : ""}
        <div class="muted">บันทึกสูญหาย ${fmt(incident.createdAt)} · ${esc(incident.note)}</div>
        ${incident.status === "RESOLVED" ? '<div class="muted">เคสเดิมปิดแล้ว แต่ยังไม่ได้บันทึกการพบอุปกรณ์</div>' : ""}
      </div>
      <button class="btn warn sm" data-recover="${incident.id}">บันทึกว่าพบอุปกรณ์แล้ว</button>
    </div></article>`).join("") : `<p class="muted">ไม่มีอุปกรณ์สูญหายที่รอรับคืน</p>`}
  </div>
  <div class="card table-wrap"><table><thead><tr><th>ผู้ยืม</th><th>อุปกรณ์</th><th>ช่วงเวลา</th><th>สถานะ</th><th></th></tr></thead><tbody>
  ${todo.map((r) => `<tr><td>${esc(r.borrowerName || r.user.name)}<div class="muted">${esc(r.borrowerStudentId || r.user.studentId)} · ${esc(r.borrowerPhone || r.user.phone || "-")} · ${esc(r.borrowerEmail || r.user.email)}</div>${r.user.address ? `<div class="muted">ที่อยู่สำหรับติดต่อ: ${esc(r.user.address)}</div>` : ""}</td><td>${esc(r.equipment.name)}<div class="muted">${esc(r.purpose || "")}</div>
   <div class="row">${photoMarkup(r)}</div></td>
   <td>${fmt(r.borrowDate)}<br>${fmt(r.dueDate)}</td><td><span class="badge ${r.status}">${STATUS_TH[r.status]}</span> ${r.overdue ? '<span class="badge overdue">เกินกำหนด</span>' : ""}${r.overdue ? `<div class="muted">ค่าปรับสะสม ${money(r.currentFine)}</div>` : ""}${r.fineAmount > 0 ? `<div class="muted">ค่าปรับ ${money(r.fineAmount)}</div>` : ""}</td><td>${btns(r)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">ไม่มีรายการค้าง</td></tr>`}
  </tbody></table></div>
  <div class="card table-wrap" style="margin-top:14px"><h3>ประวัติรับคืนและภาพตรวจสภาพ</h3><table><thead><tr><th>ผู้ยืม</th><th>อุปกรณ์</th><th>วันกำหนดคืน/วันรับคืน</th><th>สภาพและภาพ</th>${me.role === "ADMIN" ? "<th></th>" : ""}</tr></thead><tbody>
  ${returned.map((r) => `<tr><td>${esc(r.borrowerName || r.user.name)}<div class="muted">${esc(r.borrowerStudentId || r.user.studentId)} · ${esc(r.borrowerPhone || r.user.phone || "-")}</div>${r.user.address ? `<div class="muted">ที่อยู่สำหรับติดต่อ: ${esc(r.user.address)}</div>` : ""}</td>
    <td>${esc(r.equipment.name)}<div class="muted">${esc(r.equipment.code)}</div></td><td>${fmt(r.dueDate)}<br>${fmt(r.returnedAt)}</td>
    <td>${esc(r.returnCondition === "DAMAGED" ? "ชำรุด" : "ปกติ")}<div class="muted">${r.borrowerReturnSubmittedAt ? `ผู้ยืมส่งหลักฐาน ${fmt(r.borrowerReturnSubmittedAt)}${r.borrowerReturnNote ? ` · ${esc(r.borrowerReturnNote)}` : ""}<br>` : ""}เจ้าหน้าที่รับคืน ${fmt(r.returnedAt)}</div><div class="row">${photoMarkup(r)}</div></td>
    ${me.role === "ADMIN" ? `<td><button class="btn bad sm" data-delete-return="${esc(r.id)}">ลบ</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="${me.role === "ADMIN" ? "5" : "4"}" class="muted">ยังไม่มีประวัติรับคืน</td></tr>`}
  </tbody></table></div>`;
  const overdueFollowupSection = document.createElement("section");
  overdueFollowupSection.className = "card";
  overdueFollowupSection.style.marginTop = "14px";
  overdueFollowupSection.innerHTML = `<h3>ติดตามรายการเกินกำหนดตั้งแต่ 3 วัน (${overdueFollowups.length})</h3>
    ${overdueFollowups.length ? overdueFollowups.map((r) => `<article class="card" style="margin:10px 0">
      <div class="row"><div><b>${esc(r.equipment.name)} (${esc(r.equipment.code)}) · เกินกำหนด ${r.overdueDays} วัน</b>
        <div>${esc(r.borrowerName || r.user.name)} · ${esc(r.borrowerStudentId || r.user.studentId)}</div>
        <div>โทร: <a href="tel:${encodeURIComponent(r.borrowerPhone || r.user.phone || "")}">${esc(r.borrowerPhone || r.user.phone || "-")}</a> · อีเมล: <a href="mailto:${encodeURIComponent(r.borrowerEmail || r.user.email)}">${esc(r.borrowerEmail || r.user.email)}</a></div>
        ${r.user.address ? `<div class="muted">ที่อยู่สำหรับติดต่อ: ${esc(r.user.address)}</div>` : ""}
        <div class="muted">กำหนดคืน ${fmt(r.dueDate)} · ค่าปรับสะสม ${money(r.currentFine)}</div>
        ${(r.overdueContacts || []).map((contact) => `<div class="muted">ติดตาม ${contact.method === "PHONE" ? "ทางโทรศัพท์" : "ทางอีเมล"} เมื่อ ${fmt(contact.contactedAt)}: ${esc(contact.note)}</div>`).join("")}
        ${r.overdueReviewedAt ? `<div class="muted">ผู้ดูแลตรวจสอบเมื่อ ${fmt(r.overdueReviewedAt)}: ${esc(r.overdueReviewNote)}</div>` : ""}
      </div>
      <div class="row"><button class="btn sm" data-overdue-contact="PHONE" data-overdue-id="${r.id}">บันทึกการโทร</button>
        <button class="btn sm" data-overdue-contact="EMAIL" data-overdue-id="${r.id}">บันทึกอีเมล</button>
        ${me.role === "ADMIN" && r.overdueDays >= 7 && !r.overdueReviewedAt ? `<button class="btn warn sm" data-overdue-review="${r.id}">บันทึกผลตรวจสอบผู้ดูแล</button>` : ""}
      </div>
    </article>`).join("") : `<p class="muted">ยังไม่มีรายการที่ต้องติดตามพิเศษ</p>`}`;
  $("#app").append(overdueFollowupSection);
  const incidentSection = document.createElement("section");
  incidentSection.className = "card";
  incidentSection.style.marginTop = "14px";
  incidentSection.innerHTML = `<h3>เคสติดตามที่ยังเปิดอยู่</h3>
    ${incidents.length ? incidents.map((incident) => `<article class="card" style="margin:10px 0">
      <div class="row"><div><b>${incident.type === "LOST" ? "สูญหาย" : incident.type === "DAMAGED" ? "ชำรุด" : "ติดต่อผู้ยืมไม่ได้"} · ${esc(incident.request.equipment.name)} (${esc(incident.request.equipment.code)})</b>
      <div>${esc(incident.request.borrowerName || incident.request.user.name)} · ${esc(incident.request.borrowerStudentId || incident.request.user.studentId)} · ${esc(incident.request.borrowerPhone || incident.request.user.phone || "-")} · ${esc(incident.request.borrowerEmail || incident.request.user.email)}</div>
        ${incident.request.user.address ? `<div class="muted">ที่อยู่สำหรับติดต่อ: ${esc(incident.request.user.address)}</div>` : ""}
        <div class="muted">${fmt(incident.createdAt)} · ${esc(incident.note)}</div>
        ${incident.estimatedValue !== null ? `<div class="muted">มูลค่าประเมิน ${money(incident.estimatedValue)}</div>` : ""}
        ${incident.recoveredAt ? `<div class="muted">พบอุปกรณ์แล้ว ${fmt(incident.recoveredAt)} · ${esc(incident.recoveryNote)} · สถานะอุปกรณ์: ${STATUS_TH[incident.request.equipment.status]}</div><div class="row">${photoMarkup(incident.request)}</div>` : ""}
      </div>
      ${me.role === "ADMIN" ? `<button class="btn ok sm" data-resolve="${incident.id}">ผู้ดูแลยืนยันปิดเคส</button>` : ""}
    </div></article>`).join("") : `<p class="muted">ไม่มีเคสเปิดอยู่</p>`}`;
  $("#app").append(incidentSection);
  document.querySelectorAll("[data-a]").forEach((b) => (b.onclick = async () => {
    const a = b.dataset.a, id = b.dataset.id;
    if (a === "approve") return act(() => api(`/requests/${id}/approve`, "PATCH", {}), "อนุมัติแล้ว");
    if (a === "reject") { const note = prompt("เหตุผลที่ปฏิเสธ"); if (note === null) return; return act(() => api(`/requests/${id}/reject`, "PATCH", { note }), "ปฏิเสธแล้ว"); }
    if (a === "payfine") return act(() => api(`/requests/${id}/pay-fine`, "PATCH"), "บันทึกการชำระค่าปรับแล้ว");
    if (a === "return") return openReturnInspectionDialog(id, "GOOD");
    if (a === "return-bad") return openReturnInspectionDialog(id, "DAMAGED");
    if (a === "handout") return openHandoutDialog(id);
    if (a === "lost" || a === "unreachable") {
      const lost = a === "lost";
      if (lost && !confirm("ยืนยันแจ้งอุปกรณ์สูญหาย? ระบบจะปิดรายการยืมและตัดจำหน่ายอุปกรณ์")) return;
      const note = prompt(lost ? "ระบุรายละเอียดการสูญหาย" : "ระบุความพยายามติดต่อและผลการติดตาม");
      if (note === null) return;
      const valueText = prompt("มูลค่าประเมิน (บาท) ถ้าไม่ทราบให้เว้นว่าง");
      if (valueText === null) return;
      return act(() => api(`/requests/${id}/incidents`, "POST", {
        type: lost ? "LOST" : "UNREACHABLE", note, estimatedValue: valueText,
      }), lost ? "บันทึกเคสสูญหายแล้ว" : "บันทึกเคสติดต่อไม่ได้แล้ว");
    }
  }));
  document.querySelectorAll("[data-delete-return]").forEach((button) => (button.onclick = async () => {
    if (!confirm("ยืนยันลบรายการยืมที่คืนแล้วทั้งหมด รวมถึงประวัติรับคืน ภาพ และข้อมูลเคส/การติดตามที่เกี่ยวข้อง? การลบนี้ไม่สามารถกู้คืนได้")) return;
    try {
      const result = await api(`/requests/${button.dataset.deleteReturn}`, "DELETE");
      toast(result.photoCleanupFailed
        ? "ลบประวัติแล้ว แต่ลบไฟล์ภาพบางส่วนไม่สำเร็จ กรุณาตรวจสอบบันทึกเซิร์ฟเวอร์"
        : "ลบประวัติรับคืนและภาพแล้ว");
      await render();
    } catch (error) {
      toast(error.message);
    }
  }));
  document.querySelectorAll("[data-resolve]").forEach((b) => (b.onclick = () => {
    const resolutionNote = prompt("ระบุผลการติดตามและเหตุผลที่ผู้ดูแลยืนยันปิดเคส");
    if (resolutionNote === null) return;
    act(() => api(`/requests/incidents/${b.dataset.resolve}/resolve`, "PATCH", { resolutionNote }), "ปิดเคสแล้ว");
  }));
  document.querySelectorAll("[data-overdue-contact]").forEach((button) => (button.onclick = () => {
    const note = prompt(button.dataset.overdueContact === "PHONE"
      ? "บันทึกผลการโทรและวันเวลาที่ติดต่อ"
      : "บันทึกผลการติดต่อทางอีเมล");
    if (note === null) return;
    act(() => api(`/requests/${button.dataset.overdueId}/overdue-contact`, "POST", {
      method: button.dataset.overdueContact,
      note,
    }), "บันทึกผลการติดตามแล้ว");
  }));
  document.querySelectorAll("[data-overdue-review]").forEach((button) => (button.onclick = () => {
    const note = prompt("บันทึกผลตรวจสอบข้อเท็จจริงและการดำเนินการตามระเบียบมหาวิทยาลัย");
    if (note === null) return;
    act(() => api(`/requests/${button.dataset.overdueReview}/overdue-review`, "POST", { note }), "บันทึกผลตรวจสอบผู้ดูแลแล้ว");
  }));
  document.querySelectorAll("[data-recover]").forEach((b) => (b.onclick = async () => {
    const dlg = $("#dlg");
    dlg.innerHTML = `<form id="recover-form">
      <h3>บันทึกการพบอุปกรณ์</h3>
      <p class="muted">ตรวจสภาพก่อนยืนยัน ระบบจะเก็บภาพไว้ในประวัติ และไม่เปลี่ยนสถานะหากยังส่งข้อมูลไม่สำเร็จ</p>
      <label>สภาพอุปกรณ์</label>
      <select name="condition" required>
        <option value="GOOD">สภาพปกติ — คืนเป็นอุปกรณ์ว่าง</option>
        <option value="DAMAGED">ชำรุด — ส่งซ่อมบำรุง</option>
      </select>
      <label>วันที่และสถานที่พบ / รายละเอียดการตรวจ</label>
      <textarea name="recoveryNote" rows="3" minlength="3" required placeholder="ระบุวันที่ สถานที่พบ และผลตรวจสภาพ"></textarea>
      <label>ภาพอุปกรณ์ที่พบ</label>
      <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required>
      <div class="row"><button type="button" class="btn sec" id="cancel-recover">ยกเลิก</button><button class="btn warn" type="submit">ยืนยันบันทึกการพบ</button></div>
      <p id="recover-status" class="muted" role="status"></p>
    </form>`;
    dlg.showModal();
    $("#cancel-recover").onclick = () => dlg.close();
    $("#recover-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type="submit"]');
      const status = $("#recover-status");
      const photoFile = form.elements.photo.files?.[0];
      if (!photoFile) return toast("กรุณาเลือกหรือถ่ายภาพอุปกรณ์");
      submit.disabled = true;
      status.textContent = "กำลังเตรียมภาพและบันทึกข้อมูล...";
      try {
        const photo = await equipmentPhotoData(photoFile);
        const result = await api(`/requests/incidents/${b.dataset.recover}/recover`, "PATCH", {
          condition: form.elements.condition.value,
          recoveryNote: form.elements.recoveryNote.value.trim(),
          photo,
        });
        dlg.close();
        toast(result.request?.equipment?.status === "AVAILABLE" || result.request?.status === "RETURNED"
          ? (form.elements.condition.value === "GOOD" ? "พบอุปกรณ์แล้ว สถานะเปลี่ยนเป็นว่าง" : "พบอุปกรณ์แล้ว สถานะเปลี่ยนเป็นซ่อมบำรุง")
          : "บันทึกการพบอุปกรณ์แล้ว");
        await render();
      } catch (error) {
        status.textContent = error.message || "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง";
        submit.disabled = false;
      }
    };
  }));
}
