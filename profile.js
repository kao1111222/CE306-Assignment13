// หน้าโปรไฟล์ผู้ใช้และเปลี่ยนรหัสผ่าน
function renderProfile() {
  $("#app").innerHTML = `
  <div class="card auth">
    <h2>ข้อมูลผู้ยืม</h2>
    <p class="muted">ข้อมูลที่อยู่ไม่บังคับกรอก ใช้เพื่อการติดตามคำขอยืม และจะแสดงให้เจ้าหน้าที่/ผู้ดูแลระบบเท่านั้น</p>
    <form id="profile-form">
      <label>รหัสนักศึกษา/บุคลากร</label><input value="${esc(me.studentId)}" disabled>
      <label>ชื่อ-นามสกุล</label><input name="name" value="${esc(me.name)}" required>
      <label>เบอร์โทรศัพท์</label><input name="phone" type="tel" value="${esc(me.phone || "")}" minlength="8" maxlength="20" required>
      <label>ที่อยู่สำหรับติดต่อ (ไม่บังคับ)</label><textarea name="address" rows="3" maxlength="500" autocomplete="street-address" placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์">${esc(me.address || "")}</textarea>
      <label>อีเมล</label><input value="${esc(me.email)}" type="email" disabled>
      <button class="btn" style="width:100%">บันทึกข้อมูล</button>
    </form>
  </div>`;
  $("#profile-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      me = await api("/auth/profile", "PATCH", Object.fromEntries(new FormData(e.target)));
      renderNav();
      toast("บันทึกข้อมูลผู้ยืมแล้ว");
    } catch (err) { toast(err.message); }
  };
}

function renderChangePassword() {
  $("#app").innerHTML = `
  <div class="card auth">
    <h2>เปลี่ยนรหัสผ่าน</h2>
    <form id="pf">
      <label>รหัสผ่านเดิม</label><input name="oldPassword" type="password" required>
      <label>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label><input name="newPassword" type="password" required minlength="6">
      <label>ยืนยันรหัสผ่านใหม่</label><input name="confirm" type="password" required minlength="6">
      <button class="btn" style="width:100%">บันทึก</button>
    </form>
  </div>`;
  $("#pf").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (d.newPassword !== d.confirm) return toast("รหัสผ่านใหม่ไม่ตรงกัน");
    try {
      await api("/auth/change-password", "POST", { oldPassword: d.oldPassword, newPassword: d.newPassword });
      toast("เปลี่ยนรหัสผ่านแล้ว");
      e.target.reset();
    } catch (err) { toast(err.message); }
  };
}
