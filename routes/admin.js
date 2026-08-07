/** routes/admin.js — ระบบจัดการเว็บไซต์ (CMS): Login → 2FA → Dashboard → CRUD */
const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const database = require("../database");
const { requireAuth, requireSuperAdmin } = require("../middleware/auth");
const rateLimit = require("../middleware/rateLimit");

const fs = require("fs");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = () => database.get();
const save = () => database.save();

/* ---------- อัปโหลดไฟล์ (รูปภาพ + PDF) ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + "-" + Math.round(Math.random() * 1e6) + path.extname(file.originalname).toLowerCase();
    cb(null, safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // ตัด .svg ออกโดยตั้งใจ — ไฟล์ SVG ฝังโค้ด JavaScript ได้ เสี่ยง Stored XSS ถ้าถูกเปิดตรง ๆ
    const ok = /\.(jpe?g|png|webp|gif|pdf)$/i.test(file.originalname);
    cb(ok ? null : new Error("รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP, GIF) และ PDF"), ok);
  }
});

/* ---------- helper ---------- */
// สุ่มรหัสผ่านชั่วคราวที่คาดเดาไม่ได้ (ใช้ตอนสร้างแอดมินใหม่/รีเซ็ตรหัสผ่าน แทนค่าคงที่เดิม)
const crypto = require("crypto");
const genTempPassword = () => crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "x"); // ~12 ตัวอักษร

// ตรวจ CSRF token สำหรับ route ที่อัปโหลดไฟล์ (multipart) — เช็คทีหลัง middleware กลาง
// เพราะตอนนั้น req.body ยังไม่พร้อมจนกว่า multer จะ parse เสร็จก่อน
function csrfOk(req) {
  return !!(req.body && req.body._csrf && req.body._csrf === req.session.csrfToken);
}
function csrfFail(res) {
  return res.status(403).render("admin/error", {
    title: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย",
    message: "อาจเป็นเพราะฟอร์มหมดอายุ (เปิดค้างไว้นานเกินไป) กรุณากลับไปหน้าเดิมแล้วลองใหม่อีกครั้ง"
  });
}
const me = (req) => db().admins.find((a) => a.id === req.session.adminId);
const fileOf = (req, field) => {
  const f = (req.files || []).find((x) => x.fieldname === field);
  return f ? "/uploads/" + f.filename : "";
};
// เหมือน fileOf แต่คืนทุกไฟล์ที่ชื่อ field เดียวกัน (สำหรับอัปโหลดหลายรูป เช่น แกลเลอรีสินค้า)
const filesOf = (req, field) =>
  (req.files || []).filter((x) => x.fieldname === field).map((f) => "/uploads/" + f.filename);

// แปลง textarea (บรรทัดละ 1 รายการ) <-> array ของ string เช่น ขั้นตอนงาน, สิ่งที่รวมในราคา
const parseList = (text) => (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
const listToText = (list) => (list || []).join("\n");
// แปลง textarea (บรรทัดละ 1 แถว คั่นคอลัมน์ด้วย " | ") <-> array ของ array เช่น ตารางราคา
const parseRows = (text) =>
  (text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split("|").map((c) => c.trim()));
const rowsToText = (rows) => (rows || []).map((r) => r.join(" | ")).join("\n");

/* ==================================================
 * เข้าสู่ระบบ + 2FA
 * ================================================== */
router.get("/login", (req, res) => {
  if (req.session.adminId) return res.redirect("/admin");
  res.render("admin/login", { error: null });
});

router.post("/login", rateLimit.checkLimit("login"), (req, res) => {
  const { username, password } = req.body;
  const admin = db().admins.find((a) => a.username === (username || "").trim());
  if (!admin || !bcrypt.compareSync(password || "", admin.password_hash)) {
    rateLimit.recordFailure(req, "login");
    return res.render("admin/login", { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
  }
  rateLimit.recordSuccess(req, "login");
  if (admin.twofa_enabled) {
    req.session.pendingId = admin.id; // รอยืนยัน OTP
    return res.redirect("/admin/otp");
  }
  req.session.adminId = admin.id;
  res.redirect("/admin");
});

router.get("/otp", (req, res) => {
  if (!req.session.pendingId) return res.redirect("/admin/login");
  res.render("admin/otp", { error: null });
});

router.post("/otp", rateLimit.checkLimit("otp"), (req, res) => {
  const admin = db().admins.find((a) => a.id === req.session.pendingId);
  if (!admin) return res.redirect("/admin/login");
  const token = (req.body.token || "").replace(/\s/g, "");
  if (authenticator.check(token, admin.twofa_secret)) {
    rateLimit.recordSuccess(req, "otp");
    delete req.session.pendingId;
    req.session.adminId = admin.id;
    return res.redirect("/admin");
  }
  rateLimit.recordFailure(req, "otp");
  res.render("admin/otp", { error: "รหัส OTP ไม่ถูกต้อง ลองใหม่อีกครั้ง" });
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

/* ==================================================
 * Dashboard
 * ================================================== */
router.get("/", requireAuth, (req, res) => {
  const d = db();
  res.render("admin/dashboard", {
    me: me(req), page: "dash",
    stats: { services: d.services.length, products: d.products.length, projects: d.projects.length, news: d.news.length },
    latestNews: [...d.news].sort((a, b) => b.id - a.id).slice(0, 3)
  });
});

/* ==================================================
 * ข้อมูลบริษัท
 * ================================================== */
router.get("/company", requireAuth, (req, res) =>
  res.render("admin/company", { me: me(req), page: "company", c: db().company, saved: req.query.saved, err: req.query.err || null })
);
router.post("/company", requireAuth, (req, res) => {
  upload.any()(req, res, (uploadErr) => {
    if (uploadErr) {
      const msg =
        uploadErr.code === "LIMIT_FILE_SIZE"
          ? "ไฟล์มีขนาดใหญ่เกินไป (จำกัดไม่เกิน 10MB)"
          : uploadErr.message || "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
      return res.redirect("/admin/company?err=" + encodeURIComponent(msg));
    }
    if (!csrfOk(req)) return csrfFail(res);
    const c = db().company;
    ["name", "tax_id", "address", "phone", "email", "facebook", "line", "history", "vision", "mission"].forEach(
      (k) => (c[k] = req.body[k] || "")
    );
    // ตรวจสอบ maps_url ว่าเป็นลิงก์ https จริง ก่อนบันทึก (จะถูกฝังลง <iframe> ในหน้าเว็บสาธารณะ)
    const mapsUrl = (req.body.maps_url || "").trim();
    c.maps_url = mapsUrl && /^https:\/\//i.test(mapsUrl) ? mapsUrl : "";
    const logo = fileOf(req, "logo");
    if (logo) c.logo = logo;
    save();
    res.redirect("/admin/company?saved=1");
  });
});

/* ==================================================
 * โรงงาน CRUD ใช้ร่วมกัน (banner/service/product/project/news)
 * ================================================== */
function crud(name, table, view, mapBody) {
  // รายการ + ฟอร์ม (แก้ไขผ่าน ?edit=id)
  router.get("/" + name, requireAuth, (req, res) => {
    const editing = req.query.edit ? db()[table].find((r) => r.id === +req.query.edit) : null;
    res.render("admin/" + view, { me: me(req), page: name, rows: db()[table], editing, presetBrand: req.query.brand || "", err: req.query.err || null });
  });
  // บันทึก (สร้าง/แก้ไข) — ดักข้อผิดพลาดจากการอัปโหลดไฟล์ (ประเภทผิด/ขนาดเกิน) ไม่ให้ขึ้นจอขาว
  router.post("/" + name + "/save", requireAuth, (req, res) => {
    upload.any()(req, res, (uploadErr) => {
      if (uploadErr) {
        const msg =
          uploadErr.code === "LIMIT_FILE_SIZE"
            ? "ไฟล์มีขนาดใหญ่เกินไป (จำกัดไม่เกิน 10MB ต่อไฟล์)"
            : uploadErr.message || "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
        return res.redirect("/admin/" + name + "?err=" + encodeURIComponent(msg));
      }
      if (!csrfOk(req)) return csrfFail(res);
      try {
        const t = db()[table];
        const id = +req.body.id || 0;
        const row = id ? t.find((r) => r.id === id) : null;
        const data = mapBody(req, row);
        if (row) Object.assign(row, data);
        else t.push({ id: database.nextId(t), ...data });
        save();
        res.redirect("/admin/" + name);
      } catch (e) {
        console.error("บันทึกข้อมูลผิดพลาด:", e);
        res.redirect("/admin/" + name + "?err=" + encodeURIComponent("เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง"));
      }
    });
  });
  // ลบ
  router.post("/" + name + "/delete/:id", requireAuth, (req, res) => {
    db()[table] = db()[table].filter((r) => r.id !== +req.params.id);
    database.get()[table] = db()[table];
    save();
    res.redirect("/admin/" + name);
  });
}

/* Banner (+ เปิด/ปิดการแสดงผล) */
crud("banners", "banners", "banners", (req, row) => ({
  title: req.body.title || "",
  sort: +req.body.sort || 1,
  active: req.body.active === "on",
  image: fileOf(req, "image") || (row ? row.image : "")
}));
router.post("/banners/toggle/:id", requireAuth, (req, res) => {
  const b = db().banners.find((r) => r.id === +req.params.id);
  if (b) { b.active = !b.active; save(); }
  res.redirect("/admin/banners");
});

/* บริการ */
crud("services", "services", "services", (req, row) => ({
  title: req.body.title || "",
  icon: req.body.icon || "mdi:air-conditioner",
  description: req.body.description || "",
  long: req.body.long || req.body.description || "",
  steps: parseList(req.body.steps).length ? parseList(req.body.steps) : row ? row.steps : [],
  image: fileOf(req, "image") || (row ? row.image : ""),
  updated_at: new Date().toISOString()
}));

/* สินค้า (รูปหลัก + แกลเลอรีหลายรูป + PDF Catalog) */
crud("products", "products", "products", (req, row) => {
  const newGallery = filesOf(req, "gallery");
  const gallery = newGallery.length ? newGallery : req.body.clearGallery === "on" ? [] : row ? row.gallery : [];
  return {
    name: req.body.name || "",
    brand: (req.body.brand || "").toUpperCase(),
    model: req.body.model || "",
    type: req.body.type || "",
    spec: req.body.spec || "",
    price: +req.body.price || 0,
    priceOld: +req.body.priceOld || 0,
    badge: req.body.badge || "",
    bestseller: req.body.bestseller === "on",
    description: req.body.description || "",
    image: fileOf(req, "image") || (row ? row.image : ""),
    gallery,
    catalog: fileOf(req, "catalog") || (row ? row.catalog : "")
  };
});

/* ผลงาน */
crud("projects", "projects", "projects", (req, row) => ({
  title: req.body.title || "",
  year: req.body.year || "",
  category: req.body.category || "",
  place: req.body.place || "",
  description: req.body.description || "",
  image: fileOf(req, "image") || (row ? row.image : "")
}));

/* ข่าวสาร (+ สถานะเผยแพร่) */
crud("news", "news", "news", (req, row) => ({
  title: req.body.title || "",
  body: req.body.body || "",
  published_at: req.body.published_at || new Date().toISOString().slice(0, 10),
  published: req.body.published === "on",
  image: fileOf(req, "image") || (row ? row.image : "")
}));

/* ==================================================
 * ค่าบริการ (ติดตั้งแอร์ + ล้างแอร์)
 * ================================================== */
router.get("/pricing", requireAuth, (req, res) => {
  const d = db();
  res.render("admin/pricing", {
    me: me(req), page: "pricing", saved: req.query.saved,
    installRowsText: rowsToText(d.pricingInstall.rows),
    installIncludedText: listToText(d.pricingInstall.included),
    installExtraText: listToText(d.pricingInstall.extra),
    cleanRowsText: rowsToText(d.pricingClean.rows),
    cleanStepsText: listToText(d.pricingClean.steps),
    cleanPromoText: listToText(d.pricingClean.promo)
  });
});
router.post("/pricing", requireAuth, (req, res) => {
  const d = db();
  d.pricingInstall.rows = parseRows(req.body.installRows);
  d.pricingInstall.included = parseList(req.body.installIncluded);
  d.pricingInstall.extra = parseList(req.body.installExtra);
  d.pricingClean.rows = parseRows(req.body.cleanRows);
  d.pricingClean.steps = parseList(req.body.cleanSteps);
  d.pricingClean.promo = parseList(req.body.cleanPromo);
  save();
  res.redirect("/admin/pricing?saved=1");
});

/* ==================================================
 * การชำระเงิน
 * ================================================== */
router.get("/payment", requireAuth, (req, res) => {
  const d = db();
  res.render("admin/payment", {
    me: me(req), page: "payment", saved: req.query.saved,
    methodsText: (d.payment.methods || []).map((m) => [m.no, m.icon, m.title, m.desc].join(" | ")).join("\n"),
    termsText: rowsToText(d.payment.terms)
  });
});
router.post("/payment", requireAuth, (req, res) => {
  const d = db();
  d.payment.methods = parseRows(req.body.methods).map((c) => ({
    no: c[0] || "", icon: c[1] || "mdi:cash-multiple", title: c[2] || "", desc: c[3] || ""
  }));
  d.payment.terms = parseRows(req.body.terms);
  save();
  res.redirect("/admin/payment?saved=1");
});

/* ==================================================
 * ผู้ดูแลระบบ (เฉพาะ Super Admin)
 * ================================================== */
router.get("/admins", requireAuth, requireSuperAdmin, (req, res) => {
  const editing = req.query.edit ? db().admins.find((a) => a.id === +req.query.edit) : null;
  res.render("admin/admins", {
    me: me(req), page: "admins", rows: db().admins, editing, error: null,
    tempPw: req.query.tempPw || null, tempUser: req.query.tempUser || null
  });
});
router.post("/admins/save", requireAuth, requireSuperAdmin, (req, res) => {
  const t = db().admins;
  const id = +req.body.id || 0;
  const row = id ? t.find((r) => r.id === id) : null;
  const uname = (req.body.username || "").trim();
  if (!row && t.some((a) => a.username === uname)) {
    return res.render("admin/admins", { me: me(req), page: "admins", rows: t, editing: null, error: "ชื่อผู้ใช้นี้มีอยู่แล้ว" });
  }
  const data = {
    username: uname,
    name: req.body.name || "",
    email: req.body.email || "",
    role: req.body.role === "superadmin" ? "superadmin" : "editor"
  };
  let tempPw = "";
  if (req.body.password) {
    data.password_hash = bcrypt.hashSync(req.body.password, 10);
  } else if (!row) {
    tempPw = genTempPassword(); // แอดมินใหม่ที่ไม่ได้กำหนดรหัสผ่านเอง -> สุ่มให้แทน "changeme123" เดิม
    data.password_hash = bcrypt.hashSync(tempPw, 10);
  }
  if (row) Object.assign(row, data);
  else t.push({ id: database.nextId(t), phone: "", twofa_enabled: false, twofa_secret: "", ...data });
  save();
  res.redirect("/admin/admins" + (tempPw ? "?tempPw=" + encodeURIComponent(tempPw) + "&tempUser=" + encodeURIComponent(uname) : ""));
});
router.post("/admins/delete/:id", requireAuth, requireSuperAdmin, (req, res) => {
  const id = +req.params.id;
  if (id !== req.session.adminId) { // ห้ามลบตัวเอง
    database.get().admins = db().admins.filter((a) => a.id !== id);
    save();
  }
  res.redirect("/admin/admins");
});
router.post("/admins/reset/:id", requireAuth, requireSuperAdmin, (req, res) => {
  const a = db().admins.find((r) => r.id === +req.params.id);
  if (!a) return res.redirect("/admin/admins");
  const tempPw = genTempPassword();
  a.password_hash = bcrypt.hashSync(tempPw, 10);
  save();
  res.redirect("/admin/admins?tempPw=" + encodeURIComponent(tempPw) + "&tempUser=" + encodeURIComponent(a.username));
});

/* ==================================================
 * โปรไฟล์ + เปลี่ยนรหัสผ่าน + ตั้งค่า 2FA
 * ================================================== */
router.get("/profile", requireAuth, async (req, res) => {
  const m = me(req);
  let qr = null;
  // ถ้ากำลังตั้งค่า 2FA อยู่ ให้แสดง QR
  if (req.session.setupSecret) {
    const otpauth = authenticator.keyuri(m.username, "Yuyenpensuk CMS", req.session.setupSecret);
    qr = await QRCode.toDataURL(otpauth);
  }
  res.render("admin/profile", { me: m, page: "profile", qr, msg: req.query.msg || null, err: req.query.err || null });
});
router.post("/profile", requireAuth, (req, res) => {
  const m = me(req);
  m.name = req.body.name || m.name;
  m.email = req.body.email || "";
  m.phone = req.body.phone || "";
  save();
  res.redirect("/admin/profile?msg=บันทึกข้อมูลแล้ว");
});
router.post("/profile/password", requireAuth, (req, res) => {
  const m = me(req);
  if (!bcrypt.compareSync(req.body.current || "", m.password_hash))
    return res.redirect("/admin/profile?err=รหัสผ่านปัจจุบันไม่ถูกต้อง");
  if ((req.body.password || "").length < 8)
    return res.redirect("/admin/profile?err=รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร");
  m.password_hash = bcrypt.hashSync(req.body.password, 10);
  save();
  res.redirect("/admin/profile?msg=เปลี่ยนรหัสผ่านแล้ว");
});
/* เริ่มตั้งค่า 2FA → สร้าง secret + แสดง QR */
router.post("/profile/2fa/setup", requireAuth, (req, res) => {
  req.session.setupSecret = authenticator.generateSecret();
  res.redirect("/admin/profile");
});
/* ยืนยัน OTP จากแอปเพื่อเปิดใช้ 2FA */
router.post("/profile/2fa/confirm", requireAuth, (req, res) => {
  const m = me(req);
  const token = (req.body.token || "").replace(/\s/g, "");
  if (req.session.setupSecret && authenticator.check(token, req.session.setupSecret)) {
    m.twofa_enabled = true;
    m.twofa_secret = req.session.setupSecret;
    delete req.session.setupSecret;
    save();
    return res.redirect("/admin/profile?msg=เปิดใช้ 2FA แล้ว");
  }
  res.redirect("/admin/profile?err=รหัส OTP ไม่ถูกต้อง");
});
router.post("/profile/2fa/disable", requireAuth, (req, res) => {
  const m = me(req);
  m.twofa_enabled = false;
  m.twofa_secret = "";
  delete req.session.setupSecret;
  save();
  res.redirect("/admin/profile?msg=ปิดใช้ 2FA แล้ว");
});

module.exports = router;
