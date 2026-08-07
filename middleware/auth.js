/** middleware/auth.js — ตรวจสอบว่าเข้าสู่ระบบ (และผ่าน 2FA แล้วถ้าเปิดใช้) */
function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.redirect("/admin/login");
}

/** เฉพาะ Super Admin (ใช้กับหน้า Admin Management) */
function requireSuperAdmin(req, res, next) {
  const db = require("../database").get();
  const me = db.admins.find((a) => a.id === req.session.adminId);
  if (me && me.role === "superadmin") return next();
  return res.status(403).send("เฉพาะผู้ดูแลระดับ Super Admin เท่านั้น");
}

module.exports = { requireAuth, requireSuperAdmin };
