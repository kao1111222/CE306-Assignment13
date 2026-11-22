// หน้าเข้าสู่ระบบ / ลงทะเบียน

function renderAuth(mode = "login") {
  $("#app").innerHTML = `
  <div class="card auth">
    <h2>${mode === "login" ? "เข้าสู่ระบบ" : "ลงทะเบียน"}</h2>
    <form id="f">
      ${mode === "register" ? `<label>รหัสนักศึกษา/บุคลากร</label><input name="studentId" autocomplete="username" required>
        <label>ชื่อ-นามสกุล</label><input name="name" autocomplete="name" required>
        <label>เบอร์โทรศัพท์</label><input name="phone" type="tel" autocomplete="tel" minlength="8" maxlength="20" required>
        <label>คณะ</label><input name="faculty">` : ""}
      <label>${mode === "login" ? "อีเมลหรือรหัสนักศึกษา" : "อีเมล"}</label><input name="${mode === "login" ? "identifier" : "email"}" ${mode === "login" ? "" : 'type="email"'} autocomplete="${mode === "login" ? "username" : "email"}" required>
      <label>รหัสผ่าน</label><input name="password" type="password" required minlength="6">
      <button class="btn" style="width:100%">${mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}</button>
    </form>
    ${mode === "login" ? '<p class="muted" style="text-align:center"><a href="#" id="forgot">ลืมรหัสผ่าน?</a></p>' : ""}
    <p class="muted" style="text-align:center"><a href="#" id="sw">${mode === "login" ? "ยังไม่มีบัญชี? ลงทะเบียน" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}</a></p>
  </div>`;
  $("#sw").onclick = (e) => { e.preventDefault(); renderAuth(mode === "login" ? "register" : "login"); };
  if (mode === "login") $("#forgot").onclick = (e) => { e.preventDefault(); renderForgotPassword(); };
  $("#f").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(e.target));
      const r = await api(`/auth/${mode}`, "POST", body);
      token = r.token; me = r.user; localStorage.setItem("token", token); tab = "equipment"; render();
    } catch (err) { toast(err.message); }
  };
}

function renderForgotPassword() {
  $("#app").innerHTML = `
  <div class="card auth">
    <h2>ลืมรหัสผ่าน</h2>
    <p class="muted">กรอกอีเมลที่ใช้ลงทะเบียน ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้</p>
    <form id="forgot-form">
      <label>อีเมล</label><input name="email" type="email" autocomplete="email" required>
      <button class="btn" style="width:100%">ส่งลิงก์รีเซ็ต</button>
    </form>
    <p id="forgot-result" class="muted" role="status"></p>
    <p class="muted" style="text-align:center"><a href="#" id="back-login">กลับไปเข้าสู่ระบบ</a></p>
  </div>`;
  $("#back-login").onclick = (e) => { e.preventDefault(); renderAuth("login"); };
  $("#forgot-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    button.disabled = true;
    try {
      const { email } = Object.fromEntries(new FormData(e.target));
      const result = await api("/auth/forgot-password", "POST", { email });
      $("#forgot-result").textContent = result.message;
      e.target.reset();
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  };
}

function renderPasswordReset(resetToken) {
  $("#app").innerHTML = `
  <div class="card auth">
    <h2>ตั้งรหัสผ่านใหม่</h2>
    ${resetToken ? `<form id="reset-form">
      <label>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label><input name="newPassword" type="password" autocomplete="new-password" required minlength="6">
      <label>ยืนยันรหัสผ่านใหม่</label><input name="confirmPassword" type="password" autocomplete="new-password" required minlength="6">
      <button class="btn" style="width:100%">บันทึกรหัสผ่านใหม่</button>
    </form>` : '<p class="muted">ลิงก์รีเซ็ตไม่ถูกต้อง กรุณาขอลิงก์ใหม่</p>'}
    <p class="muted" style="text-align:center"><a href="#" id="back-login">กลับไปเข้าสู่ระบบ</a></p>
  </div>`;
  $("#back-login").onclick = (e) => {
    e.preventDefault();
    history.replaceState(null, "", location.pathname + location.search);
    renderAuth("login");
  };
  if (!resetToken) return;
  $("#reset-form").onsubmit = async (e) => {
    e.preventDefault();
    const { newPassword, confirmPassword } = Object.fromEntries(new FormData(e.target));
    if (newPassword !== confirmPassword) return toast("รหัสผ่านใหม่ไม่ตรงกัน");
    const button = e.submitter;
    button.disabled = true;
    try {
      await api("/auth/reset-password", "POST", { token: resetToken, newPassword });
      history.replaceState(null, "", location.pathname + location.search);
      token = null;
      me = null;
      localStorage.removeItem("token");
      renderAuth("login");
      toast("ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบ");
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  };
}
