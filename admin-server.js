/**
 * admin-server.js — เว็บระบบแอดมิน (หลังบ้าน) บริษัท อยู่เย็นเป็นสุข วิศวกรรม จำกัด
 * แยกเป็นเว็บคนละตัวจากเว็บหลักโดยสิ้นเชิง — คนละโปรเซส คนละพอร์ต
 * รัน: npm run start:admin  แล้วเปิด http://localhost:4000
 * (ผู้ใช้เริ่มต้น admin / admin123 — เข้าระบบครั้งแรกแล้วเปลี่ยนรหัสผ่านทันที)
 *
 * ตอน deploy จริง แนะนำให้ชี้โดเมนย่อยแยกต่างหาก เช่น admin.yuyenpensuk.co.th
 * ไปที่โปรเซสนี้ (คนละ container/คนละ service กับเว็บหลักก็ได้) เพื่อไม่ให้เว็บหลัก
 * มีเส้นทางหรือลิงก์ใด ๆ เชื่อมไปยังระบบแอดมินเลย
 */
const express = require("express");
const session = require("express-session");
const path = require("path");
const database = require("./database");
const securityHeaders = require("./middleware/securityHeaders");

database.load(); // ใช้ไฟล์ฐานข้อมูลเดียวกับเว็บหลัก (data/db.json)

const app = express();
const PORT = process.env.ADMIN_PORT || 4000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(securityHeaders);
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(process.env.UPLOAD_DIR || path.join(__dirname, "uploads")));

const DEFAULT_SECRET = "yuyenpensuk-admin-change-this-secret";
if (!process.env.SESSION_SECRET) {
  console.warn(
    "⚠️  คำเตือนความปลอดภัย: ยังไม่ได้ตั้งค่า SESSION_SECRET — ระบบใช้ค่าเริ่มต้นที่รู้กันทั่วไปอยู่ ก่อน deploy จริง กรุณาตั้งค่าตัวแปรแวดล้อม SESSION_SECRET เป็นค่าสุ่มที่คาดเดาไม่ได้ (เช่น รันคำสั่ง: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"
  );
}

app.set("trust proxy", 1); // จำเป็นถ้า deploy หลัง reverse proxy/HTTPS (เช่น Render, Railway, Nginx) เพื่อให้ cookie "secure" ทำงานถูกต้อง

app.use(
  session({
    secret: process.env.SESSION_SECRET || DEFAULT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 ชั่วโมง
      sameSite: "lax", // กันการส่ง cookie ข้ามเว็บไซต์แบบไม่ตั้งใจ (CSRF พื้นฐาน)
      secure: process.env.NODE_ENV === "production" // บังคับส่งผ่าน HTTPS เท่านั้นตอน deploy จริง
    }
  })
);

app.use((req, res, next) => {
  database.reloadIfChanged();
  res.locals.company = database.get().company;
  res.locals.session = req.session;
  next();
});

/* ---------- ป้องกัน CSRF (Cross-Site Request Forgery) ----------
 * สร้าง token สุ่มผูกกับ session ของผู้ใช้แต่ละคน แปะไว้ในทุกฟอร์ม (input _csrf)
 * แล้วตรวจสอบทุกครั้งที่มีการ POST ว่า token ตรงกับของ session นั้นจริง
 * ป้องกันเว็บอื่นแอบส่งคำสั่ง (เช่น ลบข้อมูล/เปลี่ยนรหัสผ่าน) แทนแอดมินที่ login ค้างไว้ */
const crypto = require("crypto");
app.use((req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  res.locals.csrfToken = req.session.csrfToken;
  next();
});
app.use((req, res, next) => {
  if (req.method !== "POST") return next();
  // ฟอร์มที่มีการอัปโหลดไฟล์ (multipart/form-data) — req.body ยังว่างอยู่ตรงนี้เพราะ multer
  // ยัง parse ไม่เสร็จ (ทำงานทีหลังภายใน route เอง) จึงต้องข้ามไปตรวจ CSRF ในนั้นแทน
  const ct = req.headers["content-type"] || "";
  if (ct.startsWith("multipart/form-data")) return next();
  const sent = req.body && req.body._csrf;
  if (sent && sent === req.session.csrfToken) return next();
  console.warn("CSRF token ไม่ถูกต้องหรือไม่มี — ปฏิเสธคำขอจาก", req.ip, req.originalUrl);
  return res.status(403).render("admin/error", {
    title: "คำขอไม่ผ่านการตรวจสอบความปลอดภัย",
    message: "อาจเป็นเพราะฟอร์มหมดอายุ (เปิดค้างไว้นานเกินไป) กรุณากลับไปหน้าเดิมแล้วลองใหม่อีกครั้ง"
  });
});

// เมานต์ที่ "/admin" เหมือนเดิม (ลิงก์ภายในหน้าแอดมินทั้งหมดอ้างอิงพาธนี้อยู่แล้ว)
// แต่ตอนนี้รันอยู่คนละโปรเซส/คนละพอร์ตกับเว็บหลักอย่างสิ้นเชิง
app.use("/admin", require("./routes/admin"));
app.get("/", (req, res) => res.redirect("/admin"));

// 404 — ไม่พบหน้า
app.use((req, res) => res.status(404).render("admin/error", {
  title: "ไม่พบหน้าที่ต้องการ",
  message: "หน้านี้อาจถูกลบหรือย้ายไปแล้ว"
}));

// ตาข่ายนิรภัยสุดท้าย: ดักข้อผิดพลาดทุกชนิดที่หลุดมาถึงจุดนี้
// ไม่ให้ผู้ใช้เห็นจอขาว/stack trace ดิบของ Node.js อีกต่อไป
app.use((err, req, res, next) => {
  console.error("Admin error:", err);
  res.status(500).render("admin/error", {
    title: "เกิดข้อผิดพลาด",
    message: "ระบบมีปัญหาชั่วคราว กรุณาลองใหม่อีกครั้ง หรือย้อนกลับไปหน้าก่อนหน้า"
  });
});

app.listen(PORT, () =>
  console.log(`🔐 ระบบแอดมินพร้อมใช้งานที่ http://localhost:${PORT}/admin`)
);
