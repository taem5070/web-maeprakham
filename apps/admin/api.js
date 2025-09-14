// api.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, query, where, getDocs, doc, getDoc,
  runTransaction, addDoc, serverTimestamp, updateDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvTJ5tEKo_J1r4l9zP-oi07yoj2I-UcZo",
  authDomain: "maeprakham.firebaseapp.com",
  projectId: "maeprakham",
  storageBucket: "maeprakham.appspot.com",
  messagingSenderId: "807144309923",
  appId: "1:807144309923:web:a9cdadc96074941ad66b16",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ---------- helpers ----------
async function ensureAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

// Hash (ใช้ตรวจรหัสผ่าน staff)
export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Staff ----------
export async function getStaffByUsername(username) {
  await ensureAuth();
  const qRef = query(collection(db, "staffs"), where("Username", "==", username));
  const snap = await getDocs(qRef);
  if (snap.empty) return null;
  const d = snap.docs[0].data();
  return { id: snap.docs[0].id, ...d };
}

export async function getStaffProfile(staffId) {
  await ensureAuth();

  // cache localStorage
  const cached = localStorage.getItem("__staff_profile");
  if (cached) {
    try {
      const obj = JSON.parse(cached);
      if (obj?.staffId === staffId) return obj;
    } catch {}
  }

  const s = await getDoc(doc(db, "staffs", staffId));
  if (!s.exists()) return { staffId, staffName: "", branchId: "" };
  const d = s.data();
  const profile = {
    staffId,
    staffName: d?.Name || "",
    branchId: d?.BranchID || ""
  };
  localStorage.setItem("__staff_profile", JSON.stringify(profile));
  return profile;
}

// ---------- Rewards ----------
export async function listActiveRewards() {
  await ensureAuth();
  const snap = await getDocs(collection(db, "rewards_admin"));
  const items = [];
  snap.forEach((docx) => {
    const d = docx.data();
    if (d.active && (d.stock ?? 0) > 0) {
      items.push({
        reward_id: d.rewardID || docx.id,
        reward_name: d.rewardName || "ไม่ระบุชื่อ",
        points: Number(d.points || 0),
        stock: Number(d.stock ?? 0)
      });
    }
  });
  return items;
}

// ---------- Points: add & log ----------
export async function addPointsToMember({ staffId, bill, phone, amount }) {
  await ensureAuth();

  // กันบิลซ้ำ
  const dupQ = query(collection(db, "point_logs"), where("bill", "==", bill));
  const dupSnap = await getDocs(dupQ);
  if (!dupSnap.empty) {
    const err = new Error(`เลขบิล "${bill}" ถูกใช้ไปแล้ว`);
    err.code = "DUPLICATE_BILL";
    throw err;
  }

  const staffProfile = await getStaffProfile(staffId);
  const memberRef = doc(db, "members", phone);
  const memberSnap = await getDoc(memberRef);

  const now = new Date();
  const pointsAdded = Math.floor(Number(amount) / 100);

  if (memberSnap.exists()) {
    const cur = memberSnap.data() || {};
    const curPoints = Number(cur.points || 0);
    await updateDoc(memberRef, {
      points: curPoints + pointsAdded,
      updatedAt: now
    });
  } else {
    await setDoc(memberRef, {
      phone,
      name: "",
      points: pointsAdded,
      createdAt: now,
      updatedAt: now,
      reward: "",
      time: null
    });
  }

  // เขียน log
  await addDoc(collection(db, "point_logs"), {
    phone,
    bill,
    amount: Number(amount),
    pointsAdded,
    staffId: staffProfile.staffId,
    staffName: staffProfile.staffName,
    branchId: staffProfile.branchId,
    createdAt: now
  });

  return { pointsAdded, staffProfile };
}

// ---------- Redeem: stock- & points- with log ----------
export async function redeemReward({ staffId, staffName, branchId, phone, rewardId }) {
  await ensureAuth();

  let result = { rewardName: "", pointsUsed: 0 };
  await runTransaction(db, async (tx) => {
    const rewardRef = doc(db, "rewards_admin", rewardId);
    const rewardSnap = await tx.get(rewardRef);
    if (!rewardSnap.exists()) throw new Error("ไม่พบของรางวัล");

    const r = rewardSnap.data();
    const pointsToUse = Number(r.points || 0);
    const stock = Number(r.stock || 0);
    const active = !!r.active;

    if (!active) throw new Error("ของรางวัลนี้ปิดใช้งาน");
    if (stock <= 0) throw new Error("ของรางวัลหมดสต็อก");
    if (pointsToUse <= 0) throw new Error("แต้มของรางวัลไม่ถูกต้อง");

    const memRef = doc(db, "members", phone);
    const memSnap = await tx.get(memRef);
    if (!memSnap.exists()) throw new Error("ไม่พบบัญชีสมาชิก");

    const m = memSnap.data();
    const currentPoints = Number(m.points || 0);
    if (currentPoints < pointsToUse) {
      throw new Error(`แต้มไม่พอ (ต้องใช้ ${pointsToUse}, มี ${currentPoints})`);
    }

    // update stock & member points
    tx.update(rewardRef, { stock: stock - 1, updatedAt: serverTimestamp() });
    tx.update(memRef, { points: currentPoints - pointsToUse, updatedAt: serverTimestamp() });

    // log redeem
    const logRef = doc(collection(db, "redeem_logs"));
    tx.set(logRef, {
      phone,
      rewardId,
      rewardName: r.rewardName || rewardId,
      pointsUsed: pointsToUse,
      staffId,
      staffName: staffName || null,
      branchId: branchId || null,
      createdAt: serverTimestamp()
    });

    result = { rewardName: r.rewardName || rewardId, pointsUsed: pointsToUse };
  });

  return result;
}
