/**
 * middleware/securityHeaders.js — ใส่ HTTP header ด้านความปลอดภัยพื้นฐาน
 * (ทำหน้าที่คล้าย helmet.js แบบเบา ๆ โดยไม่ต้องเพิ่ม dependency ใหม่)
 */
function securityHeaders(req, res, next) {
  // กัน Clickjacking — ห้ามเว็บอื่นเอาไปฝังใน <iframe>
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  // กันเบราว์เซอร์เดาชนิดไฟล์เอง (MIME-sniffing) ซึ่งอาจถูกใช้หลอกรันสคริปต์
  res.setHeader("X-Content-Type-Options", "nosniff");
  // ไม่ส่ง URL หน้าปัจจุบันทั้งหมดไปเว็บปลายทางตอนกดลิงก์ออกนอกเว็บ
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // ปิดการใช้งาน API ที่ไม่จำเป็นสำหรับเว็บนี้ (กล้อง/ไมค์/ตำแหน่ง)
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

module.exports = securityHeaders;
