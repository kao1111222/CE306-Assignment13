// หน้าเจ้าหน้าที่: จัดการอุปกรณ์ (เพิ่ม / เปลี่ยนสถานะ / ลบ)
async function renderManage() {
  const [cats, all] = await Promise.all([api("/categories"), api("/equipment")]);
  const items = all.filter((i) => i.status !== "RETIRED");
  $("#app").innerHTML = `
  <div class="card" style="margin-bottom:14px"><h3 style="margin-top:0">เพิ่มอุปกรณ์</h3><form id="nf"><div class="row">
    <div><label>รหัส</label><input name="code" required></div><div><label>ชื่อ</label><input name="name" required></div>
    <div><label>หมวดหมู่</label><select name="categoryId" required>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
    <div><label>สถานที่เก็บ</label><input name="location"></div></div><button class="btn">เพิ่ม</button></form></div>
  <div class="card table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>หมวดหมู่</th><th>สถานะ</th><th></th></tr></thead><tbody>
  ${items.map((i) => `<tr><td>${esc(i.code)}</td><td>${esc(i.name)}</td><td>${esc(i.category.name)}</td>
   <td>${i.status === "BORROWED"
      ? `<span class="badge BORROWED">${STATUS_TH.BORROWED}</span><div class="muted">อัปเดตอัตโนมัติเมื่อส่งมอบ/รับคืน</div>`
      : `<select data-st="${i.id}" style="margin:0">${["AVAILABLE","REPAIR"].map((s) => `<option value="${s}" ${s === i.status ? "selected" : ""}>${STATUS_TH[s]}</option>`).join("")}</select>`}</td>
   <td><button class="btn bad sm" data-del="${i.id}" data-name="${esc(i.name)}">ลบ</button></td></tr>`).join("")}
  </tbody></table></div>`;

  $("#nf").onsubmit = (e) => { e.preventDefault(); act(() => api("/equipment", "POST", Object.fromEntries(new FormData(e.target))), "เพิ่มอุปกรณ์แล้ว"); };

  document.querySelectorAll("[data-st]").forEach((s) => (s.onchange = () => act(() => api("/equipment/" + s.dataset.st, "PUT", { status: s.value }), "อัปเดตสถานะแล้ว")));

  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!confirm(`ลบอุปกรณ์ "${b.dataset.name}" ?`)) return;
    try {
      const r = await api("/equipment/" + b.dataset.del, "DELETE");
      toast(r.mode === "retired" ? "ตัดจำหน่ายแล้ว (เก็บประวัติการยืมไว้)" : "ลบอุปกรณ์แล้ว");
      render();
    } catch (err) { toast(err.message); }
  }));
}
