// หน้าคำขอของฉัน

async function renderMy() {
  releaseRequestPhotoUrls();
  const [rows, eligibility] = await Promise.all([
    api("/requests"),
    me.role === "STUDENT" ? api("/requests/eligibility") : Promise.resolve({ allowed: true, reason: null }),
  ]);
  const mine = rows.filter((r) => r.user.id === me.id);
  const activeLoans = mine.filter((r) => ["BORROWED", "OVERDUE"].includes(r.status));
  const photoUrls = new Map();
  await Promise.all(mine.flatMap((r) => ["handout", "return", "borrower-return"].map(async (kind) => {
    const photoField = { handout: "handoutPhoto", return: "returnPhoto", "borrower-return": "borrowerReturnPhoto" }[kind];
    if (!r[photoField]) return;
    photoUrls.set(`${r.id}:${kind}`, await requestPhotoUrl(r.id, kind));
  })));
  $("#app").innerHTML = `${!eligibility.allowed ? `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--bad)"><b>ระงับการยืมชั่วคราว</b><div class="muted">${esc(eligibility.reason)}</div></div>` : ""}
  ${activeLoans.length === 0 ? `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--accent, #7c3aed)"><b>ยังไม่มีรายการที่กำลังยืม</b><div class="muted">ปุ่ม “ส่งรูปยืนยันคืน” จะแสดงในแถวของอุปกรณ์ที่มีสถานะ “กำลังยืม” เท่านั้น รายการที่ขึ้น “คืนแล้ว” ได้รับการตรวจรับจากเจ้าหน้าที่เรียบร้อยแล้ว</div></div>` : ""}
  <div class="card table-wrap"><table><thead><tr><th>อุปกรณ์</th><th>ยืม</th><th>กำหนดคืน</th><th>สถานะ/เวลาคืน</th><th>ดำเนินการ</th></tr></thead><tbody>
  ${mine.map((r) => `<tr><td>${esc(r.equipment.name)}<div class="muted">${esc(r.equipment.code)}</div><div class="muted">${esc(r.borrowerName || r.user.name)} · ${esc(r.borrowerStudentId || r.user.studentId)} · ${esc(r.borrowerPhone || r.user.phone || "-")} · ${esc(r.borrowerEmail || r.user.email)}</div><div class="row">${["handout", "return"].map((kind) => photoUrls.has(`${r.id}:${kind}`) ? `<a href="${photoUrls.get(`${r.id}:${kind}`)}" target="_blank" rel="noopener"><img src="${photoUrls.get(`${r.id}:${kind}`)}" alt="${kind === "handout" ? "ภาพก่อนส่งมอบ" : "ภาพหลังคืน"}" style="width:56px;height:56px;object-fit:cover;border-radius:8px"><small>${kind === "handout" ? "ก่อนส่งมอบ" : "หลังคืน"}</small></a>` : "").join("")}</div></td><td>${fmt(r.borrowDate)}</td><td>${fmt(r.dueDate)}</td>
   <td><span class="badge ${r.status}">${STATUS_TH[r.status]}</span> ${r.overdue ? '<span class="badge overdue">เกินกำหนด</span>' : ""}${r.borrowerReturnSubmittedAt ? `<div class="muted">ส่งหลักฐานคืนเมื่อ ${fmt(r.borrowerReturnSubmittedAt)} (รอเจ้าหน้าที่ตรวจรับ)</div>` : ""}${r.returnedAt ? `<div class="muted">เจ้าหน้าที่รับคืนเมื่อ ${fmt(r.returnedAt)}</div>` : ""}${r.agreementAcceptedAt ? `<div class="muted">ยืนยันข้อตกลงเมื่อ ${fmt(r.agreementAcceptedAt)}</div>` : ""}${r.overdue ? `<div class="muted">ค่าปรับสะสม ${money(r.currentFine)}</div>` : ""}${r.fineAmount > 0 ? `<div class="muted">ค่าปรับ ${money(r.fineAmount)} · ${r.finePaid ? "ชำระแล้ว" : "ยังไม่ชำระ"}</div>` : ""}${r.staffNote ? `<div class="muted">${esc(r.staffNote)}</div>` : ""}${r.incidents?.map((incident) => `<div class="muted">${incident.type === "LOST" ? "เคสสูญหาย" : incident.type === "DAMAGED" ? "เคสชำรุด" : "เคสติดตามผู้ยืม"} (${incident.status === "OPEN" ? "กำลังติดตาม" : "ปิดเคส"}): ${esc(incident.note)}${incident.resolutionNote ? `<br>ผลติดตาม: ${esc(incident.resolutionNote)}` : ""}</div>`).join("") || ""}</td>
   <td><div class="row">${["handout", "borrower-return", "return"].map((kind) => photoUrls.has(`${r.id}:${kind}`) ? `<a href="${photoUrls.get(`${r.id}:${kind}`)}" target="_blank" rel="noopener"><img src="${photoUrls.get(`${r.id}:${kind}`)}" alt="${kind === "handout" ? "ภาพก่อนส่งมอบ" : kind === "borrower-return" ? "ภาพยืนยันส่งคืนจากผู้ยืม" : "ภาพตรวจรับคืน"}" style="width:56px;height:56px;object-fit:cover;border-radius:8px"><small>${kind === "handout" ? "ก่อนส่งมอบ" : kind === "borrower-return" ? "ผู้ยืมส่งคืน" : "เจ้าหน้าที่ตรวจรับ"}</small></a>` : "").join("")}</div>${r.status === "APPROVED" ? `<button class="btn sm" data-pickup-code="${r.id}">ขอรหัสรับอุปกรณ์</button><div class="muted" data-pickup-code-display="${r.id}"></div>` : ""}${["BORROWED", "OVERDUE"].includes(r.status) && !r.borrowerReturnSubmittedAt ? `<button class="btn warn sm" data-return-submit="${r.id}">แนบรูปยืนยันการคืน</button>` : ["BORROWED", "OVERDUE"].includes(r.status) ? `<div class="muted">ส่งรูปยืนยันแล้ว รอเจ้าหน้าที่ตรวจรับ</div>` : ""}${r.status === "PENDING" ? `<button class="btn bad sm" data-cancel="${r.id}">ยกเลิก</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">ยังไม่มีประวัติการยืม</td></tr>`}
  </tbody></table></div>`;
  document.querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = () => act(() => api(`/requests/${b.dataset.cancel}/cancel`, "PATCH"), "ยกเลิกแล้ว")));
  document.querySelectorAll("[data-pickup-code]").forEach((button) => (button.onclick = async () => {
    button.disabled = true;
    try {
      const { code, expiresAt } = await api(`/requests/${encodeURIComponent(button.dataset.pickupCode)}/pickup-code`, "POST");
      $(`[data-pickup-code-display="${button.dataset.pickupCode}"]`).textContent =
        `รหัสรับอุปกรณ์: ${code} · ใช้ได้ถึง ${fmt(expiresAt)} · แสดงรหัสนี้ให้เจ้าหน้าที่เท่านั้น`;
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  }));
  document.querySelectorAll("[data-return-submit]").forEach((button) => (button.onclick = () => {
    const dlg = $("#dlg");
    dlg.innerHTML = `<form id="borrower-return-form">
      <h3>ส่งหลักฐานคืนอุปกรณ์</h3>
      <p class="muted">ถ่ายภาพอุปกรณ์ ณ จุดส่งคืนและบันทึกเวลาส่งหลักฐาน ระบบจะบันทึกเวลาจากเซิร์ฟเวอร์ เจ้าหน้าที่ยังต้องตรวจรับก่อนเปลี่ยนสถานะเป็นคืนแล้ว</p>
      <label>หมายเหตุ (ถ้ามี)</label><textarea name="note" rows="2" placeholder="เช่น ฝากไว้ที่ห้องพัสดุ อาคาร..."></textarea>
      <label>รูปอุปกรณ์ตอนส่งคืน</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required>
      <div class="row"><button type="button" class="btn sec" id="cancel-return-submit">ยกเลิก</button><button type="submit" class="btn warn">ส่งหลักฐานคืน</button></div>
      <p id="return-submit-status" class="muted" role="status"></p>
    </form>`;
    dlg.showModal();
    $("#cancel-return-submit").onclick = () => dlg.close();
    $("#borrower-return-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type="submit"]');
      const status = $("#return-submit-status");
      const photoFile = form.elements.photo.files?.[0];
      if (!photoFile) return toast("กรุณาเลือกหรือถ่ายภาพอุปกรณ์");
      submit.disabled = true;
      status.textContent = "กำลังเตรียมภาพและส่งหลักฐาน...";
      try {
        const photo = await equipmentPhotoData(photoFile);
        await api(`/requests/${button.dataset.returnSubmit}/return-submission`, "POST", {
          photo,
          note: form.elements.note.value.trim(),
        });
        dlg.close();
        toast("ส่งหลักฐานคืนแล้ว ระบบบันทึกเวลาให้เรียบร้อย กรุณารอเจ้าหน้าที่ตรวจรับ");
        await render();
      } catch (error) {
        status.textContent = error.message || "ส่งหลักฐานไม่สำเร็จ กรุณาลองอีกครั้ง";
        submit.disabled = false;
      }
    };
  }));
}
