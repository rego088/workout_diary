'use strict';

/* =========================================================
   Workout Diary — all data lives in localStorage on this device.
   ========================================================= */

const STORAGE_KEY = 'workoutDiary.v1';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ICS_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const TYPES = ['strength', 'cardio', 'mobility'];

const PRESETS = [
  { name: 'Push-ups', type: 'strength', mode: 'reps', sets: 3, reps: 10, minutes: 8 },
  { name: 'Squats', type: 'strength', mode: 'reps', sets: 3, reps: 12, minutes: 8 },
  { name: 'Plank', type: 'strength', mode: 'time', sets: 3, amount: 30, unit: 's', minutes: 5 },
  { name: 'Running', type: 'cardio', mode: 'time', sets: 1, amount: 25, unit: 'min', minutes: 25 },
  { name: 'Cycling', type: 'cardio', mode: 'time', sets: 1, amount: 30, unit: 'min', minutes: 30 },
  { name: 'Lunges', type: 'strength', mode: 'reps', sets: 3, reps: 10, minutes: 8 },
  { name: 'Glute bridges', type: 'strength', mode: 'reps', sets: 3, reps: 12, minutes: 6 },
  { name: 'Brisk walk', type: 'cardio', mode: 'time', sets: 1, amount: 30, unit: 'min', minutes: 30 },
  { name: 'Stretching', type: 'mobility', mode: 'time', sets: 1, amount: 10, unit: 'min', minutes: 10 },
];

/* ---------- Helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayIndex = (d) => (d.getDay() + 6) % 7; // 0 = Monday
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const fmtKg = (n) => `${(Math.round(n * 10) / 10).toFixed(1)} kg`;
const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  parseISO(s).toLocaleDateString(undefined, opts);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- State ---------- */

function defaultState() {
  return {
    version: 1,
    createdAt: isoDate(new Date()),
    profile: { height: null, weight: null, goal: null },
    weights: [],                 // [{ date: 'YYYY-MM-DD', kg }]
    plan: [[], [], [], [], [], [], []], // index 0 = Monday
    done: {},                    // { 'YYYY-MM-DD': { ids: [...], total: n } }
    custom: [],                  // user-defined exercise presets
    settings: { theme: 'system', suggestTime: '18:00', alertMinutes: 0 },
  };
}

function cleanWorkout(w) {
  if (!w || typeof w !== 'object' || !String(w.name || '').trim()) return null;
  return {
    id: typeof w.id === 'string' && w.id ? w.id.slice(0, 40) : uid(),
    name: String(w.name).trim().slice(0, 60),
    type: TYPES.includes(w.type) ? w.type : 'strength',
    mode: w.mode === 'time' ? 'time' : 'reps',
    sets: clamp(Math.round(num(w.sets) || 1), 1, 20),
    reps: clamp(Math.round(num(w.reps) || 10), 1, 200),
    amount: clamp(Math.round(num(w.amount) || 30), 1, 600),
    unit: w.unit === 'min' ? 'min' : 's',
    minutes: clamp(Math.round(num(w.minutes) || 10), 1, 300),
    time: /^\d{2}:\d{2}$/.test(w.time) ? w.time : '18:00',
  };
}

/** Accepts anything (e.g. an imported file) and returns a valid state object. */
function normalize(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return s;
  if (typeof raw.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.createdAt)) s.createdAt = raw.createdAt;
  const p = raw.profile || {};
  s.profile = { height: num(p.height), weight: num(p.weight), goal: num(p.goal) };
  if (Array.isArray(raw.weights)) {
    const byDate = new Map();
    for (const w of raw.weights) {
      if (w && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && num(w.kg)) byDate.set(w.date, { date: w.date, kg: num(w.kg) });
    }
    s.weights = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  if (Array.isArray(raw.plan)) {
    s.plan = DAYS.map((_, i) => (Array.isArray(raw.plan[i]) ? raw.plan[i].map(cleanWorkout).filter(Boolean) : []));
  }
  if (raw.done && typeof raw.done === 'object') {
    for (const [date, rec] of Object.entries(raw.done)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !rec) continue;
      const ids = Array.isArray(rec.ids) ? rec.ids.filter((x) => typeof x === 'string') : [];
      s.done[date] = { ids, total: Math.max(0, Math.round(num(rec.total) || 0)) };
    }
  }
  if (Array.isArray(raw.custom)) s.custom = raw.custom.map(cleanWorkout).filter(Boolean).slice(0, 50);
  const st = raw.settings || {};
  if (['system', 'light', 'dark'].includes(st.theme)) s.settings.theme = st.theme;
  if (/^\d{2}:\d{2}$/.test(st.suggestTime)) s.settings.suggestTime = st.suggestTime;
  if ([0, 10, 30, 60].includes(st.alertMinutes)) s.settings.alertMinutes = st.alertMinutes;
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save — storage is full or blocked');
  }
}

/* ---------- Domain logic ---------- */

function sortByTime(list) {
  return [...list].sort((a, b) => a.time.localeCompare(b.time)); // stable: keeps circuit order
}

function describe(w) {
  if (w.mode === 'time' && w.sets === 1 && w.unit === 'min' && w.amount === w.minutes) return `${w.minutes} min`;
  const reps = w.mode === 'reps'
    ? `${w.sets} × ${w.reps} reps`
    : (w.sets > 1 ? `${w.sets} × ` : '') + `${w.amount} ${w.unit === 'min' ? 'min' : 's'}`;
  return `${reps} · ${w.minutes} min`;
}

function bmiInfo() {
  const { height, weight } = state.profile;
  if (!height || !weight) return null;
  const bmi = weight / (height / 100) ** 2;
  let category = 'Healthy range';
  if (bmi < 18.5) category = 'Underweight';
  else if (bmi >= 30) category = 'Obese range';
  else if (bmi >= 25) category = 'Overweight';
  return { bmi, category };
}

function goalDirection() {
  const { weight, goal } = state.profile;
  if (!weight || !goal) return 'maintain';
  if (goal < weight - 0.5) return 'lose';
  if (goal > weight + 0.5) return 'gain';
  return 'maintain';
}

/** Done-record for a date: past days keep the total snapshotted when they were ticked. */
function dayStatus(dateStr) {
  const d = parseISO(dateStr);
  const planned = state.plan[dayIndex(d)];
  const rec = state.done[dateStr];
  const isToday = dateStr === isoDate(new Date());
  if (isToday || !rec) {
    const ids = new Set(rec ? rec.ids : []);
    const done = planned.filter((w) => ids.has(w.id)).length;
    return { total: planned.length, done, minutesPlanned: sum(planned), minutesDone: sum(planned.filter((w) => ids.has(w.id))) };
  }
  const ids = new Set(rec.ids);
  const doneItems = planned.filter((w) => ids.has(w.id));
  return {
    total: rec.total,
    done: Math.min(rec.ids.length, rec.total),
    minutesPlanned: sum(planned),
    minutesDone: sum(doneItems),
  };
}

function sum(list) { return list.reduce((a, w) => a + w.minutes, 0); }

/** Consecutive planned days fully completed. Rest days don't break the streak; an unfinished today doesn't either. */
function streak() {
  const today = new Date();
  const start = parseISO(state.createdAt);
  let count = 0;
  for (let i = 0; i < 730; i++) {
    const d = addDays(today, -i);
    if (d < start && i > 0) break;
    const st = dayStatus(isoDate(d));
    if (st.total === 0) continue;
    if (st.done >= st.total) count++;
    else if (i === 0) continue;
    else break;
  }
  return count;
}

function toggleDone(workoutId) {
  const key = isoDate(new Date());
  const planned = state.plan[dayIndex(new Date())];
  const rec = state.done[key] || { ids: [], total: 0 };
  const ids = new Set(rec.ids.filter((id) => planned.some((w) => w.id === id)));
  ids.has(workoutId) ? ids.delete(workoutId) : ids.add(workoutId);
  state.done[key] = { ids: [...ids], total: planned.length };
  save();
  renderToday();
  if (ids.size === planned.length && planned.length) toast('All done for today — nice work! 💪');
}

function logWeight(date, kg) {
  state.weights = state.weights.filter((w) => w.date !== date);
  state.weights.push({ date, kg });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  // The latest entry is the current weight.
  state.profile.weight = state.weights[state.weights.length - 1].kg;
  save();
}

/* ---------- Suggest my week (rule based) ---------- */

function suggestPlan(time) {
  const info = bmiInfo();
  const bmi = info ? info.bmi : 24;
  const dir = goalDirection();
  const lowImpact = bmi >= 30;
  const make = (p) => cleanWorkout({ ...p, time });

  // Rule 1: number of sessions and which days (alternating cardio / strength, rest days between).
  let schedule;
  if (dir === 'lose') schedule = [[0, 'cardio'], [1, 'strength'], [3, 'cardio'], [5, 'strength']]; // 4 sessions
  else if (dir === 'gain') schedule = [[0, 'strength'], [2, 'cardio'], [4, 'strength']];         // 3 sessions, strength-first
  else schedule = [[0, 'cardio'], [2, 'strength'], [4, 'cardio'], [5, 'strength']].slice(0, bmi >= 25 ? 4 : 3);

  // Rule 2: cardio choice and length (20–40 min). Low-impact options for higher BMI.
  const cardioOptions = lowImpact
    ? [{ name: 'Brisk walk', minutes: 30 }, { name: 'Cycling', minutes: 30 }]
    : [{ name: 'Running (run/walk intervals)', minutes: 25 }, { name: 'Cycling', minutes: 30 }];
  const cardioBonus = dir === 'lose' ? 5 : 0;

  // Rule 3: strength circuits, easier variants for higher BMI, more reps when gaining.
  const r = dir === 'gain' ? 2 : 0;
  const strengthA = [
    { name: lowImpact ? 'Squats (to a chair)' : 'Squats', mode: 'reps', sets: 3, reps: 10 + r, minutes: 8 },
    { name: lowImpact ? 'Push-ups (knees or wall)' : 'Push-ups', mode: 'reps', sets: 3, reps: 8 + r, minutes: 8 },
    { name: 'Plank', mode: 'time', sets: 3, amount: lowImpact ? 20 : 30, unit: 's', minutes: 5 },
    { name: 'Stretching', type: 'mobility', mode: 'time', sets: 1, amount: 5, unit: 'min', minutes: 5 },
  ];
  const strengthB = [
    { name: lowImpact ? 'Glute bridges' : 'Lunges', mode: 'reps', sets: 3, reps: 10 + r, minutes: 8 },
    { name: lowImpact ? 'Push-ups (knees or wall)' : 'Push-ups', mode: 'reps', sets: 3, reps: 8 + r, minutes: 8 },
    { name: lowImpact ? 'Squats (to a chair)' : 'Squats', mode: 'reps', sets: 3, reps: 12 + r, minutes: 8 },
    { name: 'Plank', mode: 'time', sets: 2, amount: lowImpact ? 20 : 30, unit: 's', minutes: 4 },
  ];

  const plan = DAYS.map(() => []);
  let c = 0, s = 0;
  for (const [day, kind] of schedule) {
    if (kind === 'cardio') {
      const o = cardioOptions[c++ % cardioOptions.length];
      const minutes = clamp(o.minutes + cardioBonus, 20, 40);
      plan[day].push(make({ name: o.name, type: 'cardio', mode: 'time', sets: 1, amount: minutes, unit: 'min', minutes }));
    } else {
      const circuit = s++ % 2 === 0 ? strengthA : strengthB;
      for (const ex of circuit) plan[day].push(make({ type: 'strength', ...ex }));
    }
  }
  return plan;
}

/* ---------- Calendar export (.ics) ---------- */

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds lines at 75 octets as RFC 5545 requires, without splitting UTF-8 characters. */
function icsFold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function buildICS(alertMinutes) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Workout Diary//EN', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:Workouts',
  ];
  let events = 0;
  state.plan.forEach((list, day) => {
    // One calendar event per day + time, listing all exercises in that slot.
    const groups = new Map();
    for (const w of list) {
      if (!groups.has(w.time)) groups.set(w.time, []);
      groups.get(w.time).push(w);
    }
    for (const [time, items] of groups) {
      const offset = (day - dayIndex(now) + 7) % 7;
      const first = addDays(now, offset);
      const [hh, mm] = time.split(':');
      const dtstart = `${isoDate(first).replace(/-/g, '')}T${hh}${mm}00`;
      const minutes = Math.max(5, sum(items));
      const summary = items.length === 1 ? items[0].name : `Workout: ${items.map((w) => w.name).join(', ')}`;
      const description = items.map((w) => `• ${w.name} — ${describe(w)}`).join('\n');
      const trigger = alertMinutes > 0 ? `-PT${alertMinutes}M` : 'PT0M';
      lines.push(
        'BEGIN:VEVENT',
        `UID:workout-${ICS_DAYS[day]}-${hh}${mm}@workout-diary.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dtstart}`, // floating local time — follows the phone's time zone
        `DURATION:PT${minutes}M`,
        `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[day]}`,
        `SUMMARY:${icsEscape('💪 ' + summary)}`,
        `DESCRIPTION:${icsEscape(description)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(summary)}`, `TRIGGER:${trigger}`, 'END:VALARM',
        'END:VEVENT',
      );
      events++;
    }
  });
  lines.push('END:VCALENDAR');
  return { text: lines.map(icsFold).join('\r\n') + '\r\n', events };
}

/* ---------- Files ---------- */

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function shareOrDownload(name, text, type) {
  if (isStandalone && navigator.canShare) {
    const file = new File([text], name, { type });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  downloadFile(name, text, type);
}

/* ---------- Rendering ---------- */

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

function renderToday() {
  const now = new Date();
  const key = isoDate(now);
  $('#today-date').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  const list = sortByTime(state.plan[dayIndex(now)]);
  const doneIds = new Set((state.done[key] || { ids: [] }).ids);
  const ul = $('#today-list');
  ul.replaceChildren(...list.map((w) => {
    const isDone = doneIds.has(w.id);
    const btn = h('button', {
      class: 'check', type: 'button', role: 'checkbox', 'aria-checked': String(isDone),
      'aria-label': `Mark ${w.name} as done`, onclick: () => toggleDone(w.id),
    });
    btn.innerHTML = CHECK_SVG;
    return h('li', { class: `workout-item${isDone ? ' done' : ''}` },
      btn,
      h('div', { class: 'workout-main' },
        h('div', { class: 'workout-name' }, h('i', { class: `type-dot ${w.type}` }), h('span', { text: w.name })),
        h('div', { class: 'workout-meta', text: describe(w) })),
      h('span', { class: 'workout-time', text: w.time }));
  }));
  $('#today-empty').hidden = list.length > 0;
  ul.hidden = list.length === 0;

  const doneCount = list.filter((w) => doneIds.has(w.id)).length;
  $('#today-progress').textContent = list.length ? `${doneCount}/${list.length}` : 'Rest';
  const s = streak();
  $('#streak-count').textContent = s;
  $('#streak-unit').textContent = s === 1 ? 'day' : 'days';

  // Weekly summary (Mon–Sun of the current week)
  const monday = addDays(now, -dayIndex(now));
  let total = 0, done = 0, minP = 0, minD = 0;
  const bars = DAYS.map((_, i) => {
    const d = addDays(monday, i);
    const st = dayStatus(isoDate(d));
    total += st.total; done += st.done; minP += st.minutesPlanned; minD += st.minutesDone;
    const pct = st.total ? (st.done / st.total) * 100 : 0;
    const bar = h('div', { class: `bar${st.total ? '' : ' rest'}` }, h('i', { style: `height:${pct}%` }));
    return h('div', {
      class: `week-bar${i === dayIndex(now) ? ' is-today' : ''}`,
      title: st.total ? `${DAYS[i]}: ${st.done}/${st.total} done` : `${DAYS[i]}: rest day`,
    }, bar, h('span', { text: DAY_SHORT[i].slice(0, 2) }));
  });
  $('#week-bars').replaceChildren(...bars);
  $('#week-summary-text').textContent = total
    ? `${done} of ${total} workouts done (${Math.round((done / total) * 100)}%) · ${minD} of ${minP} minutes`
    : 'No workouts planned this week yet.';
}

function renderPlan() {
  const todayIdx = dayIndex(new Date());
  const wrap = $('#plan-days');
  wrap.replaceChildren(...DAYS.map((day, i) => {
    const list = sortByTime(state.plan[i]);
    const minutes = sum(list);
    return h('div', { class: `card day-card${i === todayIdx ? ' today' : ''}` },
      h('div', { class: 'day-head' },
        h('h2', { text: day }),
        h('span', { class: 'muted small', text: list.length ? `${list.length} · ${minutes} min` : 'Rest' })),
      list.length
        ? h('ul', { class: 'workout-list' }, list.map((w) =>
          h('li', { class: 'workout-item' },
            h('div', { class: 'workout-main' },
              h('div', { class: 'workout-name' }, h('i', { class: `type-dot ${w.type}` }), h('span', { text: w.name })),
              h('div', { class: 'workout-meta', text: `${w.time} · ${describe(w)}` })),
            h('button', { class: 'edit-btn', type: 'button', onclick: () => openWorkoutDialog(i, w), text: 'Edit' }))))
        : h('p', { class: 'rest', text: 'Rest day' }),
      h('button', { class: 'btn secondary small', type: 'button', onclick: () => openWorkoutDialog(i), text: '+ Add workout' }));
  }));
  $('#suggest-time').value = state.settings.suggestTime;
  $('#alert-select').value = String(state.settings.alertMinutes);
}

function renderWeight() {
  const ws = state.weights;
  const ul = $('#weight-list');
  const rows = [...ws].reverse().map((w, idx, arr) => {
    const prev = arr[idx + 1];
    const delta = prev ? w.kg - prev.kg : null;
    const del = h('button', {
      class: 'row-icon', type: 'button', 'aria-label': `Delete entry from ${w.date}`,
      onclick: () => {
        if (!confirm(`Delete ${fmtKg(w.kg)} on ${fmtDate(w.date)}?`)) return;
        state.weights = state.weights.filter((x) => x.date !== w.date);
        if (state.weights.length) state.profile.weight = state.weights[state.weights.length - 1].kg;
        save();
        renderWeight();
        renderProfile();
      },
    });
    del.innerHTML = TRASH_SVG;
    return h('li', { class: 'weight-row' },
      h('span', { class: 'w-date', text: fmtDate(w.date, { weekday: 'short', day: 'numeric', month: 'short', year: w.date.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' }) }),
      h('span', { class: `w-delta${delta != null && delta < 0 ? ' down' : ''}`, text: delta == null ? '' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` }),
      h('span', { class: 'w-kg', text: fmtKg(w.kg) }),
      del);
  });
  ul.replaceChildren(...rows);
  $('#weight-empty').hidden = ws.length > 0;
  renderChart();
}

function renderChart() {
  const box = $('#weight-chart');
  const ws = state.weights.slice(-60);
  if (ws.length < 2) {
    box.replaceChildren(h('div', { class: 'empty', text: 'Log at least two weights to see your chart.' }));
    return;
  }
  const W = 340, H = 190, L = 38, R = 12, T = 12, B = 26;
  const goal = state.profile.goal;
  const t0 = parseISO(ws[0].date).getTime();
  const t1 = parseISO(ws[ws.length - 1].date).getTime();
  const kgs = ws.map((w) => w.kg).concat(goal ? [goal] : []);
  const padKg = Math.max(0.5, (Math.max(...kgs) - Math.min(...kgs)) * 0.12);
  const lo = Math.floor(Math.min(...kgs) - padKg);
  const step = Math.max(1, Math.ceil((Math.max(...kgs) + padKg - lo) / 3));
  const hi = lo + step * 3;
  const x = (d) => L + ((parseISO(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (kg) => T + (1 - (kg - lo) / (hi - lo)) * (H - T - B);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  for (let i = 0; i <= 3; i++) {
    const kg = lo + ((hi - lo) * i) / 3;
    svg.append(svgEl('line', { class: 'grid', x1: L, x2: W - R, y1: y(kg), y2: y(kg) }));
    const t = svgEl('text', { x: L - 6, y: y(kg) + 4, 'text-anchor': 'end' });
    t.textContent = String(Math.round(kg));
    svg.append(t);
  }
  if (goal) {
    svg.append(svgEl('line', { class: 'goal', x1: L, x2: W - R, y1: y(goal), y2: y(goal) }));
    const gt = svgEl('text', { class: 'goal-label', x: W - R, y: y(goal) - 5, 'text-anchor': 'end' });
    gt.textContent = `Goal ${goal}`;
    svg.append(gt);
  }
  const pts = ws.map((w) => `${x(w.date).toFixed(1)},${y(w.kg).toFixed(1)}`);
  svg.append(svgEl('path', { class: 'area', d: `M${x(ws[0].date)},${H - B} L${pts.join(' L')} L${x(ws[ws.length - 1].date)},${H - B} Z` }));
  svg.append(svgEl('polyline', { class: 'line', points: pts.join(' ') }));
  if (ws.length <= 30) ws.forEach((w) => svg.append(svgEl('circle', { class: 'dot', cx: x(w.date), cy: y(w.kg), r: 3.5 })));
  const label = (d, anchor, xx) => {
    const t = svgEl('text', { x: xx, y: H - 6, 'text-anchor': anchor });
    t.textContent = fmtDate(d, { day: 'numeric', month: 'short' });
    svg.append(t);
  };
  label(ws[0].date, 'start', L);
  label(ws[ws.length - 1].date, 'end', W - R);
  box.replaceChildren(svg);
  box.setAttribute('aria-label', `Weight chart from ${fmtKg(ws[0].kg)} to ${fmtKg(ws[ws.length - 1].kg)}`);
}

function renderProfile() {
  const f = $('#profile-form');
  for (const k of ['height', 'weight', 'goal']) {
    if (document.activeElement !== f[k]) f[k].value = state.profile[k] ?? '';
  }
  const info = bmiInfo();
  $('#bmi-value').textContent = info ? info.bmi.toFixed(1) : '–';
  $('#bmi-category').textContent = info ? info.category : 'Add height & weight';
  const { weight, goal, height } = state.profile;
  if (weight && goal) {
    const diff = weight - goal;
    if (Math.abs(diff) < 0.05) {
      $('#goal-diff').textContent = '🎯';
      $('#goal-sub').textContent = 'Goal reached!';
    } else {
      $('#goal-diff').textContent = `${diff > 0 ? '−' : '+'}${Math.abs(diff).toFixed(1)}`;
      const goalBmi = height ? ` · BMI ${(goal / (height / 100) ** 2).toFixed(1)} at goal` : '';
      $('#goal-sub').textContent = `kg to ${diff > 0 ? 'lose' : 'gain'}${goalBmi}`;
    }
  } else {
    $('#goal-diff').textContent = '–';
    $('#goal-sub').textContent = 'Add a goal weight';
  }
  $$('#theme-seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeValue === state.settings.theme)));
}

function renderAll() {
  renderToday();
  renderPlan();
  renderWeight();
  renderProfile();
}

/* ---------- Theme ---------- */

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  $$('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media');
    m.content = dark ? '#0f1115' : '#f4f5f7';
  });
}

function setTheme(t) {
  state.settings.theme = t;
  save();
  applyTheme();
  renderProfile();
}

/* ---------- Navigation ---------- */

const VIEWS = ['today', 'plan', 'weight', 'profile'];

function showView() {
  const name = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
  $$('.tabbar a').forEach((a) => {
    const on = a.dataset.view === name;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#view-title').textContent = $(`#view-${name}`).dataset.title;
  if (name === 'today') renderToday(); // the date may have changed since last visit
  window.scrollTo(0, 0);
}

/* ---------- Workout dialog ---------- */

let editing = null; // { day, id } or { day, id: null }

function allPresets() {
  return [...PRESETS, ...state.custom];
}

function setSegmented(seg, value) {
  $$('button', seg).forEach((b) => b.classList.toggle('active', b.dataset.value === value));
  seg.dataset.value = value;
}

function syncModeFields() {
  const mode = $('#mode-seg').dataset.value;
  $$('#workout-form [data-mode]').forEach((el) => { el.hidden = el.dataset.mode !== mode; });
}

function fillWorkoutForm(w) {
  const f = $('#workout-form');
  f.name.value = w.name || '';
  setSegmented($('#type-seg'), w.type || 'strength');
  setSegmented($('#mode-seg'), w.mode || 'reps');
  f.sets.value = w.sets ?? 3;
  f.reps.value = w.reps ?? 10;
  f.amount.value = w.amount ?? 30;
  f.unit.value = w.unit || 's';
  f.minutes.value = w.minutes ?? 10;
  syncModeFields();
}

function openWorkoutDialog(day, w) {
  const f = $('#workout-form');
  editing = { day, id: w ? w.id : null };
  $('#workout-dialog-title').textContent = w ? 'Edit workout' : `Add workout · ${DAYS[day]}`;
  $('#workout-delete').hidden = !w;

  const sel = $('#preset-select');
  const presetOpts = PRESETS.map((p, i) => h('option', { value: `p${i}`, text: p.name }));
  const customOpts = state.custom.map((p, i) => h('option', { value: `c${i}`, text: p.name }));
  sel.replaceChildren(
    h('optgroup', { label: 'Presets' }, presetOpts),
    customOpts.length ? h('optgroup', { label: 'Your exercises' }, customOpts) : null,
    h('option', { value: 'custom', text: 'Custom…' }),
  );
  $('#day-select').replaceChildren(...DAYS.map((d, i) => h('option', { value: i, text: d })));
  f.day.value = String(day);

  if (w) {
    const all = allPresets();
    const idx = all.findIndex((p) => p.name === w.name);
    sel.value = idx < 0 ? 'custom' : idx < PRESETS.length ? `p${idx}` : `c${idx - PRESETS.length}`;
    fillWorkoutForm(w);
    f.time.value = w.time;
  } else {
    sel.value = 'p0';
    fillWorkoutForm(PRESETS[0]);
    // Default to the time already used that day, else the preferred time.
    f.time.value = state.plan[day][0]?.time || state.settings.suggestTime;
  }
  $('#workout-dialog').showModal();
}

function onPresetChange() {
  const v = $('#preset-select').value;
  if (v === 'custom') {
    const f = $('#workout-form');
    f.name.value = '';
    f.name.focus();
    return;
  }
  const p = v.startsWith('p') ? PRESETS[+v.slice(1)] : state.custom[+v.slice(1)];
  if (p) fillWorkoutForm(p);
}

function onWorkoutSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const w = cleanWorkout({
    id: editing.id || uid(),
    name: f.name.value,
    type: $('#type-seg').dataset.value,
    mode: $('#mode-seg').dataset.value,
    sets: f.sets.value, reps: f.reps.value, amount: f.amount.value, unit: f.unit.value,
    minutes: f.minutes.value, time: f.time.value,
  });
  if (!w) { f.name.focus(); return; }
  const newDay = +f.day.value;
  if (editing.id) state.plan[editing.day] = state.plan[editing.day].filter((x) => x.id !== editing.id);
  state.plan[newDay].push(w);

  // Remember custom exercises so they show up as presets next time.
  const known = allPresets().some((p) => p.name.toLowerCase() === w.name.toLowerCase());
  if (!known) {
    const { id, time, ...rest } = w;
    state.custom.push(cleanWorkout({ ...rest, time: '18:00' }));
  }
  save();
  $('#workout-dialog').close();
  renderPlan();
  renderToday();
  toast(editing.id ? 'Workout updated' : `Added to ${DAYS[newDay]}`);
}

function onWorkoutDelete() {
  if (!editing?.id) return;
  if (!confirm('Delete this workout from your plan?')) return;
  state.plan[editing.day] = state.plan[editing.day].filter((x) => x.id !== editing.id);
  save();
  $('#workout-dialog').close();
  renderPlan();
  renderToday();
  toast('Workout deleted');
}

/* ---------- Weight dialog ---------- */

function openWeightDialog() {
  const f = $('#weight-form');
  const today = isoDate(new Date());
  const existing = state.weights.find((w) => w.date === today);
  f.kg.value = existing?.kg ?? state.profile.weight ?? '';
  f.date.value = today;
  f.date.max = today;
  $('#weight-dialog').showModal();
  setTimeout(() => { f.kg.focus(); f.kg.select(); }, 50);
}

function onWeightSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const kg = num(f.kg.value);
  if (!kg || kg < 25 || kg > 350 || !f.date.value) { f.kg.focus(); return; }
  logWeight(f.date.value, Math.round(kg * 10) / 10);
  $('#weight-dialog').close();
  renderWeight();
  renderProfile();
  toast(`Saved ${fmtKg(kg)}`);
}

/* ---------- Demo data (made-up values) ---------- */

function demoState() {
  const s = defaultState();
  s.profile = { height: 172, weight: 78.4, goal: 72 };
  const today = new Date();
  let kg = 81.2;
  for (let i = 42; i >= 0; i -= 3) {
    kg -= 0.15 + ((i * 7) % 5) / 25 - 0.08;
    s.weights.push({ date: isoDate(addDays(today, -i)), kg: Math.round(kg * 10) / 10 });
  }
  s.profile.weight = s.weights[s.weights.length - 1].kg;
  state = s;
  s.plan = suggestPlan('07:30');
  // Mark the last few planned days as done so the streak shows something.
  for (let i = 1; i <= 6; i++) {
    const d = addDays(today, -i);
    const list = s.plan[dayIndex(d)];
    if (list.length) s.done[isoDate(d)] = { ids: list.map((w) => w.id), total: list.length };
  }
  s.createdAt = isoDate(addDays(today, -42));
  return s;
}

/* ---------- Wiring ---------- */

function init() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  window.addEventListener('hashchange', showView);
  showView();
  renderAll();

  $('#theme-toggle').addEventListener('click', () => {
    const order = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(state.settings.theme) + 1) % order.length];
    setTheme(next);
    toast(`Theme: ${next === 'system' ? 'follow system' : next}`);
  });
  $$('#theme-seg button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeValue)));

  // Profile: save as you type; a changed current weight is also logged for today.
  const pf = $('#profile-form');
  pf.addEventListener('input', (e) => {
    const k = e.target.name;
    if (k === 'height' || k === 'goal') {
      state.profile[k] = num(e.target.value);
      save();
      renderProfile();
      renderChart();
    }
  });
  pf.weight.addEventListener('change', () => {
    const kg = num(pf.weight.value);
    if (kg && kg >= 25 && kg <= 350) {
      logWeight(isoDate(new Date()), Math.round(kg * 10) / 10);
      renderWeight();
      toast("Saved as today's weight");
    } else if (pf.weight.value === '') {
      state.profile.weight = null;
      save();
    }
    renderProfile();
  });
  pf.addEventListener('submit', (e) => e.preventDefault());

  // Weight
  $('#log-weight-btn').addEventListener('click', openWeightDialog);
  $('#weight-form').addEventListener('submit', onWeightSubmit);

  // Workout dialog
  $('#preset-select').addEventListener('change', onPresetChange);
  $('#workout-form').addEventListener('submit', onWorkoutSubmit);
  $('#workout-delete').addEventListener('click', onWorkoutDelete);
  for (const id of ['#type-seg', '#mode-seg']) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      setSegmented($(id), b.dataset.value);
      syncModeFields();
    });
  }
  $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  // Suggest my week
  $('#suggest-time').addEventListener('change', (e) => {
    if (/^\d{2}:\d{2}$/.test(e.target.value)) { state.settings.suggestTime = e.target.value; save(); }
  });
  $('#suggest-btn').addEventListener('click', () => {
    const hasPlan = state.plan.some((l) => l.length);
    if (hasPlan && !confirm('Replace your current weekly plan with a suggested one?')) return;
    const tailored = !!bmiInfo();
    if (!tailored) toast('Tip: fill in your profile for a tailored plan');
    state.plan = suggestPlan(state.settings.suggestTime);
    save();
    renderPlan();
    renderToday();
    const sessions = state.plan.filter((l) => l.length).length;
    const mins = state.plan.reduce((a, l) => a + sum(l), 0);
    setTimeout(() => toast(`New plan: ${sessions} sessions · ${mins} min/week`), tailored ? 0 : 2600);
  });

  // Calendar
  $('#alert-select').addEventListener('change', (e) => {
    state.settings.alertMinutes = +e.target.value;
    save();
  });
  const exportICS = (direct) => {
    const { text, events } = buildICS(state.settings.alertMinutes);
    if (!events) { toast('Your plan is empty — add workouts first'); return; }
    if (direct && isIOS && !isStandalone) {
      // Opening the file directly makes iOS Safari show the "Add All" calendar sheet.
      location.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
      return;
    }
    shareOrDownload('workout-plan.ics', text, 'text/calendar');
  };
  $('#ics-btn').addEventListener('click', () => exportICS(true));
  $('#ics-download-btn').addEventListener('click', () => exportICS(false));

  // Data
  $('#export-btn').addEventListener('click', () => {
    shareOrDownload(`workout-diary-${isoDate(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json');
  });
  $('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !('plan' in data || 'weights' in data || 'profile' in data)) {
        throw new Error('not a backup');
      }
      if (!confirm('Replace all data on this device with the imported file?')) return;
      state = normalize(data);
      save();
      applyTheme();
      renderAll();
      toast('Data imported');
    } catch {
      toast('That file is not a valid Workout Diary backup');
    }
  });
  $('#demo-btn').addEventListener('click', () => {
    if (!confirm('Replace your data with made-up demo data?')) return;
    state = demoState();
    save();
    renderAll();
    toast('Demo data loaded');
  });
  $('#reset-btn').addEventListener('click', () => {
    if (!confirm('Delete ALL data on this device? This cannot be undone — export a backup first if needed.')) return;
    const theme = state.settings.theme;
    state = defaultState();
    state.settings.theme = theme;
    save();
    renderAll();
    toast('All data deleted');
  });

  // Refresh "today" when the app comes back to the foreground (e.g. the next morning).
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderToday(); });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
