/**
 * server.js — เว็บไซต์หลัก (หน้าบ้าน) บริษัท อยู่เย็นเป็นสุข วิศวกรรม จำกัด
 * รัน: npm install แล้ว npm start จากนั้นเปิด http://localhost:3000
 *
 * ระบบแอดมินแยกเป็นเว็บคนละตัวโดยสิ้นเชิง (คนละโปรเซส/คนละพอร์ต) — ดู admin-server.js
 * เว็บหลักนี้ไม่มีลิงก์หรือเส้นทางใดเชื่อมไปยังระบบแอดมินเลย
 */
const express = require("express");
const path = require("path");
const database = require("./database");
const securityHeaders = require("./middleware/securityHeaders");

database.load(); // โหลด/สร้างฐานข้อมูล (ไฟล์เดียวกับที่แอดมินใช้แก้ไข)

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(securityHeaders);
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(process.env.UPLOAD_DIR || path.join(__dirname, "uploads")));

// ส่งข้อมูลบริษัทให้ทุก view ใช้ (header/footer)
app.use((req, res, next) => {
  // เช็คว่าไฟล์ฐานข้อมูลถูกแก้ไขจากระบบแอดมิน (คนละโปรเซส) หรือไม่ ถ้าใช่ให้โหลดใหม่
  // ทำให้การเพิ่ม/แก้ไข/ลบข้อมูลในแอดมินแสดงผลที่เว็บหลักทันที โดยไม่ต้องรีสตาร์ต
  database.reloadIfChanged();
  res.locals.company = database.get().company;
  // สำหรับ SEO: ตั้งค่า SITE_URL เป็นโดเมนจริงตอน deploy เช่น https://www.yuyenpensuk.co.th
  res.locals.baseUrl = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
  res.locals.path = req.path;
  next();
});

app.use("/", require("./routes/site"));

// 404
app.use((req, res) => res.status(404).render("site/404"));

// ตาข่ายนิรภัยสุดท้าย: ดักข้อผิดพลาดทุกชนิดที่หลุดมาถึงจุดนี้ ไม่ให้ผู้ใช้เห็นจอขาว/stack trace ดิบ
app.use((err, req, res, next) => {
  console.error("Site error:", err);
  res.status(500).render("site/404");
});

app.listen(PORT, () =>
  console.log(`✅ เว็บไซต์หลักพร้อมใช้งานที่ http://localhost:${PORT}`)
);
