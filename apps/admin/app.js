// app.js
import {
  sha256,
  getStaffByUsername,
  getStaffProfile,      // (เผื่อใช้ต่อยอด)
  listActiveRewards,
  addPointsToMember,
  redeemReward
} from "./api.js";

/* ============ LIFF login helper (ไม่ init ซ้ำ) ============ */
async function ensureLiffLogin() {
  if (!window.liff) return false;
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return false; // จะ redirect ไป login แล้วกลับมา
  }
  return !!liff.getAccessToken();
}

/* ============ Bootstrapping ============ */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await liff.init({ liffId: "2007661818-nmBNkzZ5" });
  } catch (e) {
    console.warn("LIFF init error:", e);
  }

  // บังคับมี access_token
  const ok = await ensureLiffLogin();
  if (!ok) return;

  // bind ปุ่ม Login (HTML ไม่มี onclick แล้ว)
  const btn = document.getElementById("loginBtn");
  if (btn) btn.addEventListener("click", login);

  restoreLogin();
});

/* ============ Utilities ============ */
function withButton(btn, busyText, task) {
  const textEl = btn.querySelector("[data-text]") || btn;
  const spinEl = btn.querySelector("[data-spin]");
  const oldText = textEl.textContent;

  btn.disabled = true;
  if (busyText) textEl.textContent = busyText;
  if (spinEl) spinEl.classList.remove("hidden");

  return Promise.resolve()
    .then(task)
    .finally(() => {
      btn.disabled = false;
      textEl.textContent = oldText;
      if (spinEl) spinEl.classList.add("hidden");
    });
}

function setStaffUI({ staffName, branchId }) {
  const hello = document.getElementById("helloSection");
  const login = document.getElementById("loginScreen");
  const bar = document.getElementById("staffBar");
  document.getElementById("staffNameLabel").textContent = staffName || "-";
  document.getElementById("branchIdLabel").textContent = branchId ?? "-";
  login.classList.add("hidden");
  hello.classList.remove("hidden");
  bar.classList.remove("hidden");
}

function restoreLogin() {
  const staffId = localStorage.getItem("staffId");
  const staffName = localStorage.getItem("staffName");
  const branchId = localStorage.getItem("branchId");
  if (staffId && staffName) setStaffUI({ staffName, branchId });
}

function logoutStaff() {
  stopHtml5Scanner("add");
  stopHtml5Scanner("redeem");

  localStorage.removeItem("staffId");
  localStorage.removeItem("staffName");
  localStorage.removeItem("branchId");
  document.getElementById("helloSection").classList.add("hidden");
  document.getElementById("staffBar").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}

/* ============ Section toggle ============ */
let currentVisibleId = null;
function showSection(id) {
  const section = document.getElementById(id);
  if (!section) return;

  if (id !== "addPoints") document.getElementById("addPointResult").textContent = "";
  if (id !== "redeem") document.getElementById("redeemResult").textContent = "";

  if (currentVisibleId === id) {
    section.style.display = "none";
    currentVisibleId = null;
  } else {
    document.querySelectorAll(".section").forEach((sec) => {
      sec.style.display = sec.id === id ? "block" : "none";
    });
    currentVisibleId = id;

    if (id === "redeem") loadRewardsCatalog();

    setTimeout(() => section.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }
}

/* ============ Auth (UI) ============ */
async function login() {
  const user = document.getElementById("username").value.trim();
  const pass = document.getElementById("password").value.trim();
  const error = document.getElementById("errorMsg");
  const btn = document.getElementById("loginBtn");
  error.classList.add("hidden");

  if (!user || !pass) {
    error.textContent = "❌ โปรดกรอก Username/Password";
    error.classList.remove("hidden");
    return;
  }

  await withButton(btn, "กำลังเข้าสู่ระบบ...", async () => {
    try {
      const staff = await getStaffByUsername(user);
      if (!staff) throw new Error("ไม่พบผู้ใช้นี้");
      if ((staff.Status || "").toLowerCase() !== "active") {
        throw new Error("บัญชีนี้ถูกปิดใช้งาน");
      }
      const hash = await sha256(pass);
      if (hash !== staff.PasswordHash) {
        throw new Error("รหัสผ่านไม่ถูกต้อง");
      }

      localStorage.setItem("staffId", staff.StaffID || staff.id);
      localStorage.setItem("staffName", staff.Name || user);
      localStorage.setItem("branchId", staff.BranchID || "");

      setStaffUI({
        staffName: staff.Name || user,
        branchId: staff.BranchID || "-"
      });
    } catch (e) {
      console.error(e);
      error.textContent = `❌ ${e.message || "เข้าสู่ระบบไม่สำเร็จ"}`;
      error.classList.remove("hidden");
    }
  });
}

/* ============ Add points (UI) ============ */
function clearAddPointsForm() {
  document.getElementById("billNumber").value = "";
  document.getElementById("addPointPhone").value = "";
  document.getElementById("amount").value = "";
}

async function addPoints() {
  const staffId = localStorage.getItem("staffId");
  if (!staffId) { alert("กรุณาเข้าสู่ระบบพนักงานก่อน"); return; }

  const bill = document.getElementById("billNumber").value.trim();
  const phone = document.getElementById("addPointPhone").value.trim();
  const amount = document.getElementById("amount").value.trim();
  const resultDiv = document.getElementById("addPointResult");
  const btn = document.getElementById("addPointBtn");

  resultDiv.textContent = "";

  if (!/^[a-zA-Z0-9]{5,}$/.test(bill)) { resultDiv.innerHTML = '<p class="text-red-500">❌ เลขบิลต้องยาวอย่างน้อย 5 ตัว (A-Z, a-z, 0-9)</p>'; return; }
  if (!/^0\d{9}$/.test(phone)) { resultDiv.innerHTML = '<p class="text-red-500">❌ กรุณากรอกเบอร์โทร 10 หลักให้ถูกต้อง</p>'; return; }
  if (isNaN(amount) || Number(amount) <= 0) { resultDiv.innerHTML = '<p class="text-red-500">❌ กรุณากรอกจำนวนเงินให้ถูกต้อง</p>'; return; }
  if (Math.floor(Number(amount) / 100) === 0) { resultDiv.innerHTML = '<p class="text-red-500">❌ ยอดเงินต้องมากกว่า 100 บาทเพื่อรับแต้ม</p>'; return; }

  await withButton(btn, "กำลังเพิ่มแต้ม...", async () => {
    try {
      const { pointsAdded, staffProfile } = await addPointsToMember({ staffId, bill, phone, amount });
      resultDiv.innerHTML = `
        <p class="text-green-600">✅ เพิ่มแต้มสำเร็จ +${pointsAdded} แต้ม</p>
        <p class="text-gray-600 text-sm">ผู้ทำรายการ: ${staffProfile?.staffName || "-"} (สาขา: ${staffProfile?.branchId || "-"})</p>
      `;
      clearAddPointsForm();
    } catch (err) {
      if (err.code === "DUPLICATE_BILL") {
        resultDiv.innerHTML = `<p class="text-red-500">⚠️ เลขบิลซ้ำ: ${bill}</p>`;
        alert(err.message);
        return;
      }
      console.error("addPoints error:", err);
      alert(err?.message || "เกิดข้อผิดพลาด");
    }
  });
}

/* ============ Redeem (UI) ============ */
function clearRedeemForm() {
  document.getElementById("redeemPhone").value = "";
  document.getElementById("rewardSelect").value = "";
  document.getElementById("pointsHint").textContent = "";
}

async function redeemPoints() {
  const staffId = localStorage.getItem("staffId");
  const staffNameFromLS = localStorage.getItem("staffName") || "";
  const branchIdFromLS = localStorage.getItem("branchId") || "";
  if (!staffId) { alert("กรุณาเข้าสู่ระบบพนักงานก่อน"); return; }

  const phone = document.getElementById("redeemPhone").value.trim();
  const sel = document.getElementById("rewardSelect");
  const opt = sel.selectedOptions[0];
  const resultDiv = document.getElementById("redeemResult");
  const redeemBtn = document.getElementById("redeemBtn");

  resultDiv.textContent = "";

  if (!/^0\d{9}$/.test(phone) || !opt?.value) { resultDiv.innerHTML = '<p class="text-red-500">❌ กรุณากรอกเบอร์ และเลือกของรางวัล</p>'; return; }
  if (opt.disabled) { resultDiv.innerHTML = '<p class="text-red-500">❌ ของรางวัลนี้หมดสต็อกแล้ว</p>'; return; }

  const rewardId = opt.value;
  const rewardNameText = opt.textContent.split("(")[0].trim();
  const needPoints = Number(opt.dataset.points || 0);

  await withButton(redeemBtn, "กำลังแลก...", async () => {
    try {
      const res = await redeemReward({
        staffId,
        staffName: staffNameFromLS,
        branchId: branchIdFromLS,
        phone,
        rewardId
      });

      resultDiv.innerHTML = `<p class="text-green-600">🎁 แลก “${res.rewardName || rewardNameText}” สำเร็จ! หักแต้ม ${res.pointsUsed ?? needPoints} แต้ม</p>`;
      clearRedeemForm();
      await loadRewardsCatalog(); // refresh stock
    } catch (e) {
      console.error("redeemPoints error:", e);
      alert("❌ แลกไม่สำเร็จ: " + (e.message || "Unknown error"));
    }
  });

  redeemBtn.disabled = !(sel.selectedOptions[0] && sel.selectedOptions[0].value);
}

/* ============ Catalog (UI) ============ */
async function loadRewardsCatalog() {
  const loading = document.getElementById("rewardLoading");
  const err = document.getElementById("rewardError");
  const sel = document.getElementById("rewardSelect");
  const redeemBtn = document.getElementById("redeemBtn");
  const hint = document.getElementById("pointsHint");

  loading.textContent = "กำลังโหลดรายการ…";
  err.classList.add("hidden");
  redeemBtn.disabled = true;
  hint.textContent = "";

  try {
    const items = await listActiveRewards();

    sel.innerHTML = '<option value="">-- เลือกของรางวัล --</option>';
    if (!items.length) {
      err.textContent = "ยังไม่มีของรางวัลให้แลกในขณะนี้";
      err.classList.remove("hidden");
      redeemBtn.disabled = true;
      return;
    }

    items.forEach(d => {
      const opt = document.createElement("option");
      const stock = Number(d.stock ?? 0);
      opt.value = d.reward_id;
      opt.textContent = `${d.reward_name} (${d.points} แต้ม)${stock <= 0 ? " — หมดสต็อก" : ""}`;
      if (stock <= 0) opt.disabled = true;
      opt.dataset.points = d.points;
      sel.appendChild(opt);
    });

    sel.onchange = () => {
      const op = sel.selectedOptions[0];
      const p = op?.dataset.points || "";
      hint.textContent = p ? `ต้องใช้ ${p} แต้ม` : "";
      redeemBtn.disabled = !(op && op.value) || (op && op.disabled);
      document.getElementById("redeemResult").textContent = "";
    };
  } catch (e) {
    console.error("loadRewardsCatalog error:", e);
    err.textContent = "โหลดรายการรางวัลไม่สำเร็จ กรุณาลองใหม่";
    err.classList.remove("hidden");
  } finally {
    loading.textContent = "";
  }
}

/* ============ QR Scan ============ */
let html5QrAdd = null;
let html5QrRedeem = null;

function stopHtml5Scanner(kind) {
  const map = {
    add: { inst: html5QrAdd, elId: "reader-add" },
    redeem: { inst: html5QrRedeem, elId: "reader" }
  };
  const m = map[kind];
  if (!m) return;
  const el = document.getElementById(m.elId);
  if (m.inst) {
    m.inst.stop().then(() => {
      m.inst.clear();
      if (el) el.classList.add("hidden");
    }).catch(() => {
      if (el) el.classList.add("hidden");
    });
  } else if (el) {
    el.classList.add("hidden");
  }
  if (kind === "add") html5QrAdd = null;
  if (kind === "redeem") html5QrRedeem = null;
}

async function startScannerForAddPoint() {
  if (window.liff && typeof liff.isInClient === "function" && liff.isInClient() && liff.scanCodeV2) {
    const ok = await ensureLiffLogin();
    if (!ok) return;
    try {
      const res = await liff.scanCodeV2();
      document.getElementById("addPointPhone").value = (res.value || "").trim();
      alert("✅ สแกนสำเร็จ! กรอกจำนวนเงินเพื่อเพิ่มแต้ม");
    } catch (err) {
      alert("❌ สแกนไม่ได้: " + (err?.message || err));
    }
    return;
  }

  const reader = document.getElementById("reader-add");
  reader.classList.remove("hidden");
  try {
    html5QrAdd = new Html5Qrcode("reader-add");
    await html5QrAdd.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        document.getElementById("addPointPhone").value = (decodedText || "").trim();
        stopHtml5Scanner("add");
        alert("✅ สแกนสำเร็จ!");
      }
    );
  } catch (e) {
    alert("❌ เปิดกล้องไม่สำเร็จ: " + (e?.message || e));
    stopHtml5Scanner("add");
  }
}

async function startScannerForRedeem() {
  if (window.liff && typeof liff.isInClient === "function" && liff.isInClient() && liff.scanCodeV2) {
    const ok = await ensureLiffLogin();
    if (!ok) return;
    try {
      const res = await liff.scanCodeV2();
      document.getElementById("redeemPhone").value = (res.value || "").trim();
      alert("✅ สแกนสำเร็จ! กรุณาเลือกของรางวัลแล้วกดแลก");
    } catch (err) {
      alert("❌ สแกนไม่ได้: " + (err?.message || err));
    }
    return;
  }

  const reader = document.getElementById("reader");
  reader.classList.remove("hidden");
  try {
    html5QrRedeem = new Html5Qrcode("reader");
    await html5QrRedeem.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        document.getElementById("redeemPhone").value = (decodedText || "").trim();
        stopHtml5Scanner("redeem");
        alert("✅ สแกนสำเร็จ!");
      }
    );
  } catch (e) {
    alert("❌ เปิดกล้องไม่สำเร็จ: " + (e?.message || e));
    stopHtml5Scanner("redeem");
  }
}

/* ============ Expose to HTML (สำหรับ onclick อื่น ๆ) ============ */
window.login = login;
window.logoutStaff = logoutStaff;
window.addPoints = addPoints;
window.redeemPoints = redeemPoints;
window.showSection = showSection;
window.startScannerForAddPoint = startScannerForAddPoint;
window.startScannerForRedeem = startScannerForRedeem;
window.loadRewardsCatalog = loadRewardsCatalog;
