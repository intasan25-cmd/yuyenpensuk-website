// main.js — อยู่เย็นเป็นสุข วิศวกรรม
(function () {
  "use strict";

  /* ---------- เมนูมือถือ ---------- */
  var header = document.querySelector(".sh");
  var burger = document.querySelector(".burger");
  if (burger && header) {
    burger.addEventListener("click", function () {
      header.classList.toggle("open");
    });
    header.querySelectorAll("nav a").forEach(function (a) {
      a.addEventListener("click", function () { header.classList.remove("open"); });
    });
  }

  /* ---------- Lightbox: คลิกรูปดูพรีวิวแบบสมูท ---------- */
  // element ที่คลิกเปิด lightbox ต้องมี data-lightbox="กลุ่ม" และ data-src="url เต็ม"
  var groups = {};
  document.querySelectorAll("[data-lightbox]").forEach(function (el) {
    var g = el.getAttribute("data-lightbox");
    (groups[g] = groups[g] || []).push(el);
  });

  if (Object.keys(groups).length) {
    var lb = document.createElement("div");
    lb.className = "lightbox";
    lb.innerHTML =
      '<div class="lb-img-wrap">' +
      '<img alt="">' +
      '<button class="lb-close" aria-label="ปิด" type="button"><iconify-icon icon="mdi:close"></iconify-icon></button>' +
      '<button class="lb-prev" aria-label="ก่อนหน้า" type="button"><iconify-icon icon="mdi:chevron-left"></iconify-icon></button>' +
      '<button class="lb-next" aria-label="ถัดไป" type="button"><iconify-icon icon="mdi:chevron-right"></iconify-icon></button>' +
      '<div class="lb-count"></div>' +
      "</div>";
    document.body.appendChild(lb);
    var lbImg = lb.querySelector("img");
    var lbCount = lb.querySelector(".lb-count");
    var curGroup = [];
    var curIndex = 0;

    function show(i) {
      curIndex = (i + curGroup.length) % curGroup.length;
      var srcEl = curGroup[curIndex];
      var img = srcEl.querySelector("img");
      var src = srcEl.getAttribute("data-src") || (img ? img.src : "");
      lbImg.src = src;
      lbCount.textContent = curGroup.length > 1 ? (curIndex + 1) + " / " + curGroup.length : "";
    }
    function open(groupName, index) {
      curGroup = groups[groupName];
      show(index);
      lb.classList.add("open");
      document.body.style.overflow = "hidden";
    }
    function close() {
      lb.classList.remove("open");
      document.body.style.overflow = "";
    }
    Object.keys(groups).forEach(function (g) {
      groups[g].forEach(function (el, i) {
        el.style.position = el.style.position || "relative";
        el.addEventListener("click", function (e) {
          e.preventDefault();
          open(g, i);
        });
        // เติม hint ไอคอนแว่นขยายให้ hover เห็น (ถ้ายังไม่มี)
        if (!el.querySelector(".zoom-hint")) {
          el.classList.add("zoomable");
          var hint = document.createElement("span");
          hint.className = "zoom-hint";
          hint.innerHTML = '<iconify-icon icon="mdi:magnify-plus-outline"></iconify-icon>';
          el.appendChild(hint);
        }
      });
    });
    lb.querySelector(".lb-close").addEventListener("click", close);
    lb.querySelector(".lb-prev").addEventListener("click", function () { show(curIndex - 1); });
    lb.querySelector(".lb-next").addEventListener("click", function () { show(curIndex + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(curIndex - 1);
      if (e.key === "ArrowRight") show(curIndex + 1);
    });
  }

  /* ---------- Hero Carousel: เลื่อนรูปอัตโนมัติแบบสไลด์โปรโมต ---------- */
  var carousel = document.getElementById("heroCarousel");
  if (carousel) {
    var slides = carousel.querySelectorAll(".slide");
    var dots = carousel.querySelectorAll(".hc-dot");
    var idx = 0;
    var timer = null;
    var AUTOPLAY_MS = 5000;

    function goTo(i) {
      idx = (i + slides.length) % slides.length;
      slides.forEach(function (s, j) { s.classList.toggle("active", j === idx); });
      dots.forEach(function (d, j) { d.classList.toggle("on", j === idx); });
    }
    function next() { goTo(idx + 1); }
    function start() {
      if (slides.length < 2) return;
      stop();
      timer = setInterval(next, AUTOPLAY_MS);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    dots.forEach(function (d) {
      d.addEventListener("click", function () {
        goTo(+d.getAttribute("data-slide"));
        start(); // รีเซ็ตนับเวลาใหม่เมื่อผู้ใช้กดเอง
      });
    });
    // พักการเลื่อนอัตโนมัติเมื่อเมาส์ชี้อยู่ (ให้เวลาอ่าน) แล้วเล่นต่อเมื่อยกเมาส์ออก
    carousel.addEventListener("mouseenter", stop);
    carousel.addEventListener("mouseleave", start);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) start();
  }

  /* ---------- ค่อย ๆ ปรากฏเมื่อเลื่อนถึง (เคารพ prefers-reduced-motion) ----------
     หมายเหตุด้านความปลอดภัย: ครอบเฉพาะการ์ด/feature ย่อย ไม่ครอบทั้ง section
     เพื่อไม่ให้เนื้อหาทั้งหมดหายไปถ้า IntersectionObserver ทำงานผิดพลาด
     และมี fallback บังคับแสดงผลหลัง 1.2 วินาที เผื่อกรณี JS โหลดช้าหรือพลาด */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealEls = document.querySelectorAll(".card, .feat");
  if (!reduceMotion && "IntersectionObserver" in window && revealEls.length) {
    revealEls.forEach(function (el) { el.classList.add("reveal"); });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -20px 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
    // ตาข่ายนิรภัย: ถ้ายังไม่ปรากฏภายใน 1.2 วิ ให้บังคับแสดงทั้งหมดกันเนื้อหาหาย
    setTimeout(function () {
      document.querySelectorAll(".reveal:not(.in)").forEach(function (el) {
        el.classList.add("in");
      });
    }, 1200);
  }
})();
