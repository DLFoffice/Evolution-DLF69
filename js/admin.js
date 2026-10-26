import { SURVEY } from "./config.js";
import { DEMO, fetchResponses, deleteResponse, onAuth, signIn, signOut, isAdmin, loadSchools, demoReplace } from "./store.js";
import {
  ROLES, SUBJECTS, SUBJECT_NAME, GRADES, STUDENT_GRADES, ALLOC, AFFILIATIONS, MAJORS, DIRECTOR_USAGE,
  TEACHER_USE, TEACHER_STORE, TEACHER_GROUPS, STUDENT_GROUPS, TEACHER_ITEMS, STUDENT_ITEMS, level,
  DELIVERY, ADEQUACY, ONE_TERM_COPING, ONE_TERM_NEED, IMPACT_SCALE, STUDENT_WANT, MANUAL_USE, MANUAL_ITEMS,
  THEMES, THEME_LABEL, themesOf
} from "./questions.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (x, d = 2) => (x == null || isNaN(x) ? "–" : x.toFixed(d));
const nf = n => Number(n || 0).toLocaleString("th-TH");
const pct = (a, b) => (b ? (a / b) * 100 : 0);

let all = [], schools = [];
const F = { alloc: "", prov: "", area: "", type: "" };
const sub = { tSubj: "", tGrade: "", sSubj: "", sGrade: "", q: "", list: "", thRole: "" };
let tab = "summary";
const TABS = { summary: "สรุปผลสำคัญ", overview: "ภาพรวม", compare: "เปรียบเทียบกลุ่มจัดสรร", oneterm: "ได้ใบงานภาคเรียนเดียว",
  themes: "ข้อเสนอแนะตามกลุ่ม", director: "ผู้บริหาร", teacher: "ครู", student: "นักเรียน", notes: "ค้นหาข้อความ", list: "รายการคำตอบ" };
const GROUPS = ["sem1", "sem2", "both", "origin"];

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


// =================== การวิเคราะห์ตามกลุ่ม ===================
const avg = arr => { const v = arr.filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
// ข้อมูลตามตัวกรองจังหวัด/เขต/ประเภท แต่ไม่กรองกลุ่มจัดสรร (ใช้เปรียบเทียบระหว่างกลุ่ม)
const rowsAllGroups = () => all.filter(r => (!F.prov || r.province === F.prov) && (!F.area || r.area === F.area) && (!F.type || r.schoolType === F.type));
const shownGroups = () => GROUPS.filter(g => !F.alloc || F.alloc === g);
const inGroup = (list, g) => list.filter(r => r.allocation === g);
const shareOf = (list, fn) => (list.length ? (list.filter(fn).length / list.length) * 100 : null);

function dimMeans(list, role) {
  const groups = role === "teacher" ? TEACHER_GROUPS : STUDENT_GROUPS;
  const st = itemStats(blocks(list, role), role === "teacher" ? TEACHER_ITEMS.length : STUDENT_ITEMS.length);
  let i = 0;
  return groups.map(g => { const m = avg(st.slice(i, i + g.items.length).map(x => x.mean)); i += g.items.length; return [g.title, m]; });
}
const overallMean = (list, role) => avg(blocks(list, role).map(blockMean));
const manualMean = list => avg(byRole(list, "teacher").flatMap(r => r.answers?.manual?.r || []));

function textsOf(list) {
  const out = [];
  for (const r of list) {
    const a = r.answers || {};
    const add = (kind, txt) => { if (txt && String(txt).trim()) out.push({ r, kind, txt: String(txt).trim(), themes: themesOf(txt) }); };
    add("ข้อเสนอแนะทั่วไป", a.suggestion); add("ความพึงพอใจ", a.satisfaction); add("ชอบเพราะ", a.favoriteReason);
    add("คู่มือครู/แผน", a.manual?.suggestion); add("การจัดสรรภาคเรียนเดียว", a.oneTerm?.suggestion);
    add("วิธีจัดการแทนใบงาน", a.oneTerm?.copingOther); add("การใช้อื่น ๆ", a.useOther); add("การเก็บรักษาอื่น ๆ", a.storeOther);
  }
  return out;
}
const lvCell = m => (m == null ? `<td class="n">–</td>` : `<td class="n">${fmt(m)} ${lvBadge(m)}</td>`);
const pctCell = v => `<td class="n">${v == null ? "–" : fmt(v, 0) + "%"}</td>`;
const quote = t => `<div class="note"><p class="meta">${esc(ROLES[t.r.role]?.short)} · ${esc(t.kind)} · โรงเรียน${esc(t.r.schoolName)} จ.${esc(t.r.province)}</p><p>${esc(t.txt)}</p></div>`;

function viewCompare() {
  const base = rowsAllGroups(), gs = shownGroups();
  const G = Object.fromEntries(gs.map(g => [g, inGroup(base, g)]));
  const row = (label, fn, cell = lvCell) => `<tr><td>${label}</td>${gs.map(g => cell(fn(G[g]))).join("")}</tr>`;
  const head = `<thead><tr><th>ตัวชี้วัด</th>${gs.map(g => `<th class="n"><span class="badge b-${g}">${esc(ALLOC[g])}</span></th>`).join("")}</tr></thead>`;
  const sec = t => `<tr class="grp"><td colspan="${gs.length + 1}">${t}</td></tr>`;
  const tDims = TEACHER_GROUPS.map((g, i) => row(`ครู · ${g.title}`, l => dimMeans(l, "teacher")[i][1])).join("");
  const sDims = STUDENT_GROUPS.map((g, i) => row(`นักเรียน · ${g.title}`, l => dimMeans(l, "student")[i][1])).join("");
  const subjRows = SUBJECTS.map(sj => row(`ครู · ${sj.name}`, l => avg(blocks(l, "teacher").filter(b => b.subj === sj.key).map(blockMean)))).join("");
  const num = v => `<td class="n">${v == null ? "–" : nf(v)}</td>`;
  return panel("เปรียบเทียบผลระหว่างกลุ่มการจัดสรร", `<div class="tbl-wrap"><table>${head}<tbody>
    ${sec("จำนวนผู้ตอบ")}
    ${row("โรงเรียนที่ตอบ", l => new Set(l.map(r => r.schoolCode)).size, num)}
    ${row("ผู้บริหาร", l => byRole(l, "director").length, num)}
    ${row("ครู", l => byRole(l, "teacher").length, num)}
    ${row("นักเรียน", l => byRole(l, "student").length, num)}
    ${sec("ความคิดเห็นต่อใบงาน (เต็ม 5)")}
    ${row("<b>ครู · ค่าเฉลี่ยรวม 20 ข้อ</b>", l => overallMean(l, "teacher"))}
    ${tDims}
    ${row("<b>นักเรียน · ค่าเฉลี่ยรวม 12 ข้อ</b>", l => overallMean(l, "student"))}
    ${sDims}
    ${row("ความพึงพอใจโดยรวม (ครู)", l => avg(byRole(l, "teacher").map(r => r.answers?.overall)))}
    ${row("ความพึงพอใจโดยรวม (นักเรียน)", l => avg(byRole(l, "student").map(r => r.answers?.overall)))}
    ${sec("รายวิชา (ความคิดเห็นครู)")}
    ${subjRows}
    ${sec("คู่มือครู / แผนการจัดการเรียนรู้")}
    ${row("ครูที่ใช้ทุกครั้งที่สอน", l => shareOf(byRole(l, "teacher").filter(r => r.answers?.manual?.use), r => r.answers.manual.use === "always"), pctCell)}
    ${row("ค่าเฉลี่ยความเหมาะสม 4 ข้อ", manualMean)}
    ${sec("การจัดส่ง (ผู้บริหาร)")}
    ${row("ได้รับก่อนเปิดภาคเรียน", l => shareOf(byRole(l, "director").filter(r => r.answers?.delivery), r => r.answers.delivery === "before"), pctCell)}
    ${row("ได้รับล่าช้ากว่า 2 สัปดาห์ / ยังไม่ได้รับ", l => shareOf(byRole(l, "director").filter(r => r.answers?.delivery), r => ["late", "none"].includes(r.answers.delivery)), pctCell)}
    ${row("ใบงานไม่เพียงพอ", l => shareOf(byRole(l, "director").filter(r => r.answers?.adequacy), r => r.answers.adequacy === "short"), pctCell)}
  </tbody></table></div>`, "คำนวณจากตัวกรองจังหวัด เขต และประเภทโรงเรียนที่เลือกไว้ ค่าที่ตอบน้อยกว่า 30 คนควรตีความอย่างระมัดระวัง");
}

function oneTermCard(list, g) {
  const t = g === "sem1" ? 2 : 1;
  const staff = list.filter(r => r.role !== "student" && r.answers?.oneTerm);
  const dirs = byRole(list, "director").filter(r => r.answers?.oneTerm);
  const studs = byRole(list, "student").filter(r => r.answers?.oneTerm?.want);
  const coping = Object.entries(ONE_TERM_COPING).map(([k, l]) => [l, staff.filter(r => (r.answers.oneTerm.coping || []).includes(k)).length]).sort((a, b) => b[1] - a[1]);
  const need = Object.entries(ONE_TERM_NEED).map(([k, l]) => [l, staff.filter(r => r.answers.oneTerm.need === k).length]);
  const prio = SUBJECTS.map(sj => [sj.name, staff.filter(r => (r.answers.oneTerm.priority || []).includes(sj.key)).length]).sort((a, b) => b[1] - a[1]);
  const want = Object.entries(STUDENT_WANT).map(([k, l]) => [l, studs.filter(r => r.answers.oneTerm.want === k).length]);
  const impact = avg(staff.map(r => r.answers.oneTerm.impact));
  const cost = avg(dirs.map(r => r.answers.oneTerm.cost).filter(x => x != null));
  const texts = textsOf(list).filter(x => x.kind === "การจัดสรรภาคเรียนเดียว" || x.themes.includes("alloc"));
  return `<section class="panel"><header><h2><span class="badge b-${g}" style="font-size:.9rem">${esc(ALLOC[g])}</span></h2>
      <p class="hint">ไม่ได้รับใบงานภาคเรียนที่ ${t} · ผู้บริหารและครูตอบ ${nf(staff.length)} คน · นักเรียน ${nf(studs.length)} คน</p></header>
    <div class="kpis">
      <div class="kpi"><span class="k">ผลกระทบต่อการเรียน</span><span class="v">${fmt(impact)}</span><span class="s">${impact == null ? "" : IMPACT_SCALE[lvNum(impact) - 1]} (เต็ม 5)</span></div>
      <div class="kpi"><span class="k">ต้องการทั้ง 2 ภาคเรียน</span><span class="v">${fmt(shareOf(staff, r => r.answers.oneTerm.need === "both"), 0)}%</span><span class="s">ของผู้บริหารและครู</span></div>
      <div class="kpi"><span class="k">ค่าใช้จ่ายแทนใบงาน</span><span class="v">${cost == null ? "–" : nf(Math.round(cost))}</span><span class="s">บาท/โรงเรียน/ภาคเรียน (เฉลี่ย)</span></div>
    </div>
    <div><h3 style="margin-bottom:8px">วิธีจัดการเรียนรู้ในภาคเรียนที่ไม่มีใบงาน</h3>${countBars(coping, staff.length)}</div>
    <div><h3 style="margin-bottom:8px">ความต้องการปีถัดไป</h3>${countBars(need, staff.length)}</div>
    <div><h3 style="margin-bottom:8px">วิชาที่ต้องการมากที่สุด</h3>${countBars(prio, staff.length)}</div>
    <div><h3 style="margin-bottom:8px">นักเรียนอยากมีใบงานทุกภาคเรียน</h3>${countBars(want, studs.length)}</div>
    <details><summary class="btn ghost small" style="display:inline-block">ข้อเสนอแนะเรื่องการจัดสรร (${nf(texts.length)})</summary>
      <div class="notes" style="margin-top:10px">${texts.slice(0, 200).map(quote).join("") || `<p class="hint">ยังไม่มีข้อความ</p>`}</div></details>
  </section>`;
}
function viewOneTerm() {
  const base = rowsAllGroups();
  const gs = ["sem1", "sem2"].filter(g => !F.alloc || F.alloc === g);
  if (!gs.length) return panel("ได้ใบงานภาคเรียนเดียว", `<p class="hint">ตัวกรองกลุ่มการจัดสรรตอนนี้ไม่ใช่กลุ่มภาคเรียนเดียว เปลี่ยนเป็น "ทุกกลุ่ม" เพื่อดูหน้านี้</p>`);
  const both = inGroup(base, "both");
  const cmp = `<div class="tbl-wrap"><table><thead><tr><th>ตัวชี้วัด</th>${[...gs, "both"].map(g => `<th class="n"><span class="badge b-${g}">${esc(ALLOC[g])}</span></th>`).join("")}</tr></thead><tbody>
    ${[["ครู · ค่าเฉลี่ยรวมต่อใบงาน", l => overallMean(l, "teacher")], ["นักเรียน · ค่าเฉลี่ยรวมต่อใบงาน", l => overallMean(l, "student")],
       ["ความพึงพอใจโดยรวม (ครู)", l => avg(byRole(l, "teacher").map(r => r.answers?.overall))],
       ["ความพึงพอใจโดยรวม (นักเรียน)", l => avg(byRole(l, "student").map(r => r.answers?.overall))]]
      .map(([lab, fn]) => `<tr><td>${lab}</td>${[...gs.map(g => inGroup(base, g)), both].map(l => lvCell(fn(l))).join("")}</tr>`).join("")}
  </tbody></table></div>`;
  return `${panel("เทียบกับโรงเรียนที่ได้รับทั้ง 2 ภาคเรียน", cmp, "ถ้ากลุ่มภาคเรียนเดียวมีค่าต่ำกว่ากลุ่มทั้ง 2 ภาคเรียนชัดเจน แสดงว่าความต่อเนื่องของใบงานมีผลต่อความพึงพอใจ")}
    <div class="two">${gs.map(g => oneTermCard(inGroup(base, g), g)).join("")}</div>`;
}

function viewThemes() {
  const base = rowsAllGroups().filter(r => !sub.thRole || r.role === sub.thRole), gs = shownGroups();
  const T = textsOf(base);
  const keys = [...THEMES.map(t => t.key), "other"];
  const byG = Object.fromEntries(gs.map(g => [g, T.filter(x => x.r.allocation === g)]));
  const cnt = (arr, k) => arr.filter(x => x.themes.includes(k)).length;
  const matrixRows = keys.map(k => `<tr><td>${esc(THEME_LABEL[k])}</td>${gs.map(g => { const c = cnt(byG[g], k); return `<td class="n">${c ? `${nf(c)} <small class="hint">(${fmt(pct(c, byG[g].length), 0)}%)</small>` : "·"}</td>`; }).join("")}<td class="n"><b>${nf(cnt(T, k))}</b></td></tr>`).join("");
  const groupPanels = gs.filter(g => byG[g].length).map(g => {
    const arr = byG[g];
    const ranked = keys.map(k => [k, cnt(arr, k)]).filter(([, c]) => c).sort((a, b) => b[1] - a[1]);
    return `<section class="panel"><header><h2><span class="badge b-${g}" style="font-size:.9rem">${esc(ALLOC[g])}</span></h2>
      <p class="hint">${nf(arr.length)} ข้อความ จาก ${["director", "teacher", "student"].map(r => `${ROLES[r].short} ${nf(arr.filter(x => x.r.role === r).length)}`).join(" · ")}</p></header>
      ${ranked.length ? hbars(ranked.map(([k, c]) => [THEME_LABEL[k], c, ""]), { max: Math.max(...ranked.map(x => x[1])), digits: 0, unit: "" }) : `<p class="hint">ยังไม่มีข้อเสนอแนะ</p>`}
      ${ranked.map(([k, c]) => `<details><summary class="link" style="cursor:pointer">${esc(THEME_LABEL[k])} (${nf(c)})</summary>
        <div class="notes" style="margin-top:8px">${arr.filter(x => x.themes.includes(k)).slice(0, 60).map(quote).join("")}</div></details>`).join("")}
    </section>`;
  }).join("");
  return `${panel("ประเด็นข้อเสนอแนะ แยกตามกลุ่มการจัดสรร", `
    <div class="toolbar"><label class="f"><span>กลุ่มผู้ตอบ</span>${sel("thRole", [["", "ทุกกลุ่มผู้ตอบ"], ...Object.entries(ROLES).map(([k, r]) => [k, r.label])], sub.thRole)}</label></div>
    <div class="tbl-wrap"><table><thead><tr><th>ประเด็น</th>${gs.map(g => `<th class="n"><span class="badge b-${g}">${esc(ALLOC[g])}</span></th>`).join("")}<th class="n">รวม</th></tr></thead><tbody>${matrixRows}</tbody></table></div>`,
    "จัดกลุ่มอัตโนมัติจากคำสำคัญในข้อความ 1 ข้อความอาจอยู่ได้หลายประเด็น ควรอ่านข้อความจริงประกอบก่อนสรุป")}
    <div class="two">${groupPanels}</div>`;
}

function viewSummary() {
  const base = rowsAllGroups(), list = rows();
  const B = [];
  const add = (sec, txt) => B.push([sec, txt]);
  const t = byRole(list, "teacher"), s = byRole(list, "student"), d = byRole(list, "director");
  if (!list.length) return panel("สรุปผลสำคัญ", `<p class="hint">ยังไม่มีคำตอบในตัวกรองที่เลือก</p>`);
  const sch = schools.filter(matchSchool), answered = new Set(list.map(r => r.schoolCode));
  add("ภาพรวมการตอบ", `มีผู้ตอบ ${nf(list.length)} คน (ผู้บริหาร ${nf(d.length)} · ครู ${nf(t.length)} · นักเรียน ${nf(s.length)}) จาก ${nf(answered.size)} โรงเรียน คิดเป็น ${fmt(pct(sch.filter(x => answered.has(x.code)).length, sch.length), 1)}% ของโรงเรียนในรายชื่อ`);
  GROUPS.forEach(g => { const l = inGroup(list, g); if (l.length) add("ภาพรวมการตอบ", `${ALLOC[g]}: ${nf(new Set(l.map(r => r.schoolCode)).size)} โรงเรียน ${nf(l.length)} คน`); });

  const tSt = itemStats(blocks(list, "teacher"), TEACHER_ITEMS.length).map((x, i) => ({ ...x, i, text: TEACHER_ITEMS[i].text })).filter(x => x.n);
  const sSt = itemStats(blocks(list, "student"), STUDENT_ITEMS.length).map((x, i) => ({ ...x, i, text: STUDENT_ITEMS[i].text })).filter(x => x.n);
  if (tSt.length) {
    const sorted = [...tSt].sort((a, b) => b.mean - a.mean);
    add("จุดแข็งของใบงาน", `ครูให้คะแนนรวม ${fmt(overallMean(list, "teacher"))} (${level(overallMean(list, "teacher"))}) ข้อที่สูงสุดคือ ${sorted.slice(0, 3).map(x => `ข้อ ${x.i + 1} "${x.text}" (${fmt(x.mean)})`).join(", ")}`);
    add("จุดที่ควรพัฒนา", `ข้อที่ครูให้คะแนนต่ำสุดคือ ${sorted.slice(-3).reverse().map(x => `ข้อ ${x.i + 1} "${x.text}" (${fmt(x.mean)})`).join(", ")}`);
    const dims = dimMeans(list, "teacher").filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
    if (dims.length) add("จุดที่ควรพัฒนา", `ด้านที่ครูให้คะแนนต่ำสุดคือ "${dims[0][0]}" (${fmt(dims[0][1])})`);
    const subj = SUBJECTS.map(sj => [sj.name, avg(blocks(list, "teacher").filter(b => b.subj === sj.key).map(blockMean))]).filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
    if (subj.length > 1) add("จุดที่ควรพัฒนา", `วิชาที่ครูให้คะแนนต่ำสุดคือ ${subj[0][0]} (${fmt(subj[0][1])}) สูงสุดคือ ${subj.at(-1)[0]} (${fmt(subj.at(-1)[1])})`);
  }
  if (sSt.length) {
    const sorted = [...sSt].sort((a, b) => b.mean - a.mean);
    add("มุมมองนักเรียน", `นักเรียนพึงพอใจรวม ${fmt(overallMean(list, "student"))} ข้อที่ชอบที่สุดคือ "${sorted[0].text}" (${fmt(sorted[0].mean)}) ข้อที่ต่ำสุดคือ "${sorted.at(-1).text}" (${fmt(sorted.at(-1).mean)})`);
    const fav = SUBJECTS.map(x => [x.name, s.filter(r => (r.answers?.favorites || []).includes(x.key)).length]).sort((a, b) => b[1] - a[1]);
    if (fav[0][1]) add("มุมมองนักเรียน", `ใบงานวิชาที่นักเรียนชอบมากที่สุดคือ ${fav[0][0]} (${fmt(pct(fav[0][1], s.length), 0)}% ของนักเรียน)`);
  }
  const gm = shownGroups().map(g => [g, overallMean(inGroup(base, g), "teacher"), overallMean(inGroup(base, g), "student")]).filter(x => x[1] != null || x[2] != null);
  if (gm.length > 1) {
    add("เปรียบเทียบกลุ่มจัดสรร", gm.map(([g, tm, sm]) => `${ALLOC[g]}: ครู ${fmt(tm)} · นักเรียน ${fmt(sm)}`).join(" | "));
    const tv = gm.filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
    if (tv.length > 1) add("เปรียบเทียบกลุ่มจัดสรร", `กลุ่มที่ครูให้คะแนนต่ำสุดคือ ${ALLOC[tv[0][0]]} ต่างจากกลุ่มสูงสุด (${ALLOC[tv.at(-1)[0]]}) ${fmt(tv.at(-1)[1] - tv[0][1])} คะแนน`);
  }
  ["sem1", "sem2"].filter(g => !F.alloc || F.alloc === g).forEach(g => {
    const staff = inGroup(base, g).filter(r => r.role !== "student" && r.answers?.oneTerm);
    if (!staff.length) return;
    const top = Object.entries(ONE_TERM_COPING).map(([k, l]) => [l, staff.filter(r => (r.answers.oneTerm.coping || []).includes(k)).length]).sort((a, b) => b[1] - a[1])[0];
    const cost = avg(byRole(staff, "director").map(r => r.answers.oneTerm.cost).filter(x => x != null));
    add("โรงเรียนที่ได้ภาคเรียนเดียว", `${ALLOC[g]} (ขาดภาคเรียนที่ ${g === "sem1" ? 2 : 1}): ผู้บริหารและครู ${fmt(shareOf(staff, r => r.answers.oneTerm.need === "both"), 0)}% ต้องการใบงานทั้ง 2 ภาคเรียน · ผลกระทบเฉลี่ย ${fmt(avg(staff.map(r => r.answers.oneTerm.impact)))}/5 · วิธีที่ใช้แทนมากที่สุดคือ "${top[0]}" (${fmt(pct(top[1], staff.length), 0)}%)${cost != null ? ` · ค่าใช้จ่ายเฉลี่ย ${nf(Math.round(cost))} บาท/โรงเรียน` : ""}`);
  });
  const dd = d.filter(r => r.answers?.delivery);
  if (dd.length) add("การจัดส่ง", `ได้รับใบงานก่อนเปิดภาคเรียน ${fmt(shareOf(dd, r => r.answers.delivery === "before"), 0)}% · ล่าช้ากว่า 2 สัปดาห์หรือยังไม่ได้รับ ${fmt(shareOf(dd, r => ["late", "none"].includes(r.answers.delivery)), 0)}% · ใบงานไม่เพียงพอ ${fmt(shareOf(d.filter(r => r.answers?.adequacy), r => r.answers.adequacy === "short"), 0)}%`);
  const tm = t.filter(r => r.answers?.manual?.use);
  if (tm.length) {
    const ms = MANUAL_ITEMS.map((x, i) => [x, avg(tm.map(r => r.answers.manual.r?.[i]))]).filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
    add("คู่มือครูและแผนการจัดการเรียนรู้", `ครูใช้ทุกครั้งที่สอน ${fmt(shareOf(tm, r => r.answers.manual.use === "always"), 0)}% · ไม่ค่อยได้ใช้ ${fmt(shareOf(tm, r => r.answers.manual.use === "rarely"), 0)}%${ms.length ? ` · ข้อที่ต่ำสุดคือ "${ms[0][0]}" (${fmt(ms[0][1])})` : ""}`);
  }
  const T = textsOf(list);
  if (T.length) {
    const ranked = [...THEMES.map(x => x.key), "other"].map(k => [k, T.filter(x => x.themes.includes(k)).length]).filter(x => x[1] && x[0] !== "praise" && x[0] !== "other").sort((a, b) => b[1] - a[1]);
    add("ข้อเสนอแนะ", `มีข้อความทั้งหมด ${nf(T.length)} ข้อความ ประเด็นที่พูดถึงมากที่สุดคือ ${ranked.slice(0, 3).map(([k, c]) => `${THEME_LABEL[k]} (${nf(c)})`).join(", ") || "–"}`);
    shownGroups().forEach(g => {
      const arr = T.filter(x => x.r.allocation === g); if (!arr.length) return;
      const top = THEMES.map(x => [x.key, arr.filter(y => y.themes.includes(x.key)).length]).filter(x => x[0] !== "praise" && x[1]).sort((a, b) => b[1] - a[1])[0];
      if (top) add("ข้อเสนอแนะ", `${ALLOC[g]}: พูดถึง "${THEME_LABEL[top[0]]}" มากที่สุด (${nf(top[1])} จาก ${nf(arr.length)} ข้อความ)`);
    });
  }
  const secs = [...new Set(B.map(b => b[0]))];
  return panel("สรุปผลสำคัญ", `<div style="display:grid;gap:16px">${secs.map(sc => `<div><h3 style="margin-bottom:6px">${esc(sc)}</h3><ul style="margin:0;padding-left:1.2rem;display:grid;gap:4px">${B.filter(b => b[0] === sc).map(b => `<li>${esc(b[1])}</li>`).join("")}</ul></div>`).join("")}</div>`,
    "สรุปอัตโนมัติจากข้อมูลตามตัวกรองที่เลือก ใช้เป็นจุดตั้งต้นของรายงาน และควรตรวจกับตารางรายละเอียดในแท็บอื่น");
}

function render() {
  const list = rows();
  $("#tabs").innerHTML = Object.entries(TABS).map(([k, l]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join("");
  const v = { summary: viewSummary, overview: viewOverview, compare: viewCompare, oneterm: viewOneTerm, themes: viewThemes,
    director: viewDirector, teacher: viewTeacher, student: viewStudent, notes: viewNotes, list: viewList }[tab];
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
  if (["tSubj", "tGrade", "sSubj", "sGrade", "thRole"].includes(id)) { sub[id] = e.target.value; render(); }
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
    "ลักษณะการใช้": DIRECTOR_USAGE[a.usage], "วิชา/ชั้นที่ใช้": matrixText(a.usageMatrix), "จำนวนนักเรียน": a.students ?? "",
    "การได้รับใบงาน": DELIVERY[a.delivery] || "", "ความเพียงพอ": ADEQUACY[a.adequacy] || "", "ขาด(เล่ม)": a.shortBy ?? "", "ข้อเสนอแนะ": a.suggestion }; }));

  add("ครู", byRole(list, "teacher").map(r => { const a = r.answers || {}; return {
    ...base(r), "วิชา/ชั้น": matrixText(a.teaching), "ลักษณะการใช้": (a.use || []).map(k => TEACHER_USE[k]).join(", "), "การใช้อื่นๆ": a.useOther,
    "การเก็บรักษา": TEACHER_STORE[a.store], "การเก็บอื่นๆ": a.storeOther, "พึงพอใจโดยรวม(1-5)": a.overall ?? "", "ความพึงพอใจโดยรวม": a.satisfaction,
    "ใช้คู่มือครู/แผน": MANUAL_USE[a.manual?.use] || "", ...Object.fromEntries(MANUAL_ITEMS.map((_, i) => ["คู่มือข้อ" + (i + 1), a.manual?.r?.[i] ?? ""])),
    "ข้อเสนอแนะคู่มือ/แผน": a.manual?.suggestion, "ข้อเสนอแนะ": a.suggestion }; }));
  add("ครู_คะแนนรายข้อ", blocks(list, "teacher").map(b => ({ "เลขอ้างอิง": b.r.id, "รหัสโรงเรียน": b.r.schoolCode, "โรงเรียน": b.r.schoolName, "จังหวัด": b.r.province,
    "การจัดสรร": ALLOC[b.r.allocation], "วิชา": SUBJECT_NAME[b.subj], "ชั้น": "ป." + b.grade,
    ...Object.fromEntries(b.vals.map((v, i) => ["ข้อ" + (i + 1), v])), "เฉลี่ย": +blockMean(b).toFixed(2) })));

  add("นักเรียน", byRole(list, "student").map(r => { const a = r.answers || {}; return {
    ...base(r), "ชั้น": "ป." + a.grade, "วิชาที่ใช้": (a.subjectsUsed || []).map(k => SUBJECT_NAME[k]).join(", "),
    "วิชาที่ชอบ": (a.favorites || []).map(k => SUBJECT_NAME[k]).join(", "), "ชอบเพราะ": a.favoriteReason, "พึงพอใจโดยรวม(1-5)": a.overall ?? "", "ข้อเสนอแนะ": a.suggestion }; }));
  add("นักเรียน_คะแนนรายข้อ", blocks(list, "student").map(b => ({ "เลขอ้างอิง": b.r.id, "รหัสโรงเรียน": b.r.schoolCode, "โรงเรียน": b.r.schoolName, "จังหวัด": b.r.province,
    "การจัดสรร": ALLOC[b.r.allocation], "วิชา": SUBJECT_NAME[b.subj], "ชั้น": "ป." + b.grade,
    ...Object.fromEntries(b.vals.map((v, i) => ["ข้อ" + (i + 1), v])), "เฉลี่ย": +blockMean(b).toFixed(2) })));

  const summary = (items, bl, who) => SUBJECTS.flatMap(s => {
    const st = itemStats(bl.filter(b => b.subj === s.key), items.length);
    return items.map((it, i) => ({ "กลุ่ม": who, "วิชา": s.name, "ด้าน": it.group, "ข้อ": i + 1, "รายการ": it.text, "n": st[i].n,
      "ค่าเฉลี่ย": st[i].mean == null ? "" : +st[i].mean.toFixed(2), "S.D.": st[i].sd == null ? "" : +st[i].sd.toFixed(2), "ระดับ": level(st[i].mean) }));
  });
  add("สรุปรายข้อ", [...summary(TEACHER_ITEMS, blocks(list, "teacher"), "ครู"), ...summary(STUDENT_ITEMS, blocks(list, "student"), "นักเรียน")]);
  add("ข้อเสนอแนะ_จัดกลุ่ม", textsOf(list).map(x => ({ "กลุ่มการจัดสรร": ALLOC[x.r.allocation], "กลุ่มผู้ตอบ": ROLES[x.r.role]?.short, "ประเภทข้อความ": x.kind,
    "ประเด็น": x.themes.map(k => THEME_LABEL[k]).join(", "), "ข้อความ": x.txt, "รหัสโรงเรียน": x.r.schoolCode, "โรงเรียน": x.r.schoolName, "จังหวัด": x.r.province })));
  add("ภาคเรียนเดียว", list.filter(r => r.answers?.oneTerm).map(r => { const o = r.answers.oneTerm; return {
    "กลุ่มการจัดสรร": ALLOC[r.allocation], "กลุ่มผู้ตอบ": ROLES[r.role]?.short, "รหัสโรงเรียน": r.schoolCode, "โรงเรียน": r.schoolName, "จังหวัด": r.province,
    "วิธีจัดการแทนใบงาน": (o.coping || []).map(k => ONE_TERM_COPING[k]).join(", "), "วิธีอื่นๆ": o.copingOther, "ค่าใช้จ่าย(บาท)": o.cost ?? "",
    "ผลกระทบ(1-5)": o.impact ?? "", "ความต้องการ": ONE_TERM_NEED[o.need] || "", "วิชาที่ต้องการ": (o.priority || []).map(k => SUBJECT_NAME[k]).join(", "),
    "นักเรียนอยากมีทุกภาค": STUDENT_WANT[o.want] || "", "ข้อเสนอแนะ": o.suggestion }; }));
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
  const out = [];
  const byAlloc = g => schools.filter(x => x.alloc === g);
  const pick = [...Array(14)].map(() => rnd(byAlloc("sem1"))).concat([...Array(14)].map(() => rnd(byAlloc("sem2"))), [...Array(18)].map(() => rnd(byAlloc("both"))));
  const bias = { thai: .25, eng: 0, math: .1, social: .2, sci: .15, comp: -.05 };
  const gBias = { sem1: -.12, sem2: -.18, both: .05 };
  const mk = (s, role, answers, k) => ({ id: `demo_${role}_${s.code}_${k}`, role, surveyYear: SURVEY.year, schoolType: "destination", allocation: s.alloc,
    affiliation: "obec", schoolCode: s.code, schoolName: s.name, tambon: s.tambon, amphoe: s.amphoe, province: s.province, zip: s.zip,
    phone: s.phone, area: s.area, answers, submittedAt: new Date(Date.now() - Math.random() * 12 * 864e5).toISOString(), demo: true });
  const notes = ["อยากให้เพิ่มเฉลยท้ายเล่มสำหรับครู", "ตัวอักษรบางหน้าเล็กเกินไปสำหรับ ป.1", "ใบงานคณิตศาสตร์มีจำนวนข้อมาก ทำไม่ทันในคาบ", "ภาพประกอบสวย นักเรียนชอบมาก",
    "ขอให้จัดส่งเล่มก่อนเปิดภาคเรียน ปีนี้ได้รับล่าช้า", "เนื้อหาภาษาอังกฤษ ป.4 ค่อนข้างยาก", "", "", ""];
  const oneNotes = ["อยากได้รับทั้ง 2 ภาคเรียน เพราะการเรียนไม่ต่อเนื่อง", "ภาคเรียนที่ไม่ได้รับต้องถ่ายเอกสารเอง ค่าใช้จ่ายสูง", "ถ้าให้ได้ไม่ครบ ขอวิชาคณิตศาสตร์และภาษาไทยก่อน",
    "ขอไฟล์ต้นฉบับให้โรงเรียนพิมพ์เองก็ได้", "นักเรียนถามหาใบงานในเทอมที่ไม่มี", ""];
  const one = (s, role) => s.alloc === "both" ? undefined : role === "student" ? { want: rnd(["yes", "yes", "yes", "either", "no"]) } : {
    coping: [rnd(["print", "print", "book", "notebook", "nothing", "buy"])], impact: rnd([3, 4, 4, 5, 5]), need: rnd(["both", "both", "both", "some", "file", "enough"]),
    priority: [rnd(["math", "thai", "eng"]), rnd(["thai", "sci"])], suggestion: rnd(oneNotes), ...(role === "director" ? { cost: rnd([0, 1500, 3000, 4500, 8000]) } : {}) };
  new Set(pick).forEach(s => {
    const gb = gBias[s.alloc] || 0;
    if (Math.random() < .75) out.push(mk(s, "director", { hasDirector: Math.random() < .85 ? "yes" : "no", deputies: 0, teachersTotal: 3 + Math.floor(Math.random() * 6), clerks: Math.random() < .5 ? 1 : 0,
      majors: { thai: 1, math: Math.random() < .6 ? 1 : 0, early: 1 }, coordinator: { name: rnd(["สมศรี", "วิไล", "ประเสริฐ", "อนุชา"]), surname: rnd(["ใจดี", "แก้วมณี", "ศรีสุข"]), position: "ครู", mobile: "08" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0") },
      usage: rnd(["all", "all", "partial", "none"]), usageMatrix: { thai: [1, 2, 3], math: [1, 2] }, students: 30 + Math.floor(Math.random() * 90),
      delivery: rnd(["before", "before", "week2", "late"]), adequacy: rnd(["enough", "enough", "short"]), oneTerm: one(s, "director"), suggestion: rnd(notes) }, 0));
    for (let t = 0; t < 2; t++) {
      const subj = rnd(SUBJECTS).key, g = 1 + Math.floor(Math.random() * 6);
      const mu = rnd(["always", "always", "sometimes", "rarely"]);
      out.push(mk(s, "teacher", { teaching: { [subj]: [g] }, use: [rnd(["class", "class", "homework"])], store: rnd(["classroom", "student"]),
        ratings: { [`${subj}_${g}`]: TEACHER_ITEMS.map(() => score(bias[subj] + gb)) }, overall: score(.15 + gb), satisfaction: rnd(["พึงพอใจมาก ใช้ง่าย", "", "ช่วยลดภาระการเตรียมสื่อ"]),
        manual: { use: mu, ...(mu === "rarely" ? {} : { r: MANUAL_ITEMS.map(() => score(0)) }), suggestion: rnd(["อยากให้แผนระบุเวลาให้ตรงกับคาบจริง", "", "ขอแนวทางวัดผลที่ง่ายขึ้น"]) },
        oneTerm: one(s, "teacher"), suggestion: rnd(notes) }, t));
    }
    for (let k = 0; k < 4; k++) {
      const used = SUBJECTS.filter(() => Math.random() < .6).map(x => x.key); if (!used.length) used.push("thai");
      out.push(mk(s, "student", { grade: 4 + Math.floor(Math.random() * 3), subjectsUsed: used,
        ratings: Object.fromEntries(used.map(u => [u, STUDENT_ITEMS.map(() => score(bias[u] + .1 + gb))])), overall: score(.2 + gb), favorites: [rnd(used)],
        favoriteReason: rnd(["มีรูปภาพสวย", "ทำง่าย", "", "ได้ทำกิจกรรมกลุ่มกับเพื่อน"]), oneTerm: one(s, "student"), suggestion: rnd(["อยากให้มีเกมเพิ่ม", "", ""]) }, k));
    }
  });
  return out.map(r => { if (r.answers.oneTerm === undefined) delete r.answers.oneTerm; return r; });
}

// ---------- boot ----------
async function load() {
  $("#status").textContent = "กำลังโหลดข้อมูล…";
  try { all = await fetchResponses(); }
  catch (e) { console.error(e); $("#status").textContent = "โหลดคำตอบไม่สำเร็จ ตรวจสอบว่าบัญชีนี้อยู่ในรายชื่อผู้ดูแล (admins) ของ Firestore"; return; }
  if (DEMO && (!all.some(r => r.demo) || !all.some(r => r.demo && r.answers?.overall))) { all = all.filter(r => !r.demo); all = [...all, ...seedDemo()]; demoReplace(all); }
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
