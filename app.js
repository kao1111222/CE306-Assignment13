// จุดเริ่มต้นของแอป: เลือกหน้าที่จะแสดง

async function render() {
  const resetParams = new URLSearchParams(location.hash.slice(1));
  if (resetParams.has("reset")) return renderPasswordReset(resetParams.get("reset"));
  if (!token) { me = null; renderNav(); return renderAuth(); }
  try {
    if (!me) me = await api("/auth/me");
    renderNav();
    const views = { equipment: renderEquipment, my: renderMy, support: renderSupport, "support-admin": renderSupportAdmin, staff: renderStaff, manage: renderManage, users: renderUsers, profile: renderProfile, password: renderChangePassword };
    await (views[tab] || renderEquipment)();
  } catch (e) { toast(e.message); }
}
render();
