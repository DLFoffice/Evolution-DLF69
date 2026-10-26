import { SURVEY } from "./config.js";
import { DEMO, submitResponse, loadSchools, normalize, AlreadySubmittedError, SubmitError } from "./store.js";
import {
  ROLES, SUBJECTS, SUBJECT_NAME, GRADES, STUDENT_GRADES, ALLOC, AFFILIATIONS, MAJORS,
  DIRECTOR_USAGE, TEACHER_USE, TEACHER_STORE, TEACHER_GROUPS, STUDENT_GROUPS,
  TEACHER_SCALE, STUDENT_SCALE
} from "./questions.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DRAFT_KEY = "dltv_survey_draft";

const fresh = () => ({ step: 1, role: null, mode: "list", school: null, affiliation: null, ans: {} });
let st = fresh();
let schools = [];

// ---------- path helpers ----------
function getPath(o, path) { return path.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o); }
function setPath(o, path, v) {
  const ks = path.split("."); let cur = o;
  ks.slice(0, -1).forEach(k => { if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {}; cur = cur[k]; });
  cur[ks.at(-1)] = v;
}
const val = k => getPath(st, k);

// ---------- draft ----------
function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(st)); } catch {} }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }
function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; } }

// ---------- field builders ----------
function radios(k, opts, { num = false, re = "" } = {}) {
  const cur = val(k);
  return `<div class="choices">${Object.entries(opts).map(([v, label]) => `
    <label class="choice"><input type="radio" name="${k}" value="${esc(v)}" data-k="${k}" ${num ? "data-num=1" : ""} ${re ? `data-re="${re}"` : ""}
      ${String(cur) === String(v) ? "checked" : ""}><span>${esc(label)}</span></label>`).join("")}</div>`;
}
function checks(k, opts, { num = false, re = "" } = {}) {
  const cur = (val(k) || []).map(String);
  return `<div class="choices">${Object.entries(opts).map(([v, label]) => `
    <label class="choice"><input type="checkbox" value="${esc(v)}" data-k="${k}" ${num ? "data-num=1" : ""} ${re ? `data-re="${re}"` : ""}
      ${cur.includes(String(v)) ? "checked" : ""}><span>${esc(label)}</span></label>`).join("")}</div>`;
}
function text(k, label, { type = "text", req = false, attrs = "" } = {}) {
  const v = val(k);
  return `<label class="f"><span>${esc(label)}${req ? " <b>*</b>" : ""}</span>
    <input type="${type}" data-k="${k}" value="${esc(v ?? "")}" ${attrs}></label>`;
}
function area(k, label, hint = "") {
  return `<label class="f"><span>${esc(label)}</span>${hint ? `<small>${esc(hint)}</small>` : ""}
    <textarea data-k="${k}">${esc(val(k) ?? "")}</textarea></label>`;
}
function matrix(k, re, label) {
  return `<div class="tbl-wrap"><table class="matrix" aria-label="${esc(label)}">
    <thead><tr><th>รายวิชา</th>${GRADES.map(g => `<th class="c">ป.${g}</th>`).join("")}</tr></thead>
    <tbody>${SUBJECTS.map((s, i) => {
      const cur = val(`${k}.${s.key}`) || [];
      return `<tr><td>${i + 1}. ${esc(s.name)}</td>${GRADES.map(g => `<td class="c">
        <input type="checkbox" aria-label="${esc(s.name)} ป.${g}" value="${g}" data-num=1 data-k="${k}.${s.key}" data-re="${re}" ${cur.includes(g) ? "checked" : ""}></td>`).join("")}</tr>`;
    }).join("")}</tbody></table></div>`;
}

// ---------- rating blocks ----------
function blockKeys() {
  if (st.role === "teacher") {
    const t = st.ans.teaching || {};
    return SUBJECTS.flatMap(s => (t[s.key] || []).slice().sort((a, b) => a - b).map(g => ({ key: `${s.key}_${g}`, title: `${s.name} ชั้นประถมศึกษาปีที่ ${g}` })));
  }
  const used = st.ans.subjectsUsed || [];
  return SUBJECTS.filter(s => used.includes(s.key)).map(s => ({ key: s.key, title: s.name }));
}
const groupsFor = () => (st.role === "teacher" ? TEACHER_GROUPS : STUDENT_GROUPS);
const itemCount = () => groupsFor().reduce((n, g) => n + g.items.length, 0);

function ratingBlock({ key, title }, idx) {
  const r = (st.ans.ratings || {})[key] || {};
  const total = itemCount();
  const done = Object.keys(r).length;
  let n = 0;
  return `<details class="rblock ${done === total ? "complete" : ""}" id="rb_${key}" open>
    <summary><h3>${esc(title)}</h3><span class="cnt" data-cnt="${key}">ตอบแล้ว ${done}/${total} ข้อ</span></summary>
    ${idx > 0 ? `<div class="tools"><button type="button" class="btn ghost small" data-copy="${key}">ใช้คะแนนเดียวกับวิชาก่อนหน้า</button></div>` : ""}
    ${groupsFor().map((g, gi) => `<div class="rgroup"><h4>${gi + 1}. ${esc(g.title)}</h4>
      ${g.items.map(t => { const i = n++; return `
        <div class="ritem" id="ri_${key}_${i}"><span class="no">${i + 1})</span><span class="txt">${esc(t)}</span>
          <div class="scale" role="radiogroup" aria-label="ข้อ ${i + 1}">${[5, 4, 3, 2, 1].map(v => `
            <label><input type="radio" name="r_${key}_${i}" value="${v}" data-num=1 data-k="ans.ratings.${key}.${i}" data-block="${key}" ${r[i] === v ? "checked" : ""}><span>${v}</span></label>`).join("")}
          </div></div>`; }).join("")}</div>`).join("")}
  </details>`;
}
function renderBlocks() {
  const host = $("#blocks"); if (!host) return;
  const keys = blockKeys();
  host.innerHTML = keys.length ? keys.map(ratingBlock).join("")
    : `<p class="hint">${st.role === "teacher" ? "เลือกวิชาและระดับชั้นในตารางด้านบน แล้วแบบประเมินของแต่ละวิชาจะแสดงที่นี่" : "เลือกวิชาที่ใช้ใบงานด้านบน แล้วแบบประเมินของแต่ละวิชาจะแสดงที่นี่"}</p>`;
}
function updateCount(key) {
  const r = (st.ans.ratings || {})[key] || {};
  const total = itemCount(), done = Object.keys(r).length;
  const el = document.querySelector(`[data-cnt="${key}"]`);
  if (el) el.textContent = `ตอบแล้ว ${done}/${total} ข้อ`;
  const blk = $(`#rb_${key}`);
  if (blk) { blk.classList.toggle("complete", done === total); if (done === total) blk.classList.remove("missing"); }
}
function scaleLegend(scale) {
  return `<p class="legend">${[5, 4, 3, 2, 1].map(v => `<span><b>${v}</b> ${esc(scale[v - 1])}</span>`).join("")}</p>`;
}

// ---------- role forms ----------
function directorForm() {
  return `
  <section style="display:grid;gap:14px">
    <h3>ตอนที่ 1 ข้อมูลบุคลากร</h3>
    <fieldset id="f_hasDirector"><legend>ผู้อำนวยการ / ครูใหญ่ <b style="color:var(--bad)">*</b></legend>
      ${radios("ans.hasDirector", { yes: "มี", no: "ไม่มี" })}</fieldset>
    <div class="grid3">
      ${text("ans.deputies", "รองผู้อำนวยการ (คน)", { type: "number", attrs: 'min="0" inputmode="numeric"' })}
      ${text("ans.teachersTotal", "จำนวนครูผู้สอนทั้งหมด (คน)", { type: "number", req: true, attrs: 'min="0" inputmode="numeric" id="f_teachersTotal"' })}
      ${text("ans.clerks", "เจ้าหน้าที่ธุรการ (คน)", { type: "number", attrs: 'min="0" inputmode="numeric"' })}
    </div>
    <div>
      <p class="hint" style="margin-bottom:6px">จำนวนครูที่สอนตรงวิชาเอก (คน)</p>
      <div class="tbl-wrap"><table><thead><tr><th>วิชาเอก</th><th style="width:8rem">จำนวน (คน)</th></tr></thead><tbody>
        ${MAJORS.map(([k, n]) => `<tr><td>${esc(n)}</td><td><input type="number" min="0" inputmode="numeric" aria-label="${esc(n)}" data-k="ans.majors.${k}" value="${esc(val(`ans.majors.${k}`) ?? "")}"></td></tr>`).join("")}
      </tbody></table></div>
    </div>
  </section>
  <section style="display:grid;gap:14px">
    <h3>ข้อมูลผู้ประสานงาน DLTV ของโรงเรียน</h3>
    <div class="grid2">
      ${text("ans.coordinator.name", "ชื่อ", { req: true, attrs: 'id="f_cname"' })}
      ${text("ans.coordinator.surname", "นามสกุล", { req: true, attrs: 'id="f_csurname"' })}
      ${text("ans.coordinator.position", "ตำแหน่ง")}
      ${text("ans.coordinator.mobile", "หมายเลขโทรศัพท์มือถือ", { type: "tel", req: true, attrs: 'id="f_cmobile" inputmode="tel"' })}
      ${text("ans.coordinator.email", "e-mail", { type: "email" })}
      ${text("ans.coordinator.line", "Line ID (ถ้ามี)")}
    </div>
  </section>
  <section style="display:grid;gap:14px">
    <h3>ตอนที่ 2 การใช้ชุดกิจกรรมการเรียนรู้ (ใบงาน)</h3>
    <p class="hint">สำรวจข้อมูลจากครูที่สอนชั้น ป.1 – ป.6 แล้วตอบเป็นภาพรวมของโรงเรียน</p>
    <fieldset id="f_usage"><legend>ลักษณะการใช้ <b style="color:var(--bad)">*</b></legend>
      ${radios("ans.usage", DIRECTOR_USAGE, { re: "usage" })}</fieldset>
    <div id="usageMatrix">${st.ans.usage === "partial" ? `<p class="hint" style="margin-bottom:6px">เลือกวิชาและระดับชั้นที่ใช้ใบงาน</p>${matrix("ans.usageMatrix", "none", "วิชาและชั้นที่ใช้")}` : ""}</div>
  </section>
  <section style="display:grid;gap:14px">
    <h3>ตอนที่ 3 ข้อเสนอแนะอื่น ๆ (ถ้ามี)</h3>
    ${area("ans.suggestion", "ข้อเสนอแนะที่เป็นประโยชน์ต่อการใช้และพัฒนาคู่มือครู แผนการจัดการเรียนรู้ และชุดกิจกรรมการเรียนรู้ (ใบงาน)")}
  </section>`;
}

function teacherForm() {
  return `
  <section style="display:grid;gap:14px">
    <h3>วิชา / ชั้นที่ใช้สมุดใบงาน</h3>
    <p class="hint">เลือกทุกวิชาและระดับชั้นที่ท่านรับผิดชอบและใช้ใบงาน</p>
    <div id="f_teaching">${matrix("ans.teaching", "blocks", "วิชาและชั้นที่รับผิดชอบ")}</div>
    <fieldset id="f_use"><legend>ลักษณะการใช้ชุดกิจกรรมการเรียนรู้ (ใบงาน) <b style="color:var(--bad)">*</b></legend>
      ${checks("ans.use", TEACHER_USE, { re: "useOther" })}
      <div id="useOther">${(st.ans.use || []).includes("other") ? text("ans.useOther", "ระบุลักษณะการใช้อื่น ๆ") : ""}</div></fieldset>
    <fieldset id="f_store"><legend>การเก็บรักษาชุดกิจกรรมการเรียนรู้ (ใบงาน) <b style="color:var(--bad)">*</b></legend>
      ${radios("ans.store", TEACHER_STORE, { re: "storeOther" })}
      <div id="storeOther">${st.ans.store === "other" ? text("ans.storeOther", "ระบุวิธีเก็บรักษาอื่น ๆ") : ""}</div></fieldset>
  </section>
  <section style="display:grid;gap:12px">
    <h3>ตอนที่ 1 การประเมินชุดกิจกรรมการเรียนรู้ (ใบงาน)</h3>
    <p class="hint">ประเมินทุกวิชาในแต่ละระดับชั้นที่เลือกไว้ โดยเลือกระดับความคิดเห็น</p>
    ${scaleLegend(TEACHER_SCALE)}
    <div id="blocks" style="display:grid;gap:14px"></div>
  </section>
  <section style="display:grid;gap:14px">
    <h3>ตอนที่ 2 ความพึงพอใจการใช้ชุดกิจกรรมการเรียนรู้ (ใบงาน)</h3>
    ${area("ans.satisfaction", "ความพึงพอใจโดยรวมต่อชุดกิจกรรมการเรียนรู้ (ใบงาน)")}
  </section>
  <section style="display:grid;gap:14px">
    <h3>ตอนที่ 3 ข้อเสนอแนะอื่น ๆ (ถ้ามี)</h3>
    ${area("ans.suggestion", "ข้อเสนอแนะที่เป็นประโยชน์ต่อการใช้และพัฒนาคู่มือครู แผนการจัดการเรียนรู้ และชุดกิจกรรมการเรียนรู้ (ใบงาน)")}
  </section>`;
}

function studentForm() {
  const subj = Object.fromEntries(SUBJECTS.map(s => [s.key, s.name]));
  return `
  <section style="display:grid;gap:14px">
    <h3>ตอนที่ 1 ข้อมูลนักเรียน</h3>
    <fieldset id="f_grade"><legend>นักเรียนเรียนอยู่ชั้น <b style="color:var(--bad)">*</b></legend>
      ${radios("ans.grade", Object.fromEntries(STUDENT_GRADES.map(g => [g, `ชั้นประถมศึกษาปีที่ ${g}`])), { num: true })}</fieldset>
    <fieldset id="f_used"><legend>นักเรียนใช้ใบงานวิชาใดบ้าง (เลือกได้มากกว่า 1 วิชา) <b style="color:var(--bad)">*</b></legend>
      ${checks("ans.subjectsUsed", subj, { re: "blocks" })}</fieldset>
  </section>
  <section style="display:grid;gap:12px">
    <h3>ตอนที่ 2 ความพึงพอใจต่อการใช้ใบงาน</h3>
    <p class="hint">ให้คะแนนทุกวิชาที่นักเรียนใช้ใบงาน</p>
    ${scaleLegend(STUDENT_SCALE)}
    <div id="blocks" style="display:grid;gap:14px"></div>
  </section>
  <section style="display:grid;gap:14px">
    <h3>ตอนที่ 3 นักเรียนชอบใบงานวิชาอะไรมากที่สุด</h3>
    <fieldset id="f_fav"><legend>เลือกได้มากกว่า 1 วิชา</legend>${checks("ans.favorites", subj)}</fieldset>
    ${area("ans.favoriteReason", "ชอบเพราะ")}
  </section>
  <section style="display:grid;gap:14px">
    <h3>ตอนที่ 4 ข้อเสนอแนะอื่น ๆ (ถ้ามี)</h3>
    ${area("ans.suggestion", "อยากให้ใบงานมีอะไรเพิ่ม หรือปรับปรุงตรงไหน")}
  </section>`;
}

function renderForm() {
  const r = ROLES[st.role];
  $("#formEyebrow").textContent = `แบบสำรวจสำหรับ${r.label}`;
  $("#formTitle").textContent = st.role === "director" ? "แบบสำรวจการใช้ชุดกิจกรรมการเรียนรู้ (ใบงาน)"
    : st.role === "teacher" ? "แบบประเมินการใช้ชุดกิจกรรมการเรียนรู้ (ใบงาน)" : "แบบสอบถามความพึงพอใจการใช้ใบงาน";
  const s = st.school || {};
  $("#formSchool").textContent = `โรงเรียน${s.name || ""} · ${[s.amphoe && "อ." + s.amphoe, s.province && "จ." + s.province].filter(Boolean).join(" ")} · ${ALLOC[schoolAlloc()]}`;
  $("#form").innerHTML = st.role === "director" ? directorForm() : st.role === "teacher" ? teacherForm() : studentForm();
  renderBlocks();
  $("#formErr").hidden = true;
}

function rerender(what) {
  if (what === "blocks") renderBlocks();
  if (what === "usage") $("#usageMatrix").innerHTML = st.ans.usage === "partial"
    ? `<p class="hint" style="margin-bottom:6px">เลือกวิชาและระดับชั้นที่ใช้ใบงาน</p>${matrix("ans.usageMatrix", "none", "วิชาและชั้นที่ใช้")}` : "";
  if (what === "useOther") $("#useOther").innerHTML = (st.ans.use || []).includes("other") ? text("ans.useOther", "ระบุลักษณะการใช้อื่น ๆ") : "";
  if (what === "storeOther") $("#storeOther").innerHTML = st.ans.store === "other" ? text("ans.storeOther", "ระบุวิธีเก็บรักษาอื่น ๆ") : "";
}

// ---------- school step ----------
// เดาหน่วยงานต้นสังกัดจากเขตพื้นที่ (ผู้ตอบเปลี่ยนเองได้)
function guessAffiliation(s) {
  const a = s.area || "", n = s.name || "";
  if (/วังไกลกังวล/.test(n)) return "wkk";
  if (/ตชด|ตำรวจตระเวนชายแดน/.test(a + n)) return "bpp";
  if (/^สพ[ปม]/.test(a)) return "obec";
  return null;
}
const schoolAlloc = () => (st.mode === "manual" ? "origin" : (st.school && st.school.alloc) || "origin");

function renderPicked() {
  const host = $("#picked");
  if (st.mode !== "list" || !st.school) { host.innerHTML = ""; return; }
  const s = st.school;
  host.innerHTML = `<div class="school-card">
    <div class="top"><h3>โรงเรียน${esc(s.name)}</h3><span class="badge b-${s.alloc}">${esc(ALLOC[s.alloc])}</span></div>
    <dl class="kv">
      <div><dt>รหัสโรงเรียน</dt><dd>${esc(s.code)}</dd></div>
      <div><dt>ตำบล</dt><dd>${esc(s.tambon)}</dd></div>
      <div><dt>อำเภอ</dt><dd>${esc(s.amphoe)}</dd></div>
      <div><dt>จังหวัด</dt><dd>${esc(s.province)}</dd></div>
      <div><dt>รหัสไปรษณีย์</dt><dd>${esc(s.zip)}</dd></div>
      <div><dt>โทรศัพท์</dt><dd>${esc(s.phone)}</dd></div>
      <div><dt>เขตพื้นที่การศึกษา</dt><dd>${esc(s.area)}</dd></div>
    </dl>
    <div><button class="link" type="button" id="unpick">ไม่ใช่โรงเรียนนี้ ค้นหาใหม่</button></div>
  </div>`;
  $("#unpick").onclick = () => { st.school = null; renderPicked(); $("#q").focus(); saveDraft(); };
}

function renderAffil() {
  $("#affilChoices").innerHTML = Object.entries(AFFILIATIONS).map(([v, l]) => `
    <label class="choice"><input type="radio" name="affil" value="${v}" data-k="affiliation" ${st.affiliation === v ? "checked" : ""}><span>${esc(l)}</span></label>`).join("");
}

function setMode(m) {
  st.mode = m;
  if (m === "manual" && (!st.school || st.school.alloc !== "origin")) st.school = { alloc: "origin" };
  if (m === "list" && st.school && st.school.alloc === "origin") st.school = null;
  document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
  $("#modeList").hidden = m !== "list";
  $("#modeManual").hidden = m !== "manual";
  if (m === "manual") ["code", "name", "tambon", "amphoe", "province", "zip", "phone"].forEach(f => { $("#m_" + f).value = (st.school && st.school[f]) || ""; });
  renderPicked();
}

let searchT;
function search() {
  const raw = $("#q").value.trim(), prov = $("#prov").value, ul = $("#results");
  if (!schools.length || (!raw && !prov)) { ul.hidden = true; return; }
  const q = normalize(raw), digits = /^\d+$/.test(raw);
  let hits = schools.filter(s => (!prov || s.province === prov) && (!raw || (digits ? s.code.startsWith(raw) : s._n.includes(q))));
  if (q && !digits) hits.sort((a, b) => (b._n.startsWith(q) - a._n.startsWith(q)) || a._n.length - b._n.length);
  const shown = hits.slice(0, 40);
  ul.hidden = false;
  ul.innerHTML = shown.length ? shown.map(s => `<li><button type="button" data-code="${s.code}">
      <span class="nm">${esc(s.name)}</span><span class="badge b-${s.alloc}">${esc(ALLOC[s.alloc])}</span>
      <span class="loc">${esc(s.code)} · ต.${esc(s.tambon)} อ.${esc(s.amphoe)} จ.${esc(s.province)}</span></button></li>`).join("")
    + (hits.length > 40 ? `<li class="empty">พบ ${hits.length.toLocaleString("th-TH")} โรงเรียน แสดง 40 รายการแรก พิมพ์ชื่อให้ละเอียดขึ้นหรือเลือกจังหวัด</li>` : "")
    : `<li class="empty">ไม่พบโรงเรียนที่ค้นหา ลองพิมพ์ชื่อสั้นลง หรือเลือก "โรงเรียนต้นทาง / ไม่พบชื่อ" เพื่อกรอกข้อมูลเอง</li>`;
}

// ---------- validation ----------
function markMissing(sel) { const el = typeof sel === "string" ? $(sel) : sel; if (el) el.classList.add("missing"); return el; }
function validateSchool() {
  const errs = [];
  if (st.mode === "list") { if (!st.school || !st.school.code) errs.push(["#q", "กรุณาค้นหาและเลือกโรงเรียน"]); }
  else {
    const s = st.school || {};
    if (!/^\d{10}$/.test(s.code || "")) errs.push(["#m_code", "รหัสโรงเรียนต้องเป็นตัวเลข 10 หลัก"]);
    if (!s.name) errs.push(["#m_name", "กรุณากรอกชื่อโรงเรียน"]);
    if (!s.province) errs.push(["#m_province", "กรุณากรอกจังหวัด"]);
  }
  if (!st.affiliation) errs.push(["#affil", "กรุณาเลือกหน่วยงานต้นสังกัด"]);
  return errs;
}
function validateForm() {
  const a = st.ans, errs = [];
  const need = (cond, sel, msg) => { if (!cond) errs.push([sel, msg]); };
  if (st.role === "director") {
    need(a.hasDirector, "#f_hasDirector", "ระบุว่ามีผู้อำนวยการ/ครูใหญ่หรือไม่");
    need(a.teachersTotal != null && a.teachersTotal !== "", "#f_teachersTotal", "กรอกจำนวนครูผู้สอน");
    need(a.coordinator?.name, "#f_cname", "กรอกชื่อผู้ประสานงาน");
    need(a.coordinator?.surname, "#f_csurname", "กรอกนามสกุลผู้ประสานงาน");
    need(a.coordinator?.mobile, "#f_cmobile", "กรอกเบอร์มือถือผู้ประสานงาน");
    need(a.usage, "#f_usage", "เลือกลักษณะการใช้ใบงาน");
    if (a.usage === "partial") need(Object.values(a.usageMatrix || {}).some(x => x.length), "#usageMatrix", "เลือกวิชาและชั้นที่ใช้ใบงานอย่างน้อย 1 ช่อง");
  } else {
    if (st.role === "teacher") {
      need(Object.values(a.teaching || {}).some(x => x.length), "#f_teaching", "เลือกวิชาและชั้นที่ใช้ใบงานอย่างน้อย 1 ช่อง");
      need((a.use || []).length, "#f_use", "เลือกลักษณะการใช้ใบงาน");
      need(a.store, "#f_store", "เลือกวิธีการเก็บรักษาใบงาน");
    } else {
      need(a.grade, "#f_grade", "เลือกระดับชั้น");
      need((a.subjectsUsed || []).length, "#f_used", "เลือกวิชาที่ใช้ใบงาน");
    }
    const total = itemCount();
    for (const b of blockKeys()) {
      const r = (a.ratings || {})[b.key] || {};
      const miss = [...Array(total).keys()].filter(i => r[i] == null);
      if (miss.length) {
        miss.forEach(i => markMissing(`#ri_${b.key}_${i}`));
        errs.push([`#rb_${b.key}`, `${b.title}: ยังไม่ได้ตอบ ${miss.length} ข้อ`]);
      }
    }
  }
  return errs;
}
function showErrors(errs, box) {
  errs.forEach(([sel]) => markMissing(sel));
  if (box) { box.hidden = false; box.innerHTML = `<b>กรุณาตอบให้ครบก่อนส่ง</b><br>${errs.slice(0, 8).map(e => "• " + esc(e[1])).join("<br>")}${errs.length > 8 ? `<br>และอีก ${errs.length - 8} รายการ` : ""}`; }
  const first = $(errs[0][0]);
  if (first) { if (first.tagName === "DETAILS") first.open = true; first.scrollIntoView({ behavior: "smooth", block: "center" }); }
}

// ---------- build record ----------
function buildRecord() {
  const s = st.school || {}, a = structuredClone(st.ans);
  const total = itemCount();
  if (st.role !== "director") {
    const ratings = {};
    for (const b of blockKeys()) ratings[b.key] = [...Array(total).keys()].map(i => Number(a.ratings[b.key][i]));
    a.ratings = ratings;
    if (st.role === "teacher") {
      a.teaching = Object.fromEntries(Object.entries(a.teaching || {}).filter(([, v]) => v.length));
      if (!(a.use || []).includes("other")) delete a.useOther;
      if (a.store !== "other") delete a.storeOther;
    }
  } else {
    a.usageMatrix = a.usage === "partial" ? Object.fromEntries(Object.entries(a.usageMatrix || {}).filter(([, v]) => v.length)) : {};
    ["deputies", "teachersTotal", "clerks"].forEach(k => { a[k] = a[k] === "" || a[k] == null ? null : Number(a[k]); });
    a.majors = Object.fromEntries(Object.entries(a.majors || {}).filter(([, v]) => v !== "" && v != null).map(([k, v]) => [k, Number(v)]));
  }
  return {
    role: st.role, surveyYear: SURVEY.year,
    schoolType: st.mode === "list" ? "destination" : "origin",
    allocation: schoolAlloc(), affiliation: st.affiliation,
    schoolCode: String(s.code || ""), schoolName: s.name || "", tambon: s.tambon || "", amphoe: s.amphoe || "",
    province: s.province || "", zip: s.zip || "", phone: s.phone || "", area: s.area || "",
    answers: a
  };
}

// ---------- navigation ----------
function show(n) {
  st.step = n;
  [1, 2, 3, 4].forEach(i => { $("#s" + i).hidden = i !== n; });
  document.querySelectorAll("#steps li").forEach(li => {
    const i = +li.dataset.s; li.className = i === n ? "on" : i < n ? "done" : "";
  });
  if (n === 2) { renderAffil(); setMode(st.mode); }
  if (n === 3) renderForm();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (n < 4) saveDraft();
}

function renderRoles() {
  $("#roles").innerHTML = Object.entries(ROLES).map(([k, r]) => `
    <button type="button" class="role" data-role="${k}" aria-pressed="${st.role === k}">
      <span class="t">${esc(r.label)}</span><span class="n">${esc(r.note)}</span></button>`).join("");
  $("#to2").disabled = !st.role;
}

// ---------- events ----------
document.addEventListener("input", e => {
  const el = e.target, k = el.dataset && el.dataset.k;
  if (!k) return;
  if (el.type === "checkbox") {
    const v = el.dataset.num ? Number(el.value) : el.value;
    const set = new Set(val(k) || []);
    el.checked ? set.add(v) : set.delete(v);
    setPath(st, k, [...set].sort((x, y) => (x > y ? 1 : -1)));
  } else if (el.type === "radio") {
    if (el.checked) setPath(st, k, el.dataset.num ? Number(el.value) : el.value);
  } else {
    setPath(st, k, el.value);
  }
  el.classList.remove("missing");
  el.closest(".missing")?.classList.remove("missing");
  if (el.dataset.re) rerender(el.dataset.re);
  if (el.dataset.block) updateCount(el.dataset.block);
  saveDraft();
});

document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.role) { if (st.role !== t.dataset.role) st.ans = {}; st.role = t.dataset.role; renderRoles(); saveDraft(); }
  if (t.dataset.mode) setMode(t.dataset.mode);
  if (t.dataset.back) show(+t.dataset.back);
  if (t.dataset.code) {
    st.school = schools.find(s => s.code === t.dataset.code);
    const guess = guessAffiliation(st.school);
    if (guess) st.affiliation = guess;
    $("#results").hidden = true; renderPicked(); renderAffil(); saveDraft();
  }
  if (t.dataset.copy) {
    const keys = blockKeys().map(b => b.key), i = keys.indexOf(t.dataset.copy);
    const prev = (st.ans.ratings || {})[keys[i - 1]];
    if (prev) { setPath(st, `ans.ratings.${t.dataset.copy}`, { ...prev }); renderBlocks(); saveDraft(); $(`#rb_${t.dataset.copy}`).scrollIntoView({ block: "start" }); }
  }
});

$("#to2").onclick = () => st.role && show(2);
$("#to3").onclick = () => {
  document.querySelectorAll("#s2 .missing").forEach(x => x.classList.remove("missing"));
  const errs = validateSchool();
  if (errs.length) { showErrors(errs); return; }
  show(3);
};
$("#q").addEventListener("input", () => { clearTimeout(searchT); searchT = setTimeout(search, 120); });
$("#prov").addEventListener("change", search);

$("#submit").onclick = async () => {
  document.querySelectorAll("#s3 .missing").forEach(x => x.classList.remove("missing"));
  const errs = validateForm();
  if (errs.length) { showErrors(errs, $("#formErr")); return; }
  const btn = $("#submit"); btn.disabled = true; btn.textContent = "กำลังส่ง…";
  try {
    const id = await submitResponse(buildRecord());
    $("#refNo").textContent = `เลขอ้างอิง ${id}`;
    clearDraft(); show(4);
  } catch (err) {
    const box = $("#formErr"); box.hidden = false;
    const code = err instanceof SubmitError ? err.code : "";
    box.textContent = err instanceof AlreadySubmittedError
      ? "โรงเรียนนี้ส่งแบบสำรวจของผู้บริหารแล้ว (ตอบได้ 1 ชุดต่อโรงเรียน) หากต้องการแก้ไขข้อมูล กรุณาติดต่อผู้ดูแลระบบ"
      : code === "permission-denied"
      ? "ระบบยังไม่พร้อมรับคำตอบ (ฐานข้อมูลไม่อนุญาตให้บันทึก) กรุณาแจ้งผู้ดูแลระบบ คำตอบของท่านยังอยู่ในหน้านี้ [permission-denied]"
      : `ส่งไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วกดส่งอีกครั้ง คำตอบของท่านยังอยู่ในหน้านี้${code ? ` [${code}]` : ""}`;
    console.error(err);
  } finally { btn.disabled = false; btn.textContent = "ส่งแบบสำรวจ"; }
};
$("#again").onclick = () => {
  const keep = { role: st.role, mode: st.mode, school: st.school, affiliation: st.affiliation };
  st = { ...fresh(), ...keep }; renderRoles(); show(st.role === "director" ? 1 : 3);
};

// ---------- boot ----------
$("#org").textContent = SURVEY.org;
$("#title").textContent = SURVEY.title;
$("#subtitle").textContent = `${SURVEY.subtitle} ปีการศึกษา ${SURVEY.year}`;
$("#demoFlag").hidden = !DEMO;

if (!SURVEY.open) {
  ["#steps", "#s1"].forEach(s => { $(s).hidden = true; });
  $("#s1").insertAdjacentHTML("afterend", `<section class="panel"><p>${esc(SURVEY.closedMessage)}</p></section>`);
} else {
  renderRoles(); show(1);
  const d = readDraft();
  if (d && d.role && d.step > 1 && d.step < 4) {
    $("#draftBar").hidden = false;
    $("#draftResume").onclick = () => { st = { ...fresh(), ...d }; renderRoles(); $("#draftBar").hidden = true; show(d.step); };
    $("#draftDiscard").onclick = () => { clearDraft(); $("#draftBar").hidden = true; };
  }
}

loadSchools().then(list => {
  schools = list;
  const provs = [...new Set(list.map(s => s.province))].sort((a, b) => a.localeCompare(b, "th"));
  $("#prov").insertAdjacentHTML("beforeend", provs.map(p => `<option>${esc(p)}</option>`).join(""));
  $("#loadMsg").textContent = `รายชื่อโรงเรียนที่ได้รับจัดสรรใบงาน ${list.length.toLocaleString("th-TH")} โรงเรียน`;
  if ($("#q").value) search();
}).catch(() => { $("#loadMsg").textContent = "โหลดรายชื่อโรงเรียนไม่สำเร็จ กรุณารีเฟรชหน้า หรือเลือกกรอกข้อมูลเอง"; });
