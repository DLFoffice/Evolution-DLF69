// ชั้นจัดการข้อมูล: Firebase (Firestore + Auth) หรือโหมดสาธิต (เก็บในเบราว์เซอร์)
import { FIREBASE_CONFIG } from "./config.js";

export const DEMO = !FIREBASE_CONFIG.apiKey;
const FB_VER = "10.12.2";
const DEMO_KEY = "dltv_survey_demo_responses";
let fb = null;

async function init() {
  if (DEMO) return null;
  if (fb) return fb;
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}`;
  const [appMod, fs, authMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
    import(`${base}/firebase-auth.js`)
  ]);
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  fb = { app, fs, db: fs.getFirestore(app), authMod, auth: authMod.getAuth(app) };
  return fb;
}

function demoRead() {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { return []; }
}
function demoWrite(list) {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
}

export class AlreadySubmittedError extends Error {}

// บันทึกคำตอบ: ผู้บริหารใช้ id = director_<รหัสโรงเรียน> เพื่อให้ตอบได้ 1 ชุดต่อโรงเรียน
export async function submitResponse(data) {
  const id = data.role === "director" ? `director_${data.schoolCode}` : null;
  if (DEMO) {
    const list = demoRead();
    if (id && list.some(r => r.id === id)) throw new AlreadySubmittedError();
    const rec = { ...data, id: id || "demo_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), submittedAt: new Date().toISOString() };
    list.push(rec); demoWrite(list);
    return rec.id;
  }
  const { fs, db } = await init();
  const payload = { ...data, submittedAt: fs.serverTimestamp() };
  try {
    if (id) { await fs.setDoc(fs.doc(db, "responses", id), payload); return id; }
    const ref = await fs.addDoc(fs.collection(db, "responses"), payload);
    return ref.id;
  } catch (e) {
    if (id && e && e.code === "permission-denied") throw new AlreadySubmittedError();
    throw e;
  }
}

export async function fetchResponses() {
  if (DEMO) return demoRead();
  const { fs, db } = await init();
  const snap = await fs.getDocs(fs.collection(db, "responses"));
  return snap.docs.map(d => {
    const v = d.data();
    const t = v.submittedAt && v.submittedAt.toDate ? v.submittedAt.toDate().toISOString() : null;
    return { ...v, id: d.id, submittedAt: t };
  });
}

export async function deleteResponse(id) {
  if (DEMO) { demoWrite(demoRead().filter(r => r.id !== id)); return; }
  const { fs, db } = await init();
  await fs.deleteDoc(fs.doc(db, "responses", id));
}

export function demoReplace(list) { demoWrite(list); }

// ---------- ผู้ดูแลระบบ ----------
export async function onAuth(cb) {
  if (DEMO) { cb({ email: "demo@local", demo: true }); return; }
  const { authMod, auth } = await init();
  authMod.onAuthStateChanged(auth, cb);
}
export async function signIn(email, password) {
  const { authMod, auth } = await init();
  return authMod.signInWithEmailAndPassword(auth, email, password);
}
export async function signOut() {
  if (DEMO) return;
  const { authMod, auth } = await init();
  return authMod.signOut(auth);
}
export async function isAdmin(user) {
  if (DEMO) return true;
  if (!user || !user.email) return false;
  const { fs, db } = await init();
  try { return (await fs.getDoc(fs.doc(db, "admins", user.email.toLowerCase()))).exists(); }
  catch { return false; }
}

// ---------- รายชื่อโรงเรียน ----------
let schoolsCache = null;
export async function loadSchools() {
  if (schoolsCache) return schoolsCache;
  const res = await fetch("data/schools.json");
  const j = await res.json();
  schoolsCache = j.rows.map(r => ({
    code: r[0], name: r[1], tambon: r[2], amphoe: r[3], province: r[4],
    zip: r[5], phone: r[6], area: r[7], alloc: ({ 1: "sem1", 2: "sem2", 3: "both" })[r[8]] || "origin",
    _n: normalize(r[1])
  }));
  return schoolsCache;
}
export function normalize(s) {
  return String(s || "").replace(/^\s*(โรงเรียน|รร\.?)\s*/, "").replace(/[\s"'“”()\-.]/g, "").toLowerCase();
}
