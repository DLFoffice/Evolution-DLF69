import { SURVEY } from "./config.js";
import { DEMO, fetchResponses, deleteResponse, onAuth, signIn, signOut, isAdmin, loadSchools, demoReplace } from "./store.js";
import {
  ROLES, SUBJECTS, SUBJECT_NAME, GRADES, STUDENT_GRADES, ALLOC, AFFILIATIONS, MAJORS, DIRECTOR_USAGE,
  TEACHER_USE, TEACHER_STORE, TEACHER_GROUPS, STUDENT_GROUPS, TEACHER_ITEMS, STUDENT_ITEMS, level
} from "./questions.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (x, d = 2) => (x == null || isNaN(x) ? "–" : x.toFixed(d));
const nf = n => Number(n || 0).toLocaleString("th-TH");
const pct = (a, b) => (b ? (a / b) * 100 : 0);

let all = [], schools = [];
const F = { alloc: "", prov: "", area: "", type: "" };
const sub = { tSubj: "", tGrade: "", sSubj: "", sGrade: "", q: "", list: "" };
let tab = "overview";
const TABS = { overview: "ภาพรวม", director: "ผู้บริหาร", teacher: "ครู", student: "นักเรียน", notes: "ข้อเสนอแนะ", list: "รายการคำตอบ" };

// ---------- stats ----------
function stats(v) {
  const n = v.length; if (!n) return { n: 0, mean: null, sd: null };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd };
}
const lvNum = m => (m >= 4.51 ? 5 : m >= 3.51 ? 4 : m >= 2.51 ? 3 : m >= 1.51 ? 2 : 1);
const lvBadge = m => (m == null ? "–" : `<span class="lv lv-${lvNum(m)}">${level(m)}</span>`);

// ---------- filtering ----------
const matchSchool = s => (!F.alloc || s.alloc === F.alloc) && (!F.prov || s.province === F.prov) && (!F.area || s.area === F.area);
function rows() {
  return all.filter(r => (!F.alloc || r.allocation === F.alloc) && (!F.prov || r.province === F.prov)
    && (!F.area || r.area === F.area) && (!F.type || r.schoolType === F.type));
}
const byRole = (list, role) => list.filter(r => r.role === role);

// rating blocks: [{resp, subj, grade, vals}]
function blocks(list, role) {
  const out = [];
  for (const r of byRole(list, role)) {
    for (const [k, vals] of Object.entries(r.answers?.ratings || {})) {
      if (role === "teacher") { const [s, g] = k.split("_"); out.push({ r, subj: s, grade: +g, vals }); }
      else out.push({ r, subj: k, grade: r.answers?.grade, vals });
    }
  }
  return out;
}
function itemStats(bl, nItems) {
  const per = [...Array(nItems)].map(() => []);
  bl.forEach(b => b.vals.forEach((v, i) => { if (v >= 1 && v <= 5) per[i].push(v); }));
  return per.map(stats);
}
const blockMean = b => b.vals.reduce((a, c) => a + c, 0) / b.vals.length;

// ---------- UI pieces ----------
function hbars(items, { max = 5, digits = 2, unit = "" } = {}) {
  if (!items.length) return `<p class="hint">ยังไม่มีข้อมูล</p>`;
  const ticks = max === 5 ? [0, 1, 2, 3, 4, 5] : null;
  return `<div class="hbars">${items.map(([lab, v, extra]) => `
    <div class="hbar"><span class="lab">${esc(lab)}${extra ? ` <small class="hint">${esc(extra)}</small>` : ""}</span>
      <span class="track"><span class="fill" style="width:${v == null ? 0 : Math.min(100, (v / max) * 100)}%"></span></span>
      <span class="num">${v == null ? "–" : fmt(v, digits) + unit}</span></div>`).join("")}
    ${ticks ? `<div class="axis"><span></span><span class="ticks">${ticks.map(t => `<span>${t}</span>`).join("")}</span><span></span></div>` : ""}</div>`;
}
function countBars(entries, total) {
  return hbars(entries.map(([l, c]) => [l, pct(c, total), `${nf(c)} คน`]), { max: 100, digits: 1, unit: "%" });
}
function itemTable(groups, st) {
  let i = 0, body = "";
  for (const g of groups) {
    const gs = st.slice(i, i + g.items.length).filter(s => s.n);
    const gMean = gs.length ? gs.reduce((a, s) => a + s.mean, 0) / gs.length : null;
    body += `<tr class="grp"><td colspan="3">${esc(g.title)}</td><td class="n">${fmt(gMean)}</td><td></td><td>${lvBadge(gMean)}</td></tr>`;
    for (const t of g.items) {
      const s = st[i++];
      body += `<tr><td class="n">${i}</td><td>${esc(t)}</td><td class="n">${nf(s.n)}</td><td class="n">${fmt(s.mean)}</td><td class="n">${fmt(s.sd)}</td><td>${lvBadge(s.mean)}</td></tr>`;
    }
  }
  const ok = st.filter(s => s.n);
  const tot = ok.length ? ok.reduce((a, s) => a + s.mean, 0) / ok.length : null;
  body += `<tr class="tot"><td></td><td>รวมเฉลี่ยทุกข้อ</td><td></td><td class="n">${fmt(tot)}</td><td></td><td>${lvBadge(tot)}</td></tr>`;
  return `<div class="tbl-wrap"><table><thead><tr><th class="n">ข้อ</th><th>รายการ</th><th class="n">n</th><th class="n">x̄</th><th class="n">S.D.</th><th>ระดับ</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="hint">เกณฑ์: 4.51–5.00 มากที่สุด · 3.51–4.50 มาก · 2.51–3.50 ปานกลาง · 1.51–2.50 น้อย · 1.00–1.50 น้อยที่สุด</p>`;
}
const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const panel = (title, body, hint = "") => `<section class="panel"><header><h2>${esc(title)}</h2>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</header>${body}</section>`;

// ---------- views ----------
function viewOverview(list) {
  const sch = schools.filter(matchSchool);
  const answered = new Set(list.map(r => r.schoolCode));
  const destAnswered = sch.filter(s => answered.has(s.code)).length;
  const d = byRole(list, "director"), t = byRole(list, "teacher"), s = byRole(list, "student");
  const kpi = (k, v, sub = "") => `<div class="kpi"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${sub}</span></div>`;

  const allocRows = ["sem1", "sem2", "both", "origin"].filter(a => !F.alloc || F.alloc === a).map(a => {
    const tot = schools.filter(x => x.alloc === a && matchSchool(x)).length;
    const lr = list.filter(r => r.allocation === a);
    const resp = new Set(lr.map(r => r.schoolCode)).size;
    return `<tr><td><span class="badge b-${a}">${esc(ALLOC[a])}</span></td><td class="n">${a === "origin" ? "–" : nf(tot)}</td><td class="n">${nf(resp)}</td>
      <td>${a === "origin" ? "" : `<div class="pct"><span class="track"><span class="fill" style="width:${pct(resp, tot)}%"></span></span><span class="n">${fmt(pct(resp, tot), 1)}%</span></div>`}</td>
      <td class="n">${nf(byRole(lr, "director").length)}</td><td class="n">${nf(byRole(lr, "teacher").length)}</td><td class="n">${nf(byRole(lr, "student").length)}</td></tr>`;
  }).join("");

  const provs = {};
  sch.forEach(x => { (provs[x.province] ||= { tot: 0, resp: 0, d: 0, t: 0, s: 0 }).tot++; if (answered.has(x.code)) provs[x.province].resp++; });
  list.forEach(r => { const p = (provs[r.province] ||= { tot: 0, resp: 0, d: 0, t: 0, s: 0 }); p[r.role[0]]++; });
  const provRows = Object.entries(provs).sort((a, b) => a[0].localeCompare(b[0], "th")).map(([p, v]) =>
    `<tr><td>${esc(p)}</td><td class="n">${nf(v.tot)}</td><td class="n">${nf(v.resp)}</td><td class="n">${fmt(pct(v.resp, v.tot), 1)}%</td><td class="n">${nf(v.d)}</td><td class="n">${nf(v.t)}</td><td class="n">${nf(v.s)}</td></tr>`).join("");

  const subjMeans = (role) => SUBJECTS.map(sj => {
    const bl = blocks(list, role).filter(b => b.subj === sj.key);
    const st = stats(bl.map(blockMean));
    return [sj.name, st.mean, st.n ? `${nf(st.n)} ชุด` : ""];
  });

  return `
  <div class="kpis">
    ${kpi("คำตอบทั้งหมด", nf(list.length))}
    ${kpi("โรงเรียนที่ตอบแล้ว", nf(destAnswered), `จาก ${nf(sch.length)} โรงเรียนปลายทาง (${fmt(pct(destAnswered, sch.length), 1)}%)`)}
    ${kpi("ผู้บริหาร", nf(d.length), "ชุด (1 ชุด/โรงเรียน)")}
    ${kpi("ครู", nf(t.length), "คน")}
    ${kpi("นักเรียน", nf(s.length), "คน")}
  </div>
  ${panel("อัตราการตอบตามกลุ่มการจัดสรร", `<div class="tbl-wrap"><table><thead><tr><th>กลุ่ม</th><th class="n">โรงเรียนทั้งหมด</th><th class="n">ตอบแล้ว</th><th>อัตราการตอบ</th><th class="n">ผู้บริหาร</th><th class="n">ครู</th><th class="n">นักเรียน</th></tr></thead><tbody>${allocRows}</tbody></table></div>`,
    "นับโรงเรียนที่มีผู้ตอบอย่างน้อย 1 คน (กลุ่มใดก็ได้)")}
  <div class="two">
    ${panel("ความคิดเห็นของครู รายวิชา", hbars(subjMeans("teacher")), "ค่าเฉลี่ย 20 ข้อ (เต็ม 5)")}
    ${panel("ความพึงพอใจของนักเรียน รายวิชา", hbars(subjMeans("student")), "ค่าเฉลี่ย 12 ข้อ (เต็ม 5)")}
  </div>
  ${panel("แยกตามจังหวัด", `<div class="scroll"><table><thead><tr><th>จังหวัด</th><th class="n">โรงเรียน</th><th class="n">ตอบแล้ว</th><th class="n">%</th><th class="n">ผู้บริหาร</th><th class="n">ครู</th><th class="n">นักเรียน</th></tr></thead><tbody>${provRows || `<tr><td colspan="7" class="hint">ยังไม่มีข้อมูล</td></tr>`}</tbody></table></div>`)}`;
}

function viewDirector(list) {
  const d = byRole(list, "director");
  const usage = Object.entries(DIRECTOR_USAGE).map(([k, l]) => [l, d.filter(r => r.answers?.usage === k).length]);
  const partial = d.filter(r => r.answers?.usage === "partial");
  const mrows = SUBJECTS.map(s => `<tr><td>${esc(s.name)}</td>${GRADES.map(g => {
    const c = partial.filter(r => (r.answers.usageMatrix?.[s.key] || []).includes(g)).length;
    return `<td class="n">${c || "·"}</td>`; }).join("")}</tr>`).join("");
  const teach = stats(d.map(r => r.answers?.teachersTotal).filter(x => x != null));
  const hasDir = d.filter(r => r.answers?.hasDirector === "yes").length;
  const majors = MAJORS.map(([k, n]) => [n, d.reduce((a, r) => a + (Number(r.answers?.majors?.[k]) || 0), 0)]);
  const maxMajor = Math.max(1, ...majors.map(m => m[1]));
  const contacts = d.slice().sort((a, b) => (a.province + a.schoolName).localeCompare(b.province + b.schoolName, "th")).map(r => {
    const c = r.answers?.coordinator || {};
    return `<tr><td>${esc(r.schoolCode)}</td><td>${esc(r.schoolName)}</td><td>${esc(r.province)}</td><td>${esc((c.name || "") + " " + (c.surname || ""))}</td><td>${esc(c.position)}</td><td>${esc(c.mobile)}</td><td>${esc(c.email)}</td><td>${esc(c.line)}</td></tr>`;
  }).join("");
  return `
  <div class="kpis">
    <div class="kpi"><span class="k">แบบสำรวจผู้บริหาร</span><span class="v">${nf(d.length)}</span><span class="s">โรงเรียน</span></div>
    <div class="kpi"><span class="k">มีผู้อำนวยการ/ครูใหญ่</span><span class="v">${fmt(pct(hasDir, d.length), 0)}%</span><span class="s">${nf(hasDir)} โรงเรียน</span></div>
    <div class="kpi"><span class="k">ครูผู้สอนเฉลี่ย</span><span class="v">${fmt(teach.mean, 1)}</span><span class="s">คนต่อโรงเรียน</span></div>
  </div>
  <div class="two">
    ${panel("ลักษณะการใช้ใบงานของโรงเรียน", countBars(usage, d.length))}
    ${panel("วิชาและชั้นที่ใช้ (กลุ่มที่ใช้บางวิชา)", `<div class="tbl-wrap"><table><thead><tr><th>วิชา</th>${GRADES.map(g => `<th class="n">ป.${g}</th>`).join("")}</tr></thead><tbody>${mrows}</tbody></table></div>`, `จำนวนโรงเรียน จาก ${nf(partial.length)} โรงเรียนที่ใช้บางวิชาบางชั้น`)}
  </div>
  ${panel("ครูที่สอนตรงวิชาเอก (รวมทุกโรงเรียน)", hbars(majors.map(([n, c]) => [n, c]), { max: maxMajor, digits: 0, unit: " คน" }))}
  ${panel("ผู้ประสานงาน DLTV ของโรงเรียน", `<div class="scroll"><table><thead><tr><th>รหัส</th><th>โรงเรียน</th><th>จังหวัด</th><th>ชื่อ-สกุล</th><th>ตำแหน่ง</th><th>มือถือ</th><th>e-mail</th><th>Line</th></tr></thead><tbody>${contacts || `<tr><td colspan="8" class="hint">ยังไม่มีข้อมูล</td></tr>`}</tbody></table></div>`)}`;
}

function viewTeacher(list) {
  const t = byRole(list, "teacher");
  const allBl = blocks(list, "teacher");
  const bl = allBl.filter(b => (!sub.tSubj || b.subj === sub.tSubj) && (!sub.tGrade || b.grade === +sub.tGrade));
  const use = Object.entries(TEACHER_USE).map(([k, l]) => [l, t.filter(r => (r.answers?.use || []).includes(k)).length]);
  const store = Object.entries(TEACHER_STORE).map(([k, l]) => [l, t.filter(r => r.answers?.store === k).length]);
  const byGrade = GRADES.map(g => { const s = stats(allBl.filter(b => b.grade === g && (!sub.tSubj || b.subj === sub.tSubj)).map(blockMean)); return [`ป.${g}`, s.mean, s.n ? `${nf(s.n)} ชุด` : ""]; });
  return `
  ${panel("ผลการประเมินรายข้อ", `
    <div class="toolbar">
      <label class="f"><span>วิชา</span>${sel("tSubj", [["", "ทุกวิชา"], ...SUBJECTS.map(s => [s.key, s.name])], sub.tSubj)}</label>
      <label class="f"><span>ระดับชั้น</span>${sel("tGrade", [["", "ทุกชั้น"], ...GRADES.map(g => [g, `ป.${g}`])], sub.tGrade)}</label>
    </div>
    <p class="hint">${nf(bl.length)} ชุดการประเมิน จากครู ${nf(new Set(bl.map(b => b.r.id)).size)} คน</p>
    ${itemTable(TEACHER_GROUPS, itemStats(bl, TEACHER_ITEMS.length))}`)}
  <div class="two">
    ${panel("ค่าเฉลี่ยรายชั้น", hbars(byGrade), sub.tSubj ? SUBJECT_NAME[sub.tSubj] : "ทุกวิชา")}
    ${panel("ลักษณะการใช้ใบงาน", countBars(use, t.length), "ตอบได้มากกว่า 1 ข้อ")}
  </div>
  ${panel("การเก็บรักษาใบงาน", countBars(store, t.length))}`;
}

function viewStudent(list) {
  const s = byRole(list, "student").filter(r => !sub.sGrade || r.answers?.grade === +sub.sGrade);
  const bl = blocks(s, "student").filter(b => !sub.sSubj || b.subj === sub.sSubj);
  const fav = SUBJECTS.map(x => [x.name, s.filter(r => (r.answers?.favorites || []).includes(x.key)).length]).sort((a, b) => b[1] - a[1]);
  const used = SUBJECTS.map(x => [x.name, s.filter(r => (r.answers?.subjectsUsed || []).includes(x.key)).length]);
  return `
  ${panel("ความพึงพอใจรายข้อ", `
    <div class="toolbar">
      <label class="f"><span>วิชา</span>${sel("sSubj", [["", "ทุกวิชา"], ...SUBJECTS.map(x => [x.key, x.name])], sub.sSubj)}</label>
      <label class="f"><span>ระดับชั้น</span>${sel("sGrade", [["", "ป.4 – ป.6"], ...STUDENT_GRADES.map(g => [g, `ป.${g}`])], sub.sGrade)}</label>
    </div>
    <p class="hint">${nf(bl.length)} ชุดการประเมิน จากนักเรียน ${nf(s.length)} คน</p>
    ${itemTable(STUDENT_GROUPS, itemStats(bl, STUDENT_ITEMS.length))}`)}
  <div class="two">
    ${panel("ใบงานวิชาที่นักเรียนชอบมากที่สุด", countBars(fav, s.length), "ร้อยละของนักเรียนที่เลือก (เลือกได้หลายวิชา)")}
    ${panel("วิชาที่นักเรียนใช้ใบงาน", countBars(used, s.length))}
  </div>`;
}

function viewNotes(list) {
  const out = [];
  list.forEach(r => {
    const a = r.answers || {};
    const add = (kind, txt) => { if (txt && String(txt).trim()) out.push({ r, kind, txt: String(txt).trim() }); };
    add("ข้อเสนอแนะ", a.suggestion); add("ความพึงพอใจโดยรวม", a.satisfaction); add("ชอบเพราะ", a.favoriteReason);
    add("การใช้อื่น ๆ", a.useOther); add("การเก็บรักษาอื่น ๆ", a.storeOther);
  });
  const q = sub.q.trim();
  const shown = out.filter(o => !q || o.txt.includes(q) || o.r.schoolName.includes(q));
  return panel("ข้อเสนอแนะและความคิดเห็น", `
    <label class="f"><span>ค้นหาคำในข้อความหรือชื่อโรงเรียน</span><input type="search" id="noteQ" value="${esc(sub.q)}" placeholder="เช่น ตัวอักษร, การบ้าน, เฉลย"></label>
    <p class="hint">${nf(shown.length)} ข้อความ${shown.length > 300 ? " (แสดง 300 รายการแรก ดาวน์โหลด Excel เพื่อดูทั้งหมด)" : ""}</p>
    <div class="notes">${shown.slice(0, 300).map(o => `<div class="note"><p class="meta">${esc(ROLES[o.r.role]?.short)} · ${esc(o.kind)} · โรงเรียน${esc(o.r.schoolName)} จ.${esc(o.r.province)}</p><p>${esc(o.txt)}</p></div>`).join("") || `<p class="hint">ยังไม่มีข้อความ</p>`}</div>`);
}

function viewList(list) {
  const q = sub.list.trim();
  const sorted = list.filter(r => !q || r.schoolName.includes(q) || r.schoolCode.includes(q))
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
  return panel("รายการคำตอบ", `
    <label class="f"><span>ค้นหาชื่อหรือรหัสโรงเรียน</span><input type="search" id="listQ" value="${esc(sub.list)}"></label>
    <p class="hint">${nf(sorted.length)} รายการ${sorted.length > 500 ? " (แสดง 500 รายการล่าสุด)" : ""} · ลบได้เฉพาะคำตอบซ้ำหรือคำตอบทดสอบ การลบย้อนคืนไม่ได้</p>
    <div class="scroll"><table><thead><tr><th>เวลาส่ง</th><th>กลุ่ม</th><th>รหัส</th><th>โรงเรียน</th><th>จังหวัด</th><th>การจัดสรร</th><th></th></tr></thead><tbody>
    ${sorted.slice(0, 500).map(r => `<tr><td>${r.submittedAt ? new Date(r.submittedAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "–"}</td>
      <td>${esc(ROLES[r.role]?.short)}</td><td>${esc(r.schoolCode)}</td><td>${esc(r.schoolName)}</td><td>${esc(r.province)}</td>
      <td><span class="badge b-${r.allocation}">${esc(ALLOC[r.allocation])}</span></td>
      <td><button class="btn ghost small" data-del="${esc(r.id)}" type="button">ลบ</button></td></tr>`).join("")}
    </tbody></table></div>`);
}

function render() {
  const list = rows();
  $("#tabs").innerHTML = Object.entries(TABS).map(([k, l]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join("");
  const v = { overview: viewOverview, director: viewDirector, teacher: viewTeacher, student: viewStudent, notes: viewNotes, list: viewList }[tab];
  $("#view").innerHTML = v(list);
  $("#status").textContent = `แสดง ${nf(list.length)} จาก ${nf(all.length)} คำตอบ · ปีการศึกษา ${SURVEY.year}`;
}

// ---------- filters ----------
function fillFilters() {
  $("#fAlloc").innerHTML = [["", "ทุกกลุ่ม"], ...Object.entries(ALLOC)].map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
  const provs = [...new Set([...schools.map(s => s.province), ...all.map(r => r.province)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  $("#fProv").innerHTML = `<option value="">ทุกจังหวัด</option>` + provs.map(p => `<option ${p === F.prov ? "selected" : ""}>${esc(p)}</option>`).join("");
  fillAreas();
}
function fillAreas() {
  const areas = [...new Set(schools.filter(s => !F.prov || s.province === F.prov).map(s => s.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  if (!areas.includes(F.area)) F.area = "";
  $("#fArea").innerHTML = `<option value="">ทุกเขต</option>` + areas.map(a => `<option ${a === F.area ? "selected" : ""}>${esc(a)}</option>`).join("");
}
$("#fAlloc").onchange = e => { F.alloc = e.target.value; render(); };
$("#fProv").onchange = e => { F.prov = e.target.value; fillAreas(); render(); };
$("#fArea").onchange = e => { F.area = e.target.value; render(); };
$("#fType").onchange = e => { F.type = e.target.value; render(); };

document.addEventListener("change", e => {
  const id = e.target.id;
  if (["tSubj", "tGrade", "sSubj", "sGrade"].includes(id)) { sub[id] = e.target.value; render(); }
});
let qT;
document.addEventListener("input", e => {
  const id = e.target.id;
  if (id === "noteQ" || id === "listQ") {
    clearTimeout(qT);
    qT = setTimeout(() => { sub[id === "noteQ" ? "q" : "list"] = e.target.value; render(); const el = $("#" + id); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250);
  }
});
document.addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.tab) { tab = b.dataset.tab; render(); }
  if (b.dataset.del) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "ยืนยันลบ"; b.classList.add("danger"); b.classList.remove("ghost"); return; }
    b.disabled = true;
    try { await deleteResponse(b.dataset.del); all = all.filter(r => r.id !== b.dataset.del); render(); }
    catch (err) { b.textContent = "ลบไม่สำเร็จ"; console.error(err); }
  }
});

// ---------- export ----------
const base = r => ({
  "เลขอ้างอิง": r.id, "เวลาส่ง": r.submittedAt ? new Date(r.submittedAt).toLocaleString("th-TH") : "",
  "ปีการศึกษา": r.surveyYear, "รหัสโรงเรียน": r.schoolCode, "โรงเรียน": r.schoolName, "ตำบล": r.tambon, "อำเภอ": r.amphoe,
  "จังหวัด": r.province, "เขตพื้นที่": r.area, "การจัดสรร": ALLOC[r.allocation], "ประเภท": r.schoolType === "origin" ? "ต้นทาง/นอกรายชื่อ" : "ปลายทาง",
  "ต้นสังกัด": AFFILIATIONS[r.affiliation] || ""
});
const matrixText = m => Object.entries(m || {}).map(([k, v]) => `${SUBJECT_NAME[k]}: ${v.map(g => "ป." + g).join(",")}`).join(" | ");

function exportXlsx() {
  if (!window.XLSX) { $("#status").textContent = "โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่"; return; }
  const list = rows(), X = window.XLSX, wb = X.utils.book_new();
  const add = (name, data) => X.utils.book_append_sheet(wb, X.utils.json_to_sheet(data.length ? data : [{ "ไม่มีข้อมูล": "" }]), name);

  add("ผู้บริหาร", byRole(list, "director").map(r => { const a = r.answers || {}, c = a.coordinator || {}; return {
    ...base(r), "มีผอ./ครูใหญ่": a.hasDirector === "yes" ? "มี" : "ไม่มี", "รองผอ.": a.deputies, "ครูผู้สอน": a.teachersTotal, "ธุรการ": a.clerks,
    ...Object.fromEntries(MAJORS.map(([k, n]) => ["เอก" + n, a.majors?.[k] ?? ""])),
    "ผู้ประสานงาน": `${c.name || ""} ${c.surname || ""}`.trim(), "ตำแหน่ง": c.position, "มือถือ": c.mobile, "e-mail": c.email, "Line": c.line,
    "ลักษณะการใช้": DIRECTOR_USAGE[a.usage], "วิชา/ชั้นที่ใช้": matrixText(a.usageMatrix), "ข้อเสนอแนะ": a.suggestion }; }));

  add("ครู", byRole(list, "teacher").map(r => { const a = r.answers || {}; return {
    ...base(r), "วิชา/ชั้น": matrixText(a.teaching), "ลักษณะการใช้": (a.use || []).map(k => TEACHER_USE[k]).join(", "), "การใช้อื่นๆ": a.useOther,
    "การเก็บรักษา": TEACHER_STORE[a.store], "การเก็บอื่นๆ": a.storeOther, "ความพึงพอใจโดยรวม": a.satisfaction, "ข้อเสนอแนะ": a.suggestion }; }));
  add("ครู_คะแนนรายข้อ", blocks(list, "teacher").map(b => ({ "เลขอ้างอิง": b.r.id, "รหัสโรงเรียน": b.r.schoolCode, "โรงเรียน": b.r.schoolName, "จังหวัด": b.r.province,
    "การจัดสรร": ALLOC[b.r.allocation], "วิชา": SUBJECT_NAME[b.subj], "ชั้น": "ป." + b.grade,
    ...Object.fromEntries(b.vals.map((v, i) => ["ข้อ" + (i + 1), v])), "เฉลี่ย": +blockMean(b).toFixed(2) })));

  add("นักเรียน", byRole(list, "student").map(r => { const a = r.answers || {}; return {
    ...base(r), "ชั้น": "ป." + a.grade, "วิชาที่ใช้": (a.subjectsUsed || []).map(k => SUBJECT_NAME[k]).join(", "),
    "วิชาที่ชอบ": (a.favorites || []).map(k => SUBJECT_NAME[k]).join(", "), "ชอบเพราะ": a.favoriteReason, "ข้อเสนอแนะ": a.suggestion }; }));
  add("นักเรียน_คะแนนรายข้อ", blocks(list, "student").map(b => ({ "เลขอ้างอิง": b.r.id, "รหัสโรงเรียน": b.r.schoolCode, "โรงเรียน": b.r.schoolName, "จังหวัด": b.r.province,
    "การจัดสรร": ALLOC[b.r.allocation], "วิชา": SUBJECT_NAME[b.subj], "ชั้น": "ป." + b.grade,
    ...Object.fromEntries(b.vals.map((v, i) => ["ข้อ" + (i + 1), v])), "เฉลี่ย": +blockMean(b).toFixed(2) })));

  const summary = (items, bl, who) => SUBJECTS.flatMap(s => {
    const st = itemStats(bl.filter(b => b.subj === s.key), items.length);
    return items.map((it, i) => ({ "กลุ่ม": who, "วิชา": s.name, "ด้าน": it.group, "ข้อ": i + 1, "รายการ": it.text, "n": st[i].n,
      "ค่าเฉลี่ย": st[i].mean == null ? "" : +st[i].mean.toFixed(2), "S.D.": st[i].sd == null ? "" : +st[i].sd.toFixed(2), "ระดับ": level(st[i].mean) }));
  });
  add("สรุปรายข้อ", [...summary(TEACHER_ITEMS, blocks(list, "teacher"), "ครู"), ...summary(STUDENT_ITEMS, blocks(list, "student"), "นักเรียน")]);
  X.writeFile(wb, `ผลสำรวจใบงาน_${SURVEY.year}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportMissing() {
  if (!window.XLSX) return;
  const X = window.XLSX, wb = X.utils.book_new();
  const dirDone = new Set(byRole(all, "director").map(r => r.schoolCode));
  const anyDone = new Set(all.map(r => r.schoolCode));
  const data = schools.filter(matchSchool).filter(s => !dirDone.has(s.code)).map(s => ({
    "รหัสโรงเรียน": s.code, "โรงเรียน": s.name, "ตำบล": s.tambon, "อำเภอ": s.amphoe, "จังหวัด": s.province, "รหัสไปรษณีย์": s.zip,
    "โทรศัพท์": s.phone, "เขตพื้นที่": s.area, "การจัดสรร": ALLOC[s.alloc], "มีครู/นักเรียนตอบแล้ว": anyDone.has(s.code) ? "มี" : "ยังไม่มี" }));
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(data.length ? data : [{ "ทุกโรงเรียนตอบครบแล้ว": "" }]), "ผู้บริหารยังไม่ตอบ");
  X.writeFile(wb, `โรงเรียนที่ยังไม่ตอบ_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
$("#xlsx").onclick = exportXlsx;
$("#xlsxMissing").onclick = exportMissing;

// ---------- demo seed ----------
function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
function score(bias) { const r = Math.random() + bias; return r > 1.15 ? 5 : r > .55 ? 4 : r > .2 ? 3 : r > .08 ? 2 : 1; }
function seedDemo() {
  const out = [], pick = [];
  for (let i = 0; i < 45; i++) pick.push(rnd(schools));
  const bias = { thai: .25, eng: 0, math: .1, social: .2, sci: .15, comp: -.05 };
  const mk = (s, role, answers, k) => ({ id: `demo_${role}_${s.code}_${k}`, role, surveyYear: SURVEY.year, schoolType: "destination", allocation: s.alloc,
    affiliation: "obec", schoolCode: s.code, schoolName: s.name, tambon: s.tambon, amphoe: s.amphoe, province: s.province, zip: s.zip,
    phone: s.phone, area: s.area, answers, submittedAt: new Date(Date.now() - Math.random() * 12 * 864e5).toISOString(), demo: true });
  const notes = ["อยากให้เพิ่มเฉลยท้ายเล่มสำหรับครู", "ตัวอักษรบางหน้าเล็กเกินไปสำหรับ ป.1", "ใบงานคณิตศาสตร์มีจำนวนข้อมาก ทำไม่ทันในคาบ", "ภาพประกอบสวย นักเรียนชอบ", "ขอให้จัดส่งเล่มก่อนเปิดภาคเรียน", "", "", ""];
  new Set(pick).forEach(s => {
    if (Math.random() < .75) out.push(mk(s, "director", { hasDirector: Math.random() < .85 ? "yes" : "no", deputies: 0, teachersTotal: 3 + Math.floor(Math.random() * 6), clerks: Math.random() < .5 ? 1 : 0,
      majors: { thai: 1, math: Math.random() < .6 ? 1 : 0, early: 1 }, coordinator: { name: rnd(["สมศรี", "วิไล", "ประเสริฐ", "อนุชา"]), surname: rnd(["ใจดี", "แก้วมณี", "ศรีสุข"]), position: "ครู", mobile: "08" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0") },
      usage: rnd(["all", "all", "partial", "none"]), usageMatrix: { thai: [1, 2, 3], math: [1, 2] }, suggestion: rnd(notes) }, 0));
    for (let t = 0; t < 2; t++) {
      const subj = rnd(SUBJECTS).key, g = 1 + Math.floor(Math.random() * 6);
      out.push(mk(s, "teacher", { teaching: { [subj]: [g] }, use: [rnd(["class", "class", "homework"])], store: rnd(["classroom", "student"]),
        ratings: { [`${subj}_${g}`]: TEACHER_ITEMS.map(() => score(bias[subj])) }, satisfaction: rnd(["พึงพอใจมาก ใช้ง่าย", "", "ช่วยลดภาระการเตรียมสื่อ"]), suggestion: rnd(notes) }, t));
    }
    for (let k = 0; k < 4; k++) {
      const used = SUBJECTS.filter(() => Math.random() < .6).map(x => x.key); if (!used.length) used.push("thai");
      out.push(mk(s, "student", { grade: 4 + Math.floor(Math.random() * 3), subjectsUsed: used,
        ratings: Object.fromEntries(used.map(u => [u, STUDENT_ITEMS.map(() => score(bias[u] + .1))])), favorites: [rnd(used)],
        favoriteReason: rnd(["มีรูปภาพสวย", "ทำง่าย", "", "ได้ทำกิจกรรมกับเพื่อน"]), suggestion: rnd(["อยากให้มีเกมเพิ่ม", "", ""]) }, k));
    }
  });
  return out;
}

// ---------- boot ----------
async function load() {
  $("#status").textContent = "กำลังโหลดข้อมูล…";
  try { all = await fetchResponses(); }
  catch (e) { console.error(e); $("#status").textContent = "โหลดคำตอบไม่สำเร็จ ตรวจสอบว่าบัญชีนี้อยู่ในรายชื่อผู้ดูแล (admins) ของ Firestore"; return; }
  if (DEMO && !all.some(r => r.demo)) { all = [...all, ...seedDemo()]; demoReplace(all); }
  fillFilters(); render();
}

$("#sub").textContent = `${SURVEY.org} · ปีการศึกษา ${SURVEY.year}`;
$("#demoFlag").hidden = !DEMO;
$("#seed").onclick = () => { all = [...all.filter(r => !r.demo), ...seedDemo()]; demoReplace(all); render(); };
$("#wipe").onclick = () => { all = []; demoReplace([]); render(); };
$("#reload").onclick = load;
$("#logout").onclick = async () => { await signOut(); location.reload(); };
$("#logout").hidden = DEMO;
$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  $("#loginErr").hidden = true;
  try { await signIn($("#email").value.trim(), $("#pw").value); }
  catch { $("#loginErr").hidden = false; $("#loginErr").textContent = "อีเมลหรือรหัสผ่านไม่ถูกต้อง"; }
};

schools = await loadSchools().catch(() => []);
onAuth(async user => {
  if (!user) { $("#login").hidden = false; $("#dash").hidden = true; return; }
  if (!(await isAdmin(user))) {
    $("#login").hidden = false; $("#dash").hidden = true;
    $("#loginErr").hidden = false; $("#loginErr").textContent = `บัญชี ${user.email} ยังไม่ได้รับสิทธิ์ผู้ดูแลระบบ`;
    await signOut(); return;
  }
  $("#login").hidden = true; $("#dash").hidden = false;
  load();
});
