// app.js — UI + Event handlers (import ใช้ Firebase จาก api.js)
import {
  ensureAnonymousSignIn,
  getMember,
  createMember,
  updateMemberName,
  getPublicRewards,
  getLatestRedeemLog,
  updateMemberLastRedeem,
} from "./api.js";

// === App settings ===
const welcomePoints = 5;
let flipped = false;
let currentLang = "th";

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

// === Google Drive image helper (ใช้สำหรับภาพรางวัลที่ฝากบน Drive — ไม่เกี่ยวกับ Google Sheet) ===
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
        <img src="${img}" alt="${title}" referrerpolicy="no-referrer" class="block w-full h-auto"
             onerror="this.onerror=null; this.src='${thumb}';">
        <div class="absolute top-3 left-3 z-10 px-3 py-1 rounded-full text-xs font-semibold text-white
                    bg-gradient-to-r from-rose-600 to-red-500 shadow-md">
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

// === โหลดของรางวัลจาก Firestore (rewards_public) ===
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

// === App lifecycle ===
document.addEventListener("DOMContentLoaded", () => {
  applyTranslations();
  ensureAnonymousSignIn(); // ให้ rules อ่านว่า isSignedIn() ได้

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
      return;
    }

    try {
      const existed = await getMember(phone);
      if (existed) {
        resultDiv.innerHTML = `<p class="text-red-500">⚠️ เบอร์นี้สมัครแล้ว: ${existed.name}</p>`;
        alert("⚠️ เบอร์นี้ได้สมัครไว้แล้ว");
        return;
      }

      const saved = await createMember({ phone, name, birthday, welcomePoints });
      resultDiv.innerHTML = `
        <p class="text-green-500">
          ✅ สมัครสำเร็จในชื่อ: <strong>${saved.name || name}</strong>
          และได้รับ ${welcomePoints} แต้ม (รวมปัจจุบัน: ${saved.points ?? welcomePoints})
        </p>`;
      alert(`✅ สมัครสำเร็จ! ได้รับ ${welcomePoints} แต้ม (รวม: ${saved.points ?? welcomePoints})`);

      document.getElementById("registerPhone").value = "";
      document.getElementById("registerName").value = "";
      document.getElementById("registerBirthday").value = "";
    } catch (err) {
      console.error(err);
      alert("❌ ไม่สามารถเชื่อมต่อได้");
    }
  };

  // ดาวน์โหลด QR
  window.downloadQR = function (event) {
    event.stopPropagation();
    const qrCanvas = document.querySelector("#qrCodeContainer canvas");
    if (!qrCanvas) return alert("QR ยังไม่พร้อม");
    const link = document.createElement("a");
    link.download = "qrcode.png";
    link.href = qrCanvas.toDataURL();
    link.click();
  };

  // เข้าสู่ระบบ: อ่านข้อมูลตามเบอร์
  // เข้าสู่ระบบ: อ่านข้อมูลตามเบอร์ (เวอร์ชันแก้เรียบร้อย)
  window.searchPhone = async function () {
    const phone = document.getElementById("searchPhone").value.trim();
    if (!/^0\d{9}$/.test(phone)) return alert("❌ กรุณากรอกเบอร์ให้ถูกต้อง");

    try {
      const data = await getMember(phone);
      if (!data) {
        alert("❌ ไม่พบข้อมูลลูกค้า");
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

      // เวลาเริ่มต้นจาก members (กันโดนทับเป็นค่าว่าง)
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

      // ซิงก์จาก redeem_logs → อัปเดต UI และเขียนกลับไปที่ members
      try {
        const latest = await getLatestRedeemLog(data.phone);
        if (latest && latest.rewardName) {
          // อัปเดต UI จาก log (เชื่อถือได้สุด)
          document.getElementById("rewardText").textContent = latest.rewardName;

          const t = (latest.createdAt && typeof latest.createdAt.toDate === "function")
            ? latest.createdAt.toDate()
            : (latest.createdAt ? new Date(latest.createdAt) : null);
          if (t) timeEl.textContent = formatThaiDateTime(t);

          // อัปเดตกลับไปที่ members ให้ตรงกับ log ล่าสุด
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
      new QRCode(qrContainer, { text: data.phone, width: 100, height: 100 });

      // รีเซ็ตการ์ดเป็นด้านหน้า
      document.getElementById("flipCard").classList.remove("flipped");
      flipped = false;
    } catch (err) {
      console.error(err);
      alert("❌ เกิดข้อผิดพลาด");
    }
  };

  // เปลี่ยนชื่อ
  window.changeName = async function (phone) {
    const newName = prompt("🖋 กรอกชื่อใหม่:");
    if (!newName?.trim()) return alert("⚠️ คุณยังไม่ได้กรอกชื่อใหม่");

    try {
      await updateMemberName(phone, newName);
      document.getElementById("nameText").innerText = newName;
      alert("✅ เปลี่ยนชื่อสำเร็จ!");
    } catch (err) {
      console.error(err);
      alert("❌ เปลี่ยนชื่อไม่สำเร็จ");
    }
  };

  // ออกจากระบบ (ฝั่ง UI)
  window.logout = function () {
    document.getElementById("search").classList.remove("hidden");
    document.getElementById("searchPhone").value = "";
    document.getElementById("flipCardSection").classList.add("hidden");
    document.getElementById("logoutBtn").classList.add("hidden");
    alert("👋 ออกจากระบบแล้ว");
  };
});
