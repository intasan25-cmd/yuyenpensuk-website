/**
 * middleware/rateLimit.js — ป้องกันการเดารหัสผ่าน/OTP ซ้ำ ๆ (Brute-force)
 * เก็บสถิติไว้ในหน่วยความจำ (พอเพียงสำหรับเว็บขนาดเล็ก-กลาง ไม่ต้องพึ่งฐานข้อมูลภายนอก)
 * ถ้าต้องการรองรับหลายเซิร์ฟเวอร์พร้อมกัน (scale ใหญ่) ควรย้ายไปเก็บใน Redis แทน
 */

const attempts = new Map(); // key -> { count, firstAt, blockedUntil }

const WINDOW_MS = 15 * 60 * 1000; // นับความถี่ใน 15 นาที
const MAX_ATTEMPTS = 5; // ผิดได้ไม่เกิน 5 ครั้ง
const BLOCK_MS = 15 * 60 * 1000; // ถ้าเกิน ให้ล็อก 15 นาที

// ล้างข้อมูลเก่าเป็นระยะกันหน่วยความจำบวมเรื่อย ๆ
setInterval(() => {
  const now = Date.now();
  for (const [key, v] of attempts) {
    if ((!v.blockedUntil || v.blockedUntil < now) && now - v.firstAt > WINDOW_MS) attempts.delete(key);
  }
}, 10 * 60 * 1000).unref();

function keyOf(req, tag) {
  // ผูกกับ IP + ชื่อผู้ใช้ที่กรอก (กันคนอื่นโดนล็อกเพราะมีคนพยายามเดา username อื่นจาก IP เดียวกัน)
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const user = (req.body?.username || "").toLowerCase().trim();
  return `${tag}:${ip}:${user}`;
}

/** ตรวจก่อนประมวลผล — ถ้าถูกล็อกอยู่ ให้ปฏิเสธทันที ไม่ต้องเช็ครหัสผ่านเลย */
function checkLimit(tag) {
  return (req, res, next) => {
    const key = keyOf(req, tag);
    const rec = attempts.get(key);
    if (rec && rec.blockedUntil && rec.blockedUntil > Date.now()) {
      const minsLeft = Math.ceil((rec.blockedUntil - Date.now()) / 60000);
      return res.status(429).render(tag === "otp" ? "admin/otp" : "admin/login", {
        error: `พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารออีก ${minsLeft} นาทีแล้วลองใหม่`
      });
    }
    next();
  };
}

/** เรียกตอนพยายามล็อกอิน/กรอก OTP ผิด — นับเพิ่ม 1 ครั้ง แล้วล็อกถ้าเกินกำหนด */
function recordFailure(req, tag) {
  const key = keyOf(req, tag);
  const now = Date.now();
  const rec = attempts.get(key) || { count: 0, firstAt: now, blockedUntil: 0 };
  if (now - rec.firstAt > WINDOW_MS) { rec.count = 0; rec.firstAt = now; } // เริ่มนับใหม่ถ้าพ้นช่วงเวลาแล้ว
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) rec.blockedUntil = now + BLOCK_MS;
  attempts.set(key, rec);
}

/** เรียกตอนล็อกอิน/OTP สำเร็จ — ล้างสถิติของ key นั้นทิ้ง */
function recordSuccess(req, tag) {
  attempts.delete(keyOf(req, tag));
}

module.exports = { checkLimit, recordFailure, recordSuccess };
