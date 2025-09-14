// ==== Chart instances ====
let moneyChartInstance = null;
let addChartInstance = null;
let redeemChartInstance = null;

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbznqWsw8MlM8SnKUfNGXGhcWVzx3UfsjT_5MwRB5JEbnmHhmkPI6oN9e4mNHZWAy0kIFg/exec";

// ==== โหลดรายการเดือน ====
async function loadMonthOptions() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=months&t=${Date.now()}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const select = document.getElementById("monthSelect");

    if (Array.isArray(data.months) && data.months.length > 0) {
      select.innerHTML = data.months.map(m => `<option value="${m.value}">${m.label}</option>`).join("");
      select.value = data.months[0].value; // เดือนล่าสุด
      fetchDashboardDataWithDate();
    } else {
      select.innerHTML = `<option value="">(ไม่มีเดือนให้เลือก)</option>`;
    }
  } catch (error) {
    alert("โหลดเดือนล้มเหลว กรุณาตรวจสอบ API");
    console.error("loadMonthOptions error:", error);
  }
}

async function fetchTotalsAll() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=totals&t=${Date.now()}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    document.getElementById("signupCount").textContent = (data.totalSignup ?? 0);

    const addCountEl = document.getElementById("addCount");
    if (addCountEl) addCountEl.textContent = (data.totalAdd ?? 0);

    document.getElementById("redeemCount").textContent = (data.totalRedeem ?? 0);

    const elTotalAddAll = document.getElementById("totalAddAll");
    if (elTotalAddAll) elTotalAddAll.textContent = (data.totalAdd ?? 0);

    const totalAmt = Number(data.totalAmount ?? 0);
    const elTotalAmount = document.getElementById("totalAmount");
    if (elTotalAmount) {
      elTotalAmount.textContent = `฿${totalAmt.toLocaleString('th-TH')}`;
    }
  } catch (err) {
    console.error('fetchTotalsAll error:', err);
    document.getElementById("signupCount").textContent = '0';

    const addCountEl2 = document.getElementById("addCount");
    if (addCountEl2) addCountEl2.textContent = '0';

    document.getElementById("redeemCount").textContent = '0';
    const elTotalAmount = document.getElementById("totalAmount");
    if (elTotalAmount) elTotalAmount.textContent = '฿0';
    const elTotalAddAll2 = document.getElementById("totalAddAll");
    if (elTotalAddAll2) elTotalAddAll2.textContent = '0';
  }
}

// ==== โหลดข้อมูลตามเดือน ====
async function fetchDashboardDataWithDate() {
  try {
    const month = document.getElementById("monthSelect").value;
    if (!month) return;

    const response = await fetch(`${SCRIPT_URL}?action=dashboard&month=${encodeURIComponent(month)}&t=${Date.now()}`);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();

    // Top 5
    const top = Array.isArray(data.topCustomers) ? data.topCustomers : [];
    document.getElementById("topCustomers").innerHTML =
      top.length > 0
        ? top.map(c => `<li>${c.name || '-'} - ${Number(c.points || 0).toLocaleString('th-TH')} แต้ม</li>`).join("")
        : `<li>— ไม่มีข้อมูล —</li>`;

    // เงิน / แลกแต้ม (เหมือนเดิม)
    const ml = Array.isArray(data.moneyChart?.labels)  ? data.moneyChart.labels  : [];
    const md = Array.isArray(data.moneyChart?.data)    ? data.moneyChart.data    : [];
    const rl = Array.isArray(data.redeemChart?.labels) ? data.redeemChart.labels : [];
    const rd = Array.isArray(data.redeemChart?.data)   ? data.redeemChart.data   : [];

    updateChart("moneyChart",  ml, md, "#0866ff", "ยอดเงิน (บาท)");
    updateChart("redeemChart", rl, rd, "#42b72a", "การแลกแต้ม (ครั้ง)");

    // เพิ่มแต้ม: ใช้กราฟรวม + สาขา 1–4 ในกราฟเดียว (toggle ได้จาก legend)
    const al = Array.isArray(data.addChart?.labels) ? data.addChart.labels : [];
    const ad = Array.isArray(data.addChart?.data)   ? data.addChart.data   : [];

    try {
      const addb = await fetchAddByBranchDaily(month); // ต้องมี action=addByBranchDaily ใน GAS
      const labels = Array.isArray(addb.labels) ? addb.labels : al;
      const totalArr = Array.isArray(addb.total) ? addb.total : ad;
      const branches = (addb.branches || {});
      updateAddCombinedChart(labels, totalArr, branches);
    } catch (e) {
      console.warn('fetchAddByBranchDaily failed, fallback to total only:', e);
      updateAddCombinedChart(al, ad, {"1":[], "2":[], "3":[], "4":[]});
    }
  } catch (error) {
    alert("ไม่สามารถโหลดข้อมูลได้ โปรดตรวจสอบการเชื่อมต่อหรือ URL");
    console.error("Fetch error:", error);
  }
}

// ==== วาด/อัปเดตกราฟ ====
function updateChart(chartId, labels, data, color, labelName) {
  const canvas = document.getElementById(chartId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const safeLen = Math.min(labels.length, data.length);
  const safeLabels = labels.slice(0, safeLen);
  const safeData = data.slice(0, safeLen);

  let chartInstance =
    chartId === "moneyChart" ? moneyChartInstance :
      chartId === "addChart" ? addChartInstance :
        redeemChartInstance;

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: safeLabels,
      datasets: [{
        label: labelName,
        data: safeData,
        backgroundColor: color,
        borderColor: color,
        borderWidth: 2,
        pointRadius: 2,
        fill: false,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } }
    }
  });

  if (chartId === "moneyChart") {
    moneyChartInstance = chartInstance;
  } else if (chartId === "addChart") {
    addChartInstance = chartInstance;
  } else {
    redeemChartInstance = chartInstance;
  }
}

// ==== UI ====
function toggleDarkMode() {
  document.documentElement.classList.toggle("dark");
}

function openModal(type) {
  // ถ้าเป็นโหมดสาขา ให้เปิดโมดอลสาขาโดยเฉพาะแทน
  if (type === "addBranch") {
    openBranchModal();
    return;
  }

  const actionMap = {
    signup: "signupRange",
    add: "addRange",
    redeem: "redeemRange",
    amount: "amountRange"
  };
  const action = actionMap[type];
  if (!action) return;

  const modal = document.getElementById("modal");
  const titleEl = document.getElementById("modalTitle");
  const dailyEl = document.getElementById("dailyDetail");
  const weeklyEl = document.getElementById("weeklyDetail");
  const monthlyEl = document.getElementById("monthlyDetail");

  modal.classList.remove("hidden");
  titleEl.textContent = ({
    signup: "รายละเอียดลูกค้าที่สมัคร",
    add: "รายละเอียดการเพิ่มแต้ม",
    redeem: "รายละเอียดการแลกแต้ม",
    amount: "รายละเอียดยอดเงินรวม"
  }[type] || "รายละเอียด");

  // reset
  [dailyEl, weeklyEl, monthlyEl].forEach(el => {
    if (el) {
      el.classList.remove("hidden");
      if (el === dailyEl)   el.textContent   = "รายวัน: -";
      if (el === weeklyEl)  el.textContent  = "รายสัปดาห์: -";
      if (el === monthlyEl) el.textContent = "รายเดือน: -";
    }
  });

  (async () => {
    try {
      const res = await fetch(`${SCRIPT_URL}?action=${action}&t=${Date.now()}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      if (dailyEl)   dailyEl.textContent   = "รายวัน: " + (data.daily ?? 0);
      if (weeklyEl)  weeklyEl.textContent  = "รายสัปดาห์: " + (data.weekly ?? 0);
      if (monthlyEl) monthlyEl.textContent = "รายเดือน: " + (data.monthly ?? 0);
    } catch (err) {
      console.error("Modal fetch error:", err);
      if (dailyEl)   dailyEl.textContent   = "รายวัน: -";
      if (weeklyEl)  weeklyEl.textContent  = "รายสัปดาห์: -";
      if (monthlyEl) monthlyEl.textContent = "รายเดือน: -";
    }
  })();
}


function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

window.addEventListener("DOMContentLoaded", async () => {
  await fetchTotalsAll();   // โหลดยอดรวมทั้งหมดไปใส่ในการ์ด
  await loadMonthOptions(); // โหลดเดือน + โหลดกราฟ/Top 5 ของเดือนล่าสุด
});


function openBranchModal() {
  const modal = document.getElementById("modal-branches");
  const list = document.getElementById("branchListModal");
  if (!modal || !list) return;

  // reset list with loading state
  list.innerHTML = "<li>กำลังโหลด...</li>";

  modal.classList.remove("hidden");

  (async () => {
    try {
      const res = await fetch(`${SCRIPT_URL}?action=addByBranch&t=${Date.now()}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const b = data.branches || {};
      const order = ["1","2","3","4"];
      const items = order.map(k => `<li>สาขา ${k}: ${Number(b[k] || 0)} ครั้ง</li>`).join("");
      list.innerHTML = items || "<li>ไม่มีข้อมูล</li>";
    } catch (err) {
      console.error("openBranchModal error:", err);
      list.innerHTML = "<li>ดึงข้อมูลไม่ได้</li>";
    }
  })();
}

function closeBranchModal() {
  const modal = document.getElementById("modal-branches");
  if (modal) modal.classList.add("hidden");
}


/**
 * โหลดจำนวนเพิ่มแต้มรายวัน แยกตามสาขา สำหรับเดือนที่เลือก
 * Expect:
 *  { labels: ["01","02",...],
 *    total: [..],
 *    branches: { "1":[..], "2":[..], "3":[..], "4":[..] } }
 */
async function fetchAddByBranchDaily(month) {
  const url = `${SCRIPT_URL}?action=addByBranchDaily&month=${encodeURIComponent(month)}&t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}


/**
 * วาดกราฟเพิ่มแต้มแบบรวม + แยกสาขา (อยู่ในกราฟเดียว)
 * แสดงเส้น "รวมทั้งหมด" ก่อน ส่วนสาขา 1–4 ซ่อนไว้ (คลิก legend เพื่อเปิด/ปิด)
 */
function updateAddCombinedChart(labels, totalArr, branchMap) {
  const canvas = document.getElementById("addChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const b1 = (branchMap && Array.isArray(branchMap["1"])) ? branchMap["1"] : labels.map(() => 0);
  const b2 = (branchMap && Array.isArray(branchMap["2"])) ? branchMap["2"] : labels.map(() => 0);
  const b3 = (branchMap && Array.isArray(branchMap["3"])) ? branchMap["3"] : labels.map(() => 0);
  const b4 = (branchMap && Array.isArray(branchMap["4"])) ? branchMap["4"] : labels.map(() => 0);

  // destroy old
  if (addChartInstance) addChartInstance.destroy();

  addChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "รวมทั้งหมด", data: totalArr, borderWidth: 2, pointRadius: 2, fill: false, tension: 0.3 },
        { label: "สาขา 1", data: b1, borderWidth: 2, pointRadius: 2, fill: false, tension: 0.3, hidden: true },
        { label: "สาขา 2", data: b2, borderWidth: 2, pointRadius: 2, fill: false, tension: 0.3, hidden: true },
        { label: "สาขา 3", data: b3, borderWidth: 2, pointRadius: 2, fill: false, tension: 0.3, hidden: true },
        { label: "สาขา 4", data: b4, borderWidth: 2, pointRadius: 2, fill: false, tension: 0.3, hidden: true }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: { enabled: true }
      },
      scales: { y: { beginAtZero: true, title: { display: true, text: "ครั้ง" } } }
    }
  });
}
