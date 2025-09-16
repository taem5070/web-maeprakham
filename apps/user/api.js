// api.js — Firebase SDK only (ESM/CDN)

// === Firebase SDK (ESM/CDN) ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, query, where, getDocs, serverTimestamp, orderBy, limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


// === ใส่ค่าจริงจาก Firebase Console ของคุณ ===
const firebaseConfig = {
  apiKey: "AIzaSyDvTJ5tEKo_J1r4l9zP-oi07yoj2I-UcZo",
  authDomain: "maeprakham.firebaseapp.com",
  projectId: "maeprakham",
  storageBucket: "maeprakham.appspot.com",
  appId: "1:807144309923:web:a9cdadc96074941ad66b16",
};

// === Init Firebase (ครั้งเดียว) ===
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Auth ----------
export function ensureAnonymousSignIn() {
  onAuthStateChanged(auth, (user) => {
    if (!user) signInAnonymously(auth).catch((err) => {
      console.error("Anonymous sign-in failed:", err);
      alert("ไม่สามารถเซ็นอินแบบนิรนามได้ โปรดรีเฟรชหน้า");
    });
  });
}

// ---------- Members API ----------
export async function getMember(phone) {
  const ref = doc(db, "members", phone);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createMember({ phone, name, birthday, welcomePoints = 0 }) {
  const ref = doc(db, "members", phone);
  await setDoc(ref, {
    phone, name, birthday,
    points: welcomePoints,
    reward: "-",
    time: null,
    createdAt: serverTimestamp(),
  });
  const latest = await getDoc(ref);
  return { id: latest.id, ...latest.data() };
}

export async function updateMemberName(phone, newName) {
  const ref = doc(db, "members", phone);
  await updateDoc(ref, { name: newName });
}

// ---------- Redeem Logs (Latest) ----------
// ดึงทั้งหมดของเบอร์นั้น แล้วเลือก createdAt ล่าสุดบน client
export async function getLatestRedeemLog(phone) {
  const snap = await getDocs(
    query(collection(db, "redeem_logs"), where("phone", "==", String(phone)))
  );
  if (snap.empty) return null;

  let latest = null;
  snap.forEach((docSnap) => {
    const d = { id: docSnap.id, ...docSnap.data() };
    const ts =
      (d.createdAt && typeof d.createdAt.toMillis === "function")
        ? d.createdAt.toMillis()
        : (d.createdAt ? new Date(d.createdAt).getTime() : 0);
    if (!latest || ts > latest.__ts) latest = { ...d, __ts: ts };
  });

  if (latest) delete latest.__ts;
  return latest;
}


// ---------- Members: update last redeem ----------
export async function updateMemberLastRedeem(phone, rewardName, createdAt) {
  const ref = doc(db, "members", String(phone));
  await updateDoc(ref, {
    reward: rewardName || "-",
    time: createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ---------- Rewards (Public) ----------
export async function getPublicRewards() {
  const q = query(collection(db, "rewards_public"), where("status", "==", "ON"));
  const snap = await getDocs(q);
  const items = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
  // เรียงจากแต้มน้อยไปมาก
  items.sort((a, b) => Number(a.points || 0) - Number(b.points || 0));
  return items;
}

// ---------- Exports ----------
export { db, auth, serverTimestamp };
