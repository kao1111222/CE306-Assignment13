// หน้าผู้ดูแลระบบ: จัดการผู้ใช้ (เปลี่ยนบทบาท / ลบ)
async function renderUsers() {
  const users = await api("/users");
  $("#app").innerHTML = `<div class="card" style="margin-bottom:14px"><button class="btn sec" id="show-audit">ดูประวัติการเปลี่ยนแปลง</button></div>
  <div class="card table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>อีเมล</th><th>คณะ</th><th>บทบาท</th><th></th></tr></thead><tbody>
  ${users.map((u) => `<tr><td>${esc(u.studentId)}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.faculty || "-")}</td>
  <td><select data-role="${u.id}" style="margin:0">${["STUDENT","STAFF","ADMIN"].map((r) => `<option value="${r}" ${r === u.role ? "selected" : ""}>${ROLE_TH[r]}</option>`).join("")}</select></td>
  <td>${u.id === me.id ? '<span class="muted">(คุณ)</span>' : `<button class="btn bad sm" data-del="${u.id}" data-name="${esc(u.name)}">ลบ</button>`}</td></tr>`).join("")}
  </tbody></table></div>`;
  document.querySelectorAll("[data-role]").forEach((s) => (s.onchange = () => act(() => api(`/users/${s.dataset.role}/role`, "PATCH", { role: s.value }), "เปลี่ยนบทบาทแล้ว")));
  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
    if (!confirm(`ลบผู้ใช้ "${b.dataset.name}" ?\nประวัติการยืมของผู้ใช้นี้จะถูกลบด้วย และกู้คืนไม่ได้`)) return;
    act(() => api(`/users/${b.dataset.del}`, "DELETE"), "ลบผู้ใช้แล้ว");
  }));
  $("#show-audit").onclick = async () => {
    try {
      const { items, total } = await api("/users/audit?limit=100");
      const dlg = $("#dlg");
      dlg.innerHTML = `<h3>ประวัติการเปลี่ยนแปลง</h3><p class="muted">แสดง ${items.length} จาก ${total} รายการล่าสุด</p>
        <div class="table-wrap"><table><thead><tr><th>เวลา</th><th>ผู้ดำเนินการ</th><th>รายการ</th><th>ข้อมูล</th></tr></thead><tbody>
        ${items.map((item) => `<tr><td>${fmt(item.createdAt)}</td><td>${esc(item.actorId || "ระบบ")}<div class="muted">${esc(item.actorRole || "")}</div></td>
          <td>${esc(item.action)}<div class="muted">${esc(item.targetType)} · ${esc(item.targetId)}</div></td>
          <td class="muted">${esc(item.changes ? JSON.stringify(item.changes) : "-")}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">ยังไม่มีประวัติ</td></tr>'}
        </tbody></table></div><p><button class="btn sec" id="close-audit">ปิด</button></p>`;
      dlg.showModal();
      $("#close-audit").onclick = () => dlg.close();
    } catch (err) {
      toast(err.message);
    }
  };
}
