// admin.js — อยู่เย็นเป็นสุข วิศวกรรม CMS
(function () {
  "use strict";

  /* ---------- กรองหมวดหมู่สินค้าตามยี่ห้อ ---------- */
  // ชิปมี data-brand-target="brand-N" (หรือ "all" เพื่อโชว์ทั้งหมด)
  var chips = document.querySelectorAll("[data-brand-target]");
  var panels = document.querySelectorAll("[data-brand-panel]");
  if (chips.length && panels.length) {
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var target = chip.getAttribute("data-brand-target");
        chips.forEach(function (c) { c.classList.remove("dim"); });
        if (target === "all") {
          panels.forEach(function (p) { p.style.display = ""; });
        } else {
          chips.forEach(function (c) {
            if (c !== chip && c.getAttribute("data-brand-target") !== "all") c.classList.add("dim");
          });
          panels.forEach(function (p) {
            p.style.display = p.getAttribute("data-brand-panel") === target ? "" : "none";
          });
          document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }
})();
