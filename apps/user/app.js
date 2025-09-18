// app.js — UI + Event handlers (import ใช้ Firebase จาก api.js)
import {
  ensureAnonymousSignIn,
  getMember,
  createMember,
  updateMemberName,
  getPublicRewards,
  getLatestRedeemLog,
  updateMemberLastRedeem,
  db,
} from "./api.js";

import {
  doc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// === App settings ===
const welcomePoints = 5;
let flipped = false;
let currentLang = "th";
let unsubscribeMember = null;
let unsubscribeLogs = null;

// ===== Toast & Modal helpers =====
const toastEl = document.getElementById("toast");
const nameModal = document.getElementById("nameModal");
const nameCard = document.getElementById("nameCard");
const nameInput = document.getElementById("nameInput");
const nameError = document.getElementById("nameError");
const nameCancelBtn = document.getElementById("nameCancelBtn");
const nameSaveBtn = document.getElementById("nameSaveBtn");

let phoneForRename = null;

function toast(msg, type = "info") {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  toastEl.style.backgroundColor =
    type === "success" ? "#16a34a" : type === "error" ? "#dc2626" : "#111827";
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), 1800);
}

function openNameModal(phone, currentName = "") {
  if (!nameModal) return;
  phoneForRename = phone;
  nameInput.value = currentName || "";
  nameError.classList.add("hidden");
  nameModal.classList.remove("hidden");
  // play enter anim
  requestAnimationFrame(() => {
    nameCard.classList.remove("opacity-0", "translate-y-2");
  });
  setTimeout(() => nameInput.focus(), 50);
}

function closeNameModal() {
  if (!nameModal) return;
  nameCard.classList.add("opacity-0", "translate-y-2");
  setTimeout(() => nameModal.classList.add("hidden"), 140);
}

// backdrop click to close
if (nameModal) {
  nameModal.addEventListener("click", (e) => { if (e.target === nameModal) closeNameModal(); });
}
if (nameCancelBtn) nameCancelBtn.addEventListener("click", closeNameModal);
window.addEventListener("keydown", (e) => {
  if (!nameModal || nameModal.classList.contains("hidden")) return;
  if (e.key === "Escape") closeNameModal();
  if (e.key === "Enter") submitRename();
});

async function submitRename() {
  const newName = nameInput.value.trim();
  if (!newName) {
    nameError.classList.remove("hidden");
    return;
  }
  nameSaveBtn.disabled = true;
  try {
    await updateMemberName(phoneForRename, newName);
    const nameTextEl = document.getElementById("nameText");
    if (nameTextEl) nameTextEl.innerText = newName;
    toast("✅ เปลี่ยนชื่อสำเร็จ", "success");
    closeNameModal();
  } catch (err) {
    console.error(err);
    toast("❌ เปลี่ยนชื่อไม่สำเร็จ", "error");
  } finally {
    nameSaveBtn.disabled = false;
  }
}
if (nameSaveBtn) nameSaveBtn.addEventListener("click", submitRename);

// === I18N ===
const translations = {
  th: {
    signupTitle: "📝 สมัครสมาชิก",
    signinTitle: "🔐 เข้าสู่ระบบ",
    rewardTitle: "🎁 ของรางวัล",
    followTitle: "📣 ติดตามข่าวสาร",
    langToggle: "🌐 EN",
    registerHeader: "📝 สมัครสมาชิก",
    registerNote: "(สมัครครั้งแรกรับไปเลย 5 แต้ม)",
    registerPlaceholder: "📱 เบอร์โทร เช่น 0881234567",
    registerButton: "✅ สมัคร",
    signinPlaceholder: "📞 เบอร์โทร",
    signinButton: "🔐 เข้าสู่ระบบ",
    logoutButton: "🔒 ออก",
  },
  en: {
    signupTitle: "📝 Sign up",
    signinTitle: "🔐 Sign in",
    rewardTitle: "🎁 Rewards",
    followTitle: "📣 Follow Us",
    langToggle: "🌐 TH",
    registerHeader: "📝 Sign up",
    registerNote: "(Get 5 welcome points)",
    registerPlaceholder: "📱 Phone e.g. 0881234567",
    registerButton: "✅ Register",
    signinPlaceholder: "📞 Phone number",
    signinButton: "🔐 Sign in",
    logoutButton: "🔒 Logout",
  },
};

function applyTranslations() {
  const langBtn = document.getElementById("langToggleBtn");
  if (langBtn) langBtn.textContent = translations[currentLang].langToggle;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (translations[currentLang][key]) el.textContent = translations[currentLang][key];
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (translations[currentLang][key]) el.placeholder = translations[currentLang][key];
  });
}

window.toggleLanguage = function () {
  currentLang = currentLang === "th" ? "en" : "th";
  applyTranslations();
};

// === Flip Card ===
window.flipCard = function () {
  const card = document.getElementById("flipCard");
  flipped = !flipped;
  card.classList.toggle("flipped", flipped);
};

// === Google Drive image helper ===
function getDriveId(url) {
  if (!url) return "";
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return (m1 && m1[1]) || (m2 && m2[1]) || "";
}
function buildDriveUrls(url) {
  const id = getDriveId(url);
  if (!id) return { view: url || "img/placeholder.jpg", thumb: url || "img/placeholder.jpg" };
  return {
    view: `https://drive.google.com/uc?export=view&id=${id}`,
    thumb: `https://drive.google.com/thumbnail?id=${id}&sz=w1200`
  };
}

// === UI: การ์ดของรางวัล ===
function rewardCard(item) {
  const { view, thumb } = buildDriveUrls(item.imageUrl);
  const img = view;
  const title = item.title || "-";
  const desc = item.description || "";
  const pts = Number(item.points || 0);

  return `
    <div class="group relative overflow-hidden rounded-2xl ring-1 ring-black/5 shadow-sm hover:shadow-lg transition-all duration-300 bg-white">
      <figure class="relative">
        <img src="${img}" alt="${title}"
             onclick="openModal('${img}')"
             referrerpolicy="no-referrer"
             class="block w-full h-auto cursor-pointer"
             onerror="this.onerror=null; this.src='${thumb}';">
        <div class="absolute top-3 left-3 z-10 px-3 py-1 rounded-full 
            text-xs font-semibold text-black bg-white shadow-md">
            ${pts} แต้ม
        </div>
        <figcaption class="absolute inset-x-0 bottom-0 p-4 pt-10
                           bg-gradient-to-t from-black/70 via-black/30 to-transparent">
          <h3 class="text-white font-semibold text-base leading-tight line-clamp-1">${title}</h3>
          ${desc ? `<p class="text-white/80 text-sm mt-1 line-clamp-2">${desc}</p>` : ""}
          <p class="text-white/60 text-xs mt-1">แลกได้ที่พนักงานเมื่อแต้มถึง</p>
        </figcaption>
      </figure>
    </div>
  `;
}

// === โหลดของรางวัลจาก Firestore ===
async function loadRewards() {
  const grid = document.getElementById("rewardGrid");
  if (!grid) return;

  grid.innerHTML = `
    <div class="animate-pulse bg-gray-200 h-44 rounded-lg"></div>
    <div class="animate-pulse bg-gray-200 h-44 rounded-lg"></div>
  `;

  try {
    const items = await getPublicRewards();
    grid.innerHTML = items.length
      ? items.map(rewardCard).join("")
      : `<div class="text-center text-gray-500">ยังไม่มีของรางวัลที่เปิดใช้งาน</div>`;
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="text-center text-red-600">โหลดของรางวัลไม่สำเร็จ</div>`;
  }
}

// === Helper: ฟอร์แมตเวลา/วันเกิดแบบไทย ===
function formatThaiDateTime(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "ยังไม่เคยแลกของรางวัล";
  return d.toLocaleString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function formatThaiBirthday(value) {
  if (!value || value === "-") return "คุณไม่ได้ใส่วันเกิด";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "คุณไม่ได้ใส่วันเกิด";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

function listenMember(phone) {
  const ref = doc(db, "members", phone);
  unsubscribeMember = onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      document.getElementById("nameText").textContent = data.name || "-";
      document.getElementById("pointsText").textContent = data.points ?? 0;
      document.getElementById("rewardText").textContent = data.reward || "-";
    }
  });
}

function listenLatestRedeem(phone) {
  const q = query(
    collection(db, "redeem_logs"),
    where("phone", "==", phone),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  unsubscribeLogs = onSnapshot(q, (snapshot) => {
    snapshot.forEach((doc) => {
      const log = doc.data();
      if (log.rewardName) {
        document.getElementById("rewardText").textContent = log.rewardName;
      }
      if (log.createdAt) {
        const t = log.createdAt.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
        document.getElementById("timeText").textContent = formatThaiDateTime(t);
      }
    });
  });
}

function stopListeners() {
  if (unsubscribeMember) unsubscribeMember();
  if (unsubscribeLogs) unsubscribeLogs();
}

// === App lifecycle ===
document.addEventListener("DOMContentLoaded", () => {
  applyTranslations();
  ensureAnonymousSignIn();

  // สลับหน้า
  window.toggleSection = function (id) {
    document.querySelectorAll(".section").forEach((sec) => {
      sec.classList.toggle("hidden", sec.id !== id || !sec.classList.contains("hidden"));
    });
    document.getElementById("flipCardSection")?.classList.add("hidden");
    if (id === "rewardSection") loadRewards();
  };

  // สมัครสมาชิก
  window.registerUser = async function () {
    const phone = document.getElementById("registerPhone").value.trim();
    const name = document.getElementById("registerName").value.trim();
    const birthday = document.getElementById("registerBirthday").value || "-";
    const resultDiv = document.getElementById("registerResult");

    if (!/^0\d{9}$/.test(phone) || !name) {
      resultDiv.innerHTML = `<p class="text-red-500">❌ กรุณากรอกชื่อและเบอร์ให้ถูกต้อง</p>`;
      toast("กรุณากรอกข้อมูลให้ถูกต้อง", "error");
      return;
    }

    try {
      const existed = await getMember(phone);
      if (existed) {
        resultDiv.innerHTML = `<p class="text-red-500">⚠️ เบอร์นี้สมัครแล้ว: ${existed.name}</p>`;
        toast("เบอร์นี้สมัครแล้ว", "error");
        return;
      }

      const saved = await createMember({ phone, name, birthday, welcomePoints });
      resultDiv.innerHTML = `
        <p class="text-green-500">
          ✅ สมัครสำเร็จในชื่อ: <strong>${saved.name || name}</strong>
          และได้รับ ${welcomePoints} แต้ม (รวมปัจจุบัน: ${saved.points ?? welcomePoints})
        </p>`;
      toast(`สมัครสำเร็จ! ได้รับ ${welcomePoints} แต้ม`, "success");

      document.getElementById("registerPhone").value = "";
      document.getElementById("registerName").value = "";
      document.getElementById("registerBirthday").value = "";
    } catch (err) {
      console.error(err);
      toast("ไม่สามารถเชื่อมต่อได้", "error");
    }
  };

  // ดาวน์โหลด QR
  window.downloadQR = function (event) {
    event.stopPropagation();
    const qrCanvas = document.querySelector("#qrCodeContainer canvas");
    if (!qrCanvas) return toast("QR ยังไม่พร้อม", "error");
    const link = document.createElement("a");
    link.download = "qrcode.png";
    link.href = qrCanvas.toDataURL();
    link.click();
    toast("ดาวน์โหลด QR แล้ว", "success");
  };

  // เข้าสู่ระบบ: อ่านข้อมูลตามเบอร์
  window.searchPhone = async function () {
    const phone = document.getElementById("searchPhone").value.trim();
    if (!/^0\d{9}$/.test(phone)) return toast("กรุณากรอกเบอร์ให้ถูกต้อง", "error");

    try {
      const data = await getMember(phone);
      if (!data) {
        toast("ไม่พบข้อมูลลูกค้า", "error");
        return;
      }

      // เปิดหน้าบัตร
      document.getElementById("search").classList.add("hidden");
      document.getElementById("flipCardSection").classList.remove("hidden");
      document.getElementById("qrPhoneLabel").textContent = `เบอร์โทร: ${data.phone}`;
      document.getElementById("changeNameBtn").onclick = () => changeName(data.phone);
      document.getElementById("logoutBtn").classList.remove("hidden");

      // ตั้งค่าพื้นฐานจาก members ก่อน
      document.getElementById("nameText").textContent = data.name || "-";
      document.getElementById("pointsText").textContent = data.points ?? 0;

      // เวลาเริ่มต้นจาก members
      const timeEl = document.getElementById("timeText");
      const memberTime =
        (data.time && typeof data.time.toDate === "function")
          ? data.time.toDate()
          : (data.time ? new Date(data.time) : null);
      timeEl.textContent = memberTime
        ? formatThaiDateTime(memberTime)
        : "ยังไม่เคยแลกของรางวัล";

      // รางวัลเริ่มจาก members
      document.getElementById("rewardText").textContent = data.reward || "-";
      listenMember(data.phone);
      listenLatestRedeem(data.phone);
      // sync จาก redeem_logs
      try {
        const latest = await getLatestRedeemLog(data.phone);
        if (latest && latest.rewardName) {
          document.getElementById("rewardText").textContent = latest.rewardName;

          const t = (latest.createdAt && typeof latest.createdAt.toDate === "function")
            ? latest.createdAt.toDate()
            : (latest.createdAt ? new Date(latest.createdAt) : null);
          if (t) timeEl.textContent = formatThaiDateTime(t);

          await updateMemberLastRedeem(
            data.phone,
            latest.rewardName,
            latest.createdAt || null
          );
        }
      } catch (e) {
        console.warn("sync latest redeem failed:", e);
      }

      // วันเกิด
      document.getElementById("birthdayText").textContent = formatThaiBirthday(data.birthday);

      // สร้าง QR code
      const qrContainer = document.getElementById("qrCodeContainer");
      qrContainer.innerHTML = "";

      // ✅ ขยายขนาด และเพิ่มระดับ error correction
      new QRCode(qrContainer, {
        text: data.phone,          // ข้อมูลที่ต้องการ encode
        width: 256,                // ขนาดกว้าง
        height: 256,               // ขนาดสูง
        correctLevel: QRCode.CorrectLevel.M, // แนะนำใช้ M หรือ H
        colorDark: "#000000",      // สี QR
        colorLight: "#ffffff"      // สีพื้นหลัง (ขาวสนิท)
      });

      // ✅ ป้องกันเบลอในบางเครื่อง Android
      const canvas = qrContainer.querySelector("canvas");
      if (canvas) {
        canvas.style.imageRendering = "pixelated";
      }

      // รีเซ็ตการ์ดเป็นด้านหน้า
      document.getElementById("flipCard").classList.remove("flipped");
      flipped = false;

      toast("เข้าสู่ระบบสำเร็จ", "success");
    } catch (err) {
      console.error(err);
      toast("เกิดข้อผิดพลาด", "error");
    }
  };

  // เปลี่ยนชื่อ → เปิดโมดัล (แทน prompt)
  window.changeName = function (phone) {
    const current = document.getElementById("nameText")?.innerText || "";
    openNameModal(phone, current);
  };

  // ออกจากระบบ (ฝั่ง UI)
  window.logout = function () {
    stopListeners();
    document.getElementById("search").classList.remove("hidden");
    document.getElementById("searchPhone").value = "";
    document.getElementById("flipCardSection").classList.add("hidden");
    document.getElementById("logoutBtn").classList.add("hidden");
    toast("ออกจากระบบแล้ว", "info");
  };
});

// ==== Modal functions (single source of truth) ====
(() => {
  const modal = document.getElementById("imageModal");
  const imgEl = document.getElementById("modalImage");

  window.openModal = (imgUrl) => {
    imgEl.src = imgUrl;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  };

  window.closeModal = () => {
    modal.classList.remove("flex");
    modal.classList.add("hidden");
  };

  // ปิดเมื่อคลิกพื้นหลัง
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) window.closeModal();
  });
})();
