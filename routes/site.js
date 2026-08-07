/** routes/site.js — หน้าเว็บไซต์ส่วนแสดงผล (Frontend) */
const express = require("express");
const router = express.Router();
const database = require("../database");

const db = () => database.get();

/* หน้าแรก */
router.get("/", (req, res) => {
  const d = db();
  const banners = d.banners.filter((b) => b.active).sort((a, b) => a.sort - b.sort);
  // สไลด์ Hero: สไลด์แรกเป็นข้อความแนะนำบริษัท ตามด้วยโปรโมชันจากแบนเนอร์ (เลื่อนอัตโนมัติ)
  const heroSlides = [
    {
      main: true,
      title: "ติดตั้ง ล้าง ซ่อม และจำหน่ายเครื่องปรับอากาศ",
      desc: "ดูแลเครื่องปรับอากาศครบวงจร ตั้งแต่เลือกซื้อ ติดตั้ง ดูแลรักษา จนถึงงานไฟฟ้าที่เกี่ยวข้อง โดยทีมช่างผู้ชำนาญ",
      image: (d.services[0] && d.services[0].image) || "https://images.pexels.com/photos/8496404/pexels-photo-8496404.jpeg?auto=compress&cs=tinysrgb&w=1600"
    },
    ...banners.map((b) => ({ main: false, title: b.title, image: b.image }))
  ];
  res.render("site/home", {
    active: "home",
    banners,
    heroSlides,
    services: d.services,
    products: (d.products.filter((p) => p.bestseller).length ? d.products.filter((p) => p.bestseller) : d.products.slice(0, 4)).slice(0, 4),
    projects: d.projects.slice(0, 3),
    brands: [...new Set(db().products.map((p) => p.brand))]
  });
});

/* บริการ */
router.get("/services", (req, res) => {
  const q = (req.query.q || "").trim();
  let list = db().services;
  if (q) list = list.filter((s) => (s.title + s.description).includes(q));
  res.render("site/services", { active: "services", services: list, q });
});
router.get("/services/:id", (req, res) => {
  const s = db().services.find((x) => x.id === +req.params.id);
  if (!s) return res.status(404).render("site/404");
  const others = db().services.filter((x) => x.id !== s.id).slice(0, 3);
  res.render("site/service-detail", { active: "services", s, others });
});

/* สินค้า */
router.get("/products", (req, res) => {
  const q = (req.query.q || "").trim();
  const brand = req.query.brand || "";
  let list = db().products;
  if (brand) list = list.filter((p) => p.brand === brand);
  if (q) list = list.filter((p) => (p.name + p.brand + p.model + p.spec).toLowerCase().includes(q.toLowerCase()));
  const brands = [...new Set(db().products.map((p) => p.brand))];
  res.render("site/products", { active: "products", products: list, brands, q, brand });
});
router.get("/products/:id", (req, res) => {
  const p = db().products.find((x) => x.id === +req.params.id);
  if (!p) return res.status(404).render("site/404");
  const related = db().products.filter((x) => x.brand === p.brand && x.id !== p.id).slice(0, 4);
  res.render("site/product-detail", { active: "products", p, related });
});

/* ผลงาน */
router.get("/projects", (req, res) => {
  const q = (req.query.q || "").trim();
  let list = db().projects;
  if (q) list = list.filter((p) => (p.title + p.category + p.description).includes(q));
  res.render("site/projects", { active: "projects", projects: list, q });
});
router.get("/projects/:id", (req, res) => {
  const p = db().projects.find((x) => x.id === +req.params.id);
  if (!p) return res.status(404).render("site/404");
  const others = db().projects.filter((x) => x.id !== p.id).slice(0, 3);
  res.render("site/project-detail", { active: "projects", p, others });
});

/* ค่าบริการติดตั้งแอร์ */
router.get("/pricing-install", (req, res) => {
  res.render("site/pricing-install", { active: "pricing", pricing: db().pricingInstall });
});

/* ค่าบริการล้างแอร์ */
router.get("/pricing-clean", (req, res) => {
  res.render("site/pricing-clean", { active: "pricing", pricing: db().pricingClean });
});

/* การชำระเงิน */
router.get("/payment", (req, res) => {
  res.render("site/payment", { active: "payment", payment: db().payment });
});

/* ยี่ห้อสินค้า — ดูแยกแต่ละยี่ห้อ */
router.get("/brands/:brand", (req, res) => {
  const brandName = req.params.brand;
  const all = db().products;
  const brands = [...new Set(all.map((p) => p.brand))];
  if (!brands.includes(brandName)) return res.status(404).render("site/404");
  const list = all.filter((p) => p.brand === brandName);
  res.render("site/brand", { active: "products", brandName, products: list, brands });
});

/* ---------- SEO: sitemap.xml + robots.txt ---------- */
router.get("/sitemap.xml", (req, res) => {
  const base = res.locals.baseUrl;
  const d = db();
  const urls = ["/", "/services", "/pricing-install", "/pricing-clean", "/products", "/projects", "/payment", "/contact"];
  d.services.forEach((s) => urls.push("/services/" + s.id));
  d.products.forEach((p) => urls.push("/products/" + p.id));
  [...new Set(d.products.map((p) => p.brand))].forEach((b) => urls.push("/brands/" + encodeURIComponent(b)));
  d.projects.forEach((p) => urls.push("/projects/" + p.id));
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join("\n") +
    "\n</urlset>";
  res.type("application/xml").send(xml);
});

router.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
    `User-agent: *\nAllow: /\n\nSitemap: ${res.locals.baseUrl}/sitemap.xml`
  );
});

/* ติดต่อเรา */
router.get("/contact", (req, res) => {
  const c = db().company;
  const q = encodeURIComponent(c.address || c.name);
  // ถ้าแอดมินใส่ลิงก์ Google Maps เอง (แม่นยำกว่า) ให้ใช้อันนั้น
  // ถ้ายังไม่ได้ใส่ ให้สร้างแผนที่อัตโนมัติจาก "ที่อยู่" ทันที ไม่ต้องตั้งค่าอะไรเพิ่ม
  const mapEmbedUrl = c.maps_url || `https://www.google.com/maps?q=${q}&output=embed`;
  const mapDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  res.render("site/contact", { active: "contact", mapEmbedUrl, mapDirectionsUrl });
});

module.exports = router;
