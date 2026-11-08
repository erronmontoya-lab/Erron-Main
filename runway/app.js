/* Runway Tracker UI. All math lives in core.js (window.RunwayCore). */
(() => {
'use strict';

const app = document.getElementById('app');
const C = window.RunwayCore;
if (!C) {
  app.innerHTML = '<section class="card welcome"><h2>Missing file</h2><p>core.js did not load. Keep index.html, core.js and app.js together in the same folder.</p></section>';
  return;
}
const { MONTH, FREQ, iso, parse, isISODate, addDays, daysBetween, round2, finite } = C;
const today = () => C.startOfDay(new Date());

/* =====================================================================
 * Storage: main state, rolling snapshots, corruption recovery
 * ===================================================================== */
const KEY = 'runway-tracker.v1';
const SNAP_KEY = KEY + '.snapshots';
const UI_KEY = KEY + '.ui';
const THEME_KEY = KEY + '.theme';
const MAX_SNAPSHOTS = 20;
const MAX_AUTO_SNAPSHOTS = 14;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { localStorage.setItem(k, v); },            // throws: callers handle it
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const storage = { ok: true, msg: '' };
const loadNotices = [];                                  // [cls, html] shown once at the top

function storageError(e) {
  return e && (e.name === 'QuotaExceededError' || e.code === 22)
    ? 'Browser storage is full.'
    : 'This browser is blocking storage (a private window, or site data is turned off).';
}
(function probeStorage() {
  try { ls.set(KEY + '.probe', '1'); ls.del(KEY + '.probe'); }
  catch (e) { storage.ok = false; storage.msg = storageError(e); }
})();

const hasData = s => !!(s && (s.accounts.length || s.bills.length || s.income.length));
const clone = s => JSON.parse(JSON.stringify(s));

function readSnapshots() {
  try {
    const a = JSON.parse(ls.get(SNAP_KEY) || '[]');
    return Array.isArray(a) ? a.filter(x => x && x.data && typeof x.ts === 'number') : [];
  } catch (e) { return []; }
}
function writeSnapshots(a) {
  a = a.slice(-MAX_SNAPSHOTS);
  for (;;) {
    try { ls.set(SNAP_KEY, JSON.stringify(a)); return true; }
    catch (e) { if (a.length <= 1) return false; a.shift(); }   // out of room: drop oldest and retry
  }
}
/** Save a restorable copy. `daily` snapshots are taken at most once per calendar day. */
function snapshot(label, data, { daily = false } = {}) {
  if (!hasData(data)) return;
  let a = readSnapshots();
  const day = iso(today());
  if (daily && a.some(x => x.auto && x.day === day)) return;
  a.push({ ts: Date.now(), day, label, auto: daily, data: clone(data) });
  const autos = a.filter(x => x.auto);
  if (autos.length > MAX_AUTO_SNAPSHOTS) a = a.filter(x => x !== autos[0]);
  writeSnapshots(a);
}

function loadState() {
  const raw = ls.get(KEY);
  if (raw == null) return C.blank();
  try {
    const { state, warnings } = C.normalizeState(JSON.parse(raw));
    if (warnings.length) loadNotices.push(['warning', `<b>Some saved data was repaired.</b> ${warnings.slice(0, 3).map(esc).join(' ')}${warnings.length > 3 ? ` (+${warnings.length - 3} more)` : ''}`]);
    return state;
  } catch (e) {
    try { ls.set(`${KEY}.corrupt-${Date.now()}`, raw); } catch (e2) {}
    for (const snap of readSnapshots().reverse()) {
      try {
        const st = C.normalizeState(snap.data).state;
        loadNotices.push(['critical', `<b>Your saved data could not be read,</b> so the copy from ${esc(new Date(snap.ts).toLocaleString())} was restored. The unreadable data was set aside, not deleted.`]);
        return st;
      } catch (e3) {}
    }
    loadNotices.push(['critical', '<b>Your saved data could not be read</b> and there is no snapshot to fall back on. If you have an exported backup, use Import.']);
    return C.blank();
  }
}

let S = loadState();
let ui = { view: 'overview', range: 12, billFilter: 'all' };
try {
  const u = JSON.parse(ls.get(UI_KEY) || 'null');
  if (u && ['overview', 'bills', 'income', 'accounts', 'history', 'settings'].includes(u.view)) ui.view = u.view;
  if (u && [6, 12, 24, 36].includes(u.range)) ui.range = u.range;
  if (u && ['all', 'essential', 'extras'].includes(u.billFilter)) ui.billFilter = u.billFilter;
} catch (e) {}

function persist() {
  try {
    ls.set(KEY, JSON.stringify(S));
    storage.ok = true; storage.msg = '';
  } catch (e) {
    storage.ok = false; storage.msg = storageError(e);
  }
  try { ls.set(UI_KEY, JSON.stringify(ui)); } catch (e) {}
}

let persistRequested = false;
function requestPersistentStorage() {
  if (persistRequested || !hasData(S)) return;
  persistRequested = true;
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
    }
  } catch (e) {}
}

/* =====================================================================
 * Formatting helpers
 * ===================================================================== */
const cur = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const cur2 = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n, cents) => (cents ? cur2 : cur).format(finite(n));
function compact(n) {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return s + '$' + Math.round(a);
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const fmtDate = (d, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => d.toLocaleDateString(undefined, opts);
const safeDate = (s, opts) => (isISODate(s) ? fmtDate(parse(s), opts) : '—');

/* model shortcuts bound to the current state and today's date */
const cashTotal = () => C.cashTotal(S);
const monthly = (list, f) => C.monthlyOf(list, f);
const isActive = i => C.isActive(i, today());
const listFor = kind => (kind === 'bill' ? S.bills : kind === 'income' ? S.income : S.accounts);

/* =====================================================================
 * Icons (Lucide-style, 24px grid, stroke)
 * ===================================================================== */
const ICON_PATHS = {
  overview: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  bills: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  income: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  down: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  accounts: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  settings: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  checkin: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  edit: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  skip: '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  pie: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  bank: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  eyeoff: '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>'
};
const ic = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;

/* =====================================================================
 * Toasts with undo
 * ===================================================================== */
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg, undoFn) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `${ic('check')}<span>${esc(msg)}</span>${undoFn ? '<button type="button" data-undo>Undo</button>' : ''}`;
  toastEl.hidden = false;
  const btn = toastEl.querySelector('[data-undo]');
  if (btn) btn.onclick = () => { toastEl.hidden = true; undoFn(); };
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, undoFn ? 10000 : 4000);
}
/** Run a change; offer to undo it. `fn` returning false cancels. */
function commit(label, fn) {
  const before = JSON.stringify(S);
  if (fn() === false) return false;
  render();
  if (label) toast(label, () => { S = C.normalizeState(JSON.parse(before)).state; render(); toast('Undone.'); });
  return true;
}

/* =====================================================================
 * Render: shell (nav, top bar) + current view
 * ===================================================================== */
const VIEWS = {
  overview: { title: 'Overview', icon: 'overview' },
  bills:    { title: 'Bills & expenses', icon: 'bills' },
  income:   { title: 'Income', icon: 'income' },
  accounts: { title: 'Accounts', icon: 'accounts' },
  history:  { title: 'History', icon: 'history' },
  settings: { title: 'Settings', icon: 'settings' }
};
let renderedDay = '';
let lastView = '';
let model = null;   // cached projections for the current render

function computeModel() {
  const t0 = today();
  const H = Math.round(S.settings.horizon * MONTH);
  return {
    all: C.simulate(S, { days: H }, t0),
    ess: C.simulate(S, { essentialOnly: true, days: H }, t0),
    billsMo: monthly(S.bills, b => b.freq !== 'once' && isActive(b)),
    essMo: monthly(S.bills, b => b.freq !== 'once' && b.essential && isActive(b)),
    incMo: monthly(S.income, i => i.freq !== 'once' && isActive(i))
  };
}

function render() {
  persist();
  requestPersistentStorage();
  renderedDay = iso(today());
  renderBanners();
  try {
    model = hasData(S) ? computeModel() : null;
    renderShell();
    renderView();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<section class="card welcome">
      <h2>Something went wrong showing your data</h2>
      <p>Your data is still saved. Export a backup, then try restoring a snapshot or reloading the page.</p>
      <p class="tiny" style="margin-top:10px">${esc(err && err.message)}</p>
      <div class="actions" style="margin-top:20px">
        <button class="btn primary" data-action="export">${ic('download')}Export backup</button>
        <button class="btn" data-action="restore-latest">Restore latest snapshot</button>
        <button class="btn" data-action="reload">Reload</button>
      </div></section>`;
  }
}

function themeIsDark() {
  const r = document.documentElement;
  return r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

function renderShell() {
  const counts = { bills: S.bills.length, income: S.income.length, accounts: S.accounts.length };
  document.getElementById('nav').innerHTML = Object.entries(VIEWS).map(([k, v]) =>
    `<button data-action="tab" data-tab="${k}" ${ui.view === k ? 'aria-current="page"' : ''}>${ic(v.icon)}<span>${v.title}</span>${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('');

  const side = document.getElementById('sideStatus');
  if (model) {
    const r = runwayText(model.all), st = statusOf(model.all), pct = goalPct(model.all);
    side.innerHTML = `<div class="mini"><div class="tiny"><span class="badge-dot" style="width:7px;height:7px;border-radius:50%;background:var(--${st.cls})"></span>Runway · ${st.label}</div>
      <div class="v">${r.big} <small>${r.unit}</small></div>
      <div class="meter"><i style="width:${pct}%;background:var(--${st.cls})"></i></div></div>`;
  } else side.innerHTML = '';

  document.getElementById('pageTitle').textContent = VIEWS[ui.view].title;
  const now = new Date();
  const subs = {
    overview: model ? `${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}` : 'Set up your runway in a few minutes',
    bills: 'Everything you pay, and when it\'s due',
    income: 'Money still coming in while you\'re between jobs',
    accounts: 'Cash you can actually spend',
    history: 'Check-ins and everything you\'ve marked paid or received',
    settings: 'Projection, backups and data'
  };
  document.getElementById('pageSub').textContent = subs[ui.view];

  const theme = `<button class="btn icon ghost" data-action="theme" aria-label="Switch to ${themeIsDark() ? 'light' : 'dark'} theme" title="Toggle theme">${ic(themeIsDark() ? 'sun' : 'moon')}</button>`;
  const exportBtn = `<button class="btn has-lbl" data-action="export" title="Export backup">${ic('download')}<span class="lbl">Export</span></button>`;
  const checkin = `<button class="btn primary has-lbl" data-action="checkin" title="Log a balance check-in">${ic('checkin')}<span class="lbl">Check in</span></button>`;
  const add = (kind, label) => `<button class="btn primary" data-action="add" data-kind="${kind}">${ic('plus')}${label}</button>`;
  const acts = {
    overview: model ? [theme, exportBtn, checkin] : [theme],
    bills: [theme, add('bill', 'Add bill')],
    income: [theme, add('income', 'Add income')],
    accounts: [theme, `<button class="btn has-lbl" data-action="checkin">${ic('checkin')}<span class="lbl">Check in</span></button>`, add('account', 'Add account')],
    history: [theme, checkin],
    settings: [theme, exportBtn]
  };
  document.getElementById('topActions').innerHTML = acts[ui.view].join('');
}

function renderBanners() {
  const el = document.getElementById('banners');
  const items = [];
  if (!storage.ok) items.push(['critical', `<b>Changes are not being saved.</b> ${esc(storage.msg)} Export a backup now so you don't lose your work.`, `<button class="btn sm" data-action="export">${ic('download')}Export backup</button>`]);
  loadNotices.forEach((n, i) => items.push([n[0], n[1], `<button class="btn sm ghost" data-action="dismiss-notice" data-i="${i}">Dismiss</button>`]));
  el.innerHTML = items.map(([c, h, btn]) => `<div class="banner ${c}">${ic('alert')}<div class="txt">${h}</div>${btn || ''}</div>`).join('');
  el.hidden = !items.length;
}

function renderView() {
  if (ui.view === 'overview' && !model) { app.innerHTML = welcomeHTML(); return; }
  const views = { overview: overviewHTML, bills: billsView, income: incomeView, accounts: accountsView, history: historyView, settings: settingsView };
  const fade = lastView !== ui.view ? ' fade' : '';
  lastView = ui.view;
  app.innerHTML = `<div class="stack${fade}">${views[ui.view]()}</div>`;
  if (ui.view === 'overview') drawChart(model.all, model.ess, chartRange());
}
const chartRange = () => Math.min(ui.range, S.settings.horizon);

/* ---------- shared bits ---------- */
function runwayText(sim) {
  if (sim.out < 0) return { big: `${S.settings.horizon}+`, unit: 'months', date: null, now: false };
  if (sim.out === 0) return { big: '0', unit: 'days', date: today(), now: true };
  const m = sim.out / MONTH;
  return { big: m < 1 ? String(sim.out) : m.toFixed(1), unit: m < 1 ? (sim.out === 1 ? 'day' : 'days') : 'months', date: addDays(today(), sim.out), now: false };
}
function statusOf(sim) {
  if (sim.out < 0 || sim.out > 12 * MONTH) return { label: 'Comfortable', cls: 'good' };
  if (sim.out > 6 * MONTH) return { label: 'Watch closely', cls: 'warning' };
  if (sim.out > 3 * MONTH) return { label: 'Tight', cls: 'serious' };
  return { label: 'Urgent', cls: 'critical' };
}
function goalPct(sim) {
  const goalDays = S.settings.targetMonths * MONTH;
  const have = sim.out < 0 ? Infinity : sim.out;
  return Math.max(2, Math.min(100, (have / goalDays) * 100));
}
const badge = (cls, label) => `<span class="badge ${cls}"><span class="dot" style="background:var(--${cls === 'neutral' ? 'faint' : cls})"></span>${label}</span>`;
const emptyHTML = (icon, title, text, btn = '') => `<div class="empty"><div class="ico-ring">${ic(icon)}</div><b>${title}</b>${text}${btn ? `<div>${btn}</div>` : ''}</div>`;
const rowBtns = (kind, id) => `<div class="rowbtns">
  <button class="btn icon sm ghost" data-action="edit" data-kind="${kind}" data-id="${esc(id)}" aria-label="Edit" title="Edit">${ic('edit')}</button>
  <button class="btn icon sm ghost danger" data-action="del" data-kind="${kind}" data-id="${esc(id)}" aria-label="Delete" title="Delete">${ic('trash')}</button></div>`;
const signed = n => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;

/* =====================================================================
 * Overview
 * ===================================================================== */
function overviewHTML() {
  return `${heroHTML()}${attentionHTML()}${chartCardHTML()}
    <div class="row-2">${upcomingHTML()}<div class="stack">${plannerHTML()}${categoriesHTML()}</div></div>`;
}

function heroHTML() {
  const { all, ess, billsMo, essMo, incMo } = model;
  const r = runwayText(all), re = runwayText(ess), st = statusOf(all);
  const net = incMo - billsMo, tm = S.settings.targetMonths;
  const ck = S.checkins, last = ck[ck.length - 1], prev = ck[ck.length - 2];
  const cashDelta = last && prev ? last.total - prev.total : null;
  const activeInc = S.income.filter(i => isActive(i) && i.freq !== 'once').length;
  const counted = S.accounts.filter(a => a.include !== false).length;
  const pct = goalPct(all);
  const reached = all.out < 0 ? tm <= S.settings.horizon : all.out / MONTH >= tm;
  return `
  <section class="hero">
    <div class="card hero-main">
      <div class="eyebrow"><span>Runway${S.settings.cushion ? ` · keeps ${money(S.settings.cushion)} cushion` : ''}</span>${badge(st.cls, st.label)}</div>
      <div class="big">${r.big}<small>${r.unit}</small></div>
      <div class="sub">${r.now ? '<b>Cash is already below your cushion.</b>' : r.date ? `Cash runs out around <b>${fmtDate(r.date, { month: 'long', day: 'numeric', year: 'numeric' })}</b>` : `Cash lasts beyond the ${S.settings.horizon}-month projection`}</div>
      <div class="hero-meter">
        <div class="lbls"><span>Goal: ${tm} months</span><span>${reached ? 'Goal met' : `${Math.round(pct)}% of goal`}</span></div>
        <div class="meter"><i style="width:${pct}%;background:var(--${st.cls})"></i></div>
      </div>
      <div class="hero-split">
        <div><div class="k">Essentials only</div><div class="v">${re.big} ${re.unit}</div></div>
        <div><div class="k">Last check-in</div><div class="v">${last ? safeDate(last.date, { month: 'short', day: 'numeric' }) : 'None yet'}</div></div>
      </div>
    </div>
    <div class="kpis">
      ${kpi('Cash on hand', 'accounts', money(cashTotal()), cashDelta === null ? `${counted} account${counted === 1 ? '' : 's'} counted`
        : `<span class="delta ${cashDelta >= 0 ? 'up' : 'down'}">${ic(cashDelta >= 0 ? 'income' : 'down')}${signed(cashDelta)}</span> since ${safeDate(prev.date, { month: 'short', day: 'numeric' })}`)}
      ${kpi('Bills per month', 'bills', money(billsMo), `${money(essMo)} essential · ${money(billsMo - essMo)} extras`)}
      ${kpi('Income per month', 'income', money(incMo), `${activeInc} active source${activeInc === 1 ? '' : 's'}`)}
      ${kpi('Net per month', net >= 0 ? 'income' : 'down', `<span style="color:var(--${net >= 0 ? 'good' : 'critical'}-text)">${signed(net)}</span>`, net >= 0 ? 'Cash is growing' : 'Monthly burn rate')}
    </div>
  </section>`;
}
const kpi = (label, icon, val, note) => `<div class="card kpi"><div class="top"><span class="label">${label}</span><span class="chip-ico">${ic(icon)}</span></div><div class="val num">${val}</div><div class="note">${note}</div></div>`;

function attentionItems() {
  const t0 = today(), A = [];
  const overdue = S.bills.filter(b => parse(b.next) < t0);
  if (overdue.length) A.push(['critical', 'alert', `<b>${overdue.length} overdue bill${overdue.length > 1 ? 's' : ''}</b> · ${overdue.map(b => esc(b.name)).join(', ')}`, '']);
  const late = S.income.filter(i => parse(i.next) < t0);
  if (late.length) A.push(['warning', 'clock', `<b>Confirm income</b> · ${late.map(i => esc(i.name)).join(', ')} ${late.length > 1 ? 'were' : 'was'} expected already. Mark received or skip so runway isn't overstated.`, '']);
  if (model.all.out === 0) A.push(['critical', 'alert', '<b>Cash is below your safety cushion right now.</b>', '']);
  else if (model.all.out > 0 && model.all.out <= 3 * MONTH) { const re = runwayText(model.ess); A.push(['critical', 'alert', `<b>Less than 3 months of runway.</b> Cutting to essentials gives you ${re.big} ${re.unit}.`, '']); }
  for (const i of S.income) {
    if (!i.end) continue;
    const d = daysBetween(t0, parse(i.end));
    if (d >= 0 && d <= 60) A.push(['warning', 'calendar', `<b>${esc(i.name)} ends ${safeDate(i.end, { month: 'short', day: 'numeric' })}</b> · in ${d} day${d === 1 ? '' : 's'}, dropping income by ${money(i.amount * FREQ[i.freq].perMonth)}/mo`, '']);
  }
  const lastCk = S.checkins[S.checkins.length - 1];
  if (S.accounts.length && (!lastCk || daysBetween(parse(lastCk.date), t0) > 10))
    A.push(['info', 'checkin', `<b>Update your balances</b> · ${lastCk ? `last check-in was ${daysBetween(parse(lastCk.date), t0)} days ago` : 'no check-ins yet'}. Weekly keeps the runway honest.`, `<button class="btn xs" data-action="checkin">Check in</button>`]);
  const le = S.settings.lastExport, since = le ? daysBetween(parse(le), t0) : null;
  if (since === null || since > 14)
    A.push(['info', 'shield', `<b>Back up your data</b> · ${since === null ? "you haven't exported a backup yet" : `last backup was ${since} days ago`}. It only lives in this browser.`, `<button class="btn xs" data-action="export">Export</button>`]);
  return A;
}
function attentionHTML() {
  const A = attentionItems();
  if (!A.length) return `<section class="card"><div class="att good"><span class="ic">${ic('check')}</span><div class="txt"><b>All clear</b> · no overdue bills, nothing ending soon, and your backup is current.</div></div></section>`;
  return `<section class="card" role="status">
    <div class="card-head" style="padding-bottom:10px"><h2>Needs attention</h2><span class="badge neutral">${A.length}</span></div>
    ${A.map(([c, i, t, btn]) => `<div class="att ${c}"><span class="ic">${ic(i)}</span><div class="txt">${t}</div>${btn}</div>`).join('')}
  </section>`;
}

function chartCardHTML() {
  const range = chartRange();
  return `<section class="card" aria-labelledby="chartTitle">
    <div class="card-head">
      <div><h2 id="chartTitle">Projected cash balance</h2><div class="sub">Day by day, from your bill and income dates</div></div>
      <div class="seg" role="group" aria-label="Chart range">
        ${[6, 12, 24, 36].filter(m => m <= S.settings.horizon).map(m => `<button data-action="range" data-m="${m}" aria-pressed="${range === m}">${m}M</button>`).join('')}
      </div>
    </div>
    <div class="legend">
      <span><i style="background:var(--s1)"></i>All bills</span>
      <span><i style="background:var(--s2)"></i>Essentials only</span>
      ${S.checkins.length ? '<span><i class="dotkey" style="background:var(--s3)"></i>Actual balance</span>' : ''}
      ${S.settings.cushion ? `<span><i class="dash"></i>Cushion ${money(S.settings.cushion)}</span>` : ''}
    </div>
    <div class="chart-box" id="chartBox"></div>
    ${monthTableHTML(model.all, model.ess, range)}
  </section>`;
}

function upcomingHTML() {
  const t0 = today();
  const ev = C.upcoming(S, 30, t0);
  const groups = [['Overdue', e => e.overdue], ['Next 7 days', e => !e.overdue && daysBetween(t0, e.date) < 7], ['Later this month', e => !e.overdue && daysBetween(t0, e.date) >= 7]];
  const row = e => {
    const isNext = parse(e.item.next).getTime() === e.date.getTime();
    return `<div class="ev">
      <div class="datechip ${e.overdue ? 'over' : ''}"><div class="m">${e.date.toLocaleDateString(undefined, { month: 'short' })}</div><div class="d">${e.date.getDate()}</div></div>
      <div style="min-width:0">
        <div class="name">${esc(e.item.name)}${e.overdue ? `<span class="pill over">${e.kind === 'bill' ? 'Overdue' : 'Confirm'}</span>` : ''}</div>
        <div class="meta num">${FREQ[e.item.freq].label} · balance after ${money(e.after)}</div>
      </div>
      <div class="right">
        <div class="amt num ${e.amount > 0 ? 'in' : ''}">${e.amount > 0 ? '+' : '−'}${money(Math.abs(e.amount), true)}</div>
        ${isNext ? `<div class="acts">
          <button class="btn xs" data-action="settle" data-kind="${e.kind}" data-id="${esc(e.item.id)}">${e.kind === 'bill' ? 'Paid' : 'Received'}</button>
          <button class="btn icon xs ghost" data-action="skip" data-kind="${e.kind}" data-id="${esc(e.item.id)}" aria-label="Skip to next date" title="Skip to next date without changing balances">${ic('skip')}</button>
        </div>` : ''}
      </div>
    </div>`;
  };
  const out = ev.reduce((t, e) => t + (e.amount < 0 ? -e.amount : 0), 0);
  const inn = ev.reduce((t, e) => t + (e.amount > 0 ? e.amount : 0), 0);
  return `<section class="card">
    <div class="card-head"><div><h2>Next 30 days</h2><div class="sub num">${money(out)} out · <span class="in">${money(inn)} in</span></div></div><span class="badge neutral">${ev.length} item${ev.length === 1 ? '' : 's'}</span></div>
    <div class="scroll">
      ${ev.length ? groups.map(([label, f]) => { const g = ev.filter(f); return g.length ? `<div class="group-label"><span>${label}</span><span class="num">${g.length}</span></div>${g.map(row).join('')}` : ''; }).join('')
        : emptyHTML('calendar', 'Nothing due', 'No bills or income in the next 30 days.')}
    </div>
  </section>`;
}

function plannerHTML() {
  const tm = S.settings.targetMonths, t0 = today();
  const gapAll = C.gapFor(S, tm, false, t0), gapEss = C.gapFor(S, tm, true, t0);
  let ans;
  if (gapAll === Infinity) ans = `<div class="answer" style="color:var(--critical-text)">Below cushion</div><p>Your cash is already under your ${money(S.settings.cushion)} cushion, so no monthly amount fixes today. Lower the cushion in Settings, or add money to an account.</p>`;
  else if (gapAll <= 0.5) ans = `<div class="answer" style="color:var(--good-text)">You're covered</div><p>Your cash lasts at least ${tm} months at current bills and income.</p>`;
  else ans = `<div class="answer num">${money(Math.ceil(gapAll))}<small> /month</small></div>
       <p>Extra income or cuts needed to stay above ${money(S.settings.cushion)} for ${tm} months.</p>
       <p>${gapEss <= 0.5 ? `Or cut to <b>essentials only</b>: that alone gets you there.` : `On essentials only, you'd still need <b>${money(Math.ceil(gapEss))}/mo</b>.`}</p>`;
  return `<section class="card card-pad planner">
    <div style="display:flex;align-items:center;justify-content:space-between"><h2>Runway goal</h2><span class="chip-ico">${ic('target')}</span></div>
    <label class="inline" for="targetMonths">Stay covered for <input type="number" id="targetMonths" min="1" max="60" step="1" value="${tm}" data-setting="targetMonths"> months</label>
    ${ans}
    <div class="callout">${ic('info')}<span>Plan for a 6–9 month search, plus about a month before the first paycheck lands.</span></div>
  </section>`;
}

function categoriesHTML() {
  const by = {};
  for (const b of S.bills) {
    if (b.freq === 'once' || !isActive(b)) continue;
    by[b.category] = (by[b.category] || 0) + b.amount * FREQ[b.freq].perMonth;
  }
  const rows = Object.entries(by).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '';
  const max = rows[0][1], total = rows.reduce((t, r) => t + r[1], 0);
  return `<section class="card card-pad">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div><h2>Where the money goes</h2><div class="sub num">${money(total)}/mo across ${rows.length} categories</div></div><span class="chip-ico">${ic('pie')}</span></div>
    ${rows.map(([k, v]) => `<div class="bar" title="${esc(k)}: ${money(v)}/mo (${Math.round(v / total * 100)}%)">
      <div class="lbl">${esc(k)}</div>
      <div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%"></div></div>
      <div class="v num">${money(v)}</div>
    </div>`).join('')}
  </section>`;
}

function monthTableHTML(all, ess, range) {
  const rows = [], t0 = today();
  for (let m = 1; m <= range; m++) {
    const d = Math.min(all.bal.length - 1, Math.round(m * MONTH));
    rows.push(`<tr><td>${fmtDate(addDays(t0, d), { month: 'short', year: 'numeric' })}</td><td class="r num">${money(all.bal[d])}</td><td class="r num">${money(ess.bal[d])}</td></tr>`);
  }
  return `<details class="tableview"><summary>${ic('chevron')}View as table</summary><div class="tablewrap"><table><thead><tr><th>Month</th><th class="r">All bills</th><th class="r">Essentials only</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></details>`;
}

/* =====================================================================
 * Data views
 * ===================================================================== */
const stat = (k, v) => `<div><div class="k">${k}</div><div class="v num">${v}</div></div>`;
const freqCell = i => `${FREQ[i.freq].label}${i.freq !== 'once' && i.freq !== 'monthly' ? `<div class="cell-sub num">${money(i.amount * FREQ[i.freq].perMonth)}/mo</div>` : ''}`;
const nextCell = (i, kind) => {
  const over = parse(i.next) < today();
  return `<div class="cell-main" style="font-weight:500">${safeDate(i.next, { month: 'short', day: 'numeric' })}${over ? `<span class="pill over">${kind === 'income' ? 'Confirm' : 'Overdue'}</span>` : ''}</div>`;
};

function billsView() {
  const active = S.bills.filter(b => isActive(b) && b.freq !== 'once');
  const total = monthly(active), ess = monthly(active, b => b.essential);
  const f = ui.billFilter;
  const rows = S.bills.filter(b => f === 'all' || (f === 'essential' ? b.essential : !b.essential)).sort((a, b) => a.next.localeCompare(b.next));
  const nextDue = [...S.bills].sort((a, b) => a.next.localeCompare(b.next))[0];
  return `
  <section class="card stats">
    ${stat('Monthly total', money(total))}${stat('Essential', money(ess))}${stat('Extras', money(total - ess))}
    ${stat('Next due', nextDue ? `${safeDate(nextDue.next, { month: 'short', day: 'numeric' })}<span class="tiny" style="font-weight:500;letter-spacing:0"> · ${esc(nextDue.name)}</span>` : '—')}
  </section>
  <section class="card">
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Filter bills">
        ${[['all', 'All'], ['essential', 'Essential'], ['extras', 'Extras']].map(([k, l]) => `<button data-action="billfilter" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}
      </div>
      <span class="tiny">${rows.length} of ${S.bills.length}</span>
    </div>
    ${rows.length ? `<div class="tablewrap"><table>
      <thead><tr><th>Name</th><th class="hide-sm">Category</th><th class="r">Amount</th><th>Frequency</th><th>Next due</th><th></th></tr></thead>
      <tbody>${rows.map(b => `<tr>
        <td><div class="cell-main">${esc(b.name)}${b.essential ? '<span class="pill ess">Essential</span>' : ''}</div>${b.end ? `<div class="cell-sub">Ends ${safeDate(b.end)}</div>` : ''}</td>
        <td class="hide-sm"><span class="pill">${esc(b.category)}</span></td>
        <td class="r num" style="font-weight:550">${money(b.amount, true)}</td>
        <td>${freqCell(b)}</td>
        <td>${nextCell(b, 'bill')}</td>
        <td>${rowBtns('bill', b.id)}</td>
      </tr>`).join('')}</tbody></table></div>`
      : emptyHTML('bills', S.bills.length ? 'No matching bills' : 'No bills yet', S.bills.length ? 'Try a different filter.' : 'Add rent, insurance, phone, loans, groceries and gas.', S.bills.length ? '' : `<button class="btn primary" data-action="add" data-kind="bill">${ic('plus')}Add bill</button>`)}
  </section>`;
}

function incomeView() {
  const t0 = today();
  const active = S.income.filter(i => isActive(i));
  const next90 = C.upcoming(S, 90, t0).filter(e => e.kind === 'income').reduce((t, e) => t + e.amount, 0);
  const ending = S.income.filter(i => i.end && daysBetween(t0, parse(i.end)) >= 0 && daysBetween(t0, parse(i.end)) <= 90).length;
  const rows = [...S.income].sort((a, b) => a.next.localeCompare(b.next));
  return `
  <section class="card stats">
    ${stat('Monthly income', money(model ? model.incMo : 0))}${stat('Expected next 90 days', money(next90))}${stat('Active sources', active.length)}${stat('Ending within 90 days', ending)}
  </section>
  <section class="card">
    ${rows.length ? `<div class="tablewrap"><table>
      <thead><tr><th>Source</th><th class="r">Amount</th><th>Frequency</th><th>Next payment</th><th class="hide-sm">Ends</th><th></th></tr></thead>
      <tbody>${rows.map(i => `<tr>
        <td><div class="cell-main">${esc(i.name)}${!isActive(i) ? '<span class="pill">Ended</span>' : ''}</div></td>
        <td class="r num in" style="font-weight:550">+${money(i.amount, true)}</td>
        <td>${freqCell(i)}</td>
        <td>${nextCell(i, 'income')}</td>
        <td class="hide-sm">${i.end ? `${safeDate(i.end)}<div class="cell-sub">${Math.max(0, daysBetween(t0, parse(i.end)))} days left</div>` : '<span class="muted">Ongoing</span>'}</td>
        <td>${rowBtns('income', i.id)}</td>
      </tr>`).join('')}</tbody></table></div>`
      : emptyHTML('income', 'No income yet', 'Add unemployment benefits, severance, freelance work or a partner\'s contribution.', `<button class="btn primary" data-action="add" data-kind="income">${ic('plus')}Add income</button>`)}
  </section>
  <div class="callout">${ic('info')}<span>Benefits usually stop after a set number of weeks, so give them an end date. Use “One time” for severance or a tax refund.</span></div>`;
}

function accountsView() {
  const excluded = S.accounts.filter(a => a.include === false).reduce((t, a) => t + a.balance, 0);
  const latest = S.accounts.map(a => a.updated).filter(Boolean).sort().pop();
  return `
  <section class="card stats">
    ${stat('Counted toward runway', money(cashTotal()))}${stat('Not counted', money(excluded))}${stat('Accounts', S.accounts.length)}${stat('Last updated', latest ? safeDate(latest, { month: 'short', day: 'numeric' }) : '—')}
  </section>
  <div class="accts">
    ${S.accounts.map(a => `<div class="card acct ${a.include === false ? 'excluded' : ''}">
      <div class="top"><span class="chip-ico">${ic(a.include === false ? 'eyeoff' : 'bank')}</span><div class="cell-main" style="min-width:0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span></div>${rowBtns('account', a.id)}</div>
      <div class="bal num">${money(a.balance, true)}</div>
      <div class="foot"><span>${a.include === false ? 'Not counted' : 'Counts toward runway'}</span><span>${a.updated ? 'Updated ' + safeDate(a.updated, { month: 'short', day: 'numeric' }) : ''}</span></div>
    </div>`).join('')}
    <button class="acct-add" data-action="add" data-kind="account">${ic('plus')}Add account</button>
  </div>
  <div class="callout">${ic('info')}<span>Include cash you can actually spend: checking, savings, money market. Leave retirement accounts out unless you plan to tap them.</span></div>`;
}

function historyView() {
  const ck = [...S.checkins].reverse();
  const act = [...S.activity].reverse().slice(0, 50);
  return `<div class="row-2">
    <section class="card">
      <div class="card-head" style="padding-bottom:12px"><div><h2>Balance check-ins</h2><div class="sub">Your real total cash over time</div></div></div>
      ${ck.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th class="r">Total cash</th><th class="r">Change</th><th></th></tr></thead><tbody>
        ${ck.map((c, idx) => { const prev = ck[idx + 1], ch = prev ? c.total - prev.total : null;
          return `<tr><td>${safeDate(c.date)}</td><td class="r num" style="font-weight:550">${money(c.total)}</td>
          <td class="r num">${ch == null ? '<span class="muted">—</span>' : `<span class="delta ${ch >= 0 ? 'up' : 'down'}">${signed(ch)}</span>`}</td>
          <td><div class="rowbtns"><button class="btn icon sm ghost danger" data-action="delck" data-date="${esc(c.date)}" aria-label="Delete check-in" title="Delete">${ic('trash')}</button></div></td></tr>`; }).join('')}
      </tbody></table></div>` : emptyHTML('checkin', 'No check-ins yet', 'Log your balances weekly to compare reality with the plan.', `<button class="btn primary" data-action="checkin">${ic('checkin')}Check in</button>`)}
    </section>
    <section class="card">
      <div class="card-head" style="padding-bottom:12px"><div><h2>Recent activity</h2><div class="sub">Bills paid and income received</div></div></div>
      ${act.length ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Item</th><th class="r">Amount</th></tr></thead><tbody>
        ${act.map(a => `<tr><td class="muted">${safeDate(a.date, { month: 'short', day: 'numeric' })}</td><td><div class="cell-main">${esc(a.name)}</div>${a.account ? `<div class="cell-sub">${esc(a.account)}</div>` : ''}</td>
        <td class="r num ${a.amount > 0 ? 'in' : ''}" style="font-weight:550">${a.amount > 0 ? '+' : '−'}${money(Math.abs(a.amount), true)}</td></tr>`).join('')}
      </tbody></table></div>` : emptyHTML('history', 'No activity yet', 'Mark bills paid and income received from the Overview.')}
    </section>
  </div>`;
}

function settingsView() {
  const snaps = readSnapshots().reverse();
  const le = S.settings.lastExport;
  return `
  <section class="card">
    <div class="set-section">
      <div><h2>Projection</h2><div class="desc">How the runway is calculated.</div></div>
      <div class="fields">
        <div class="field"><label for="setCushion">Safety cushion ($)<input type="number" id="setCushion" min="0" step="100" value="${S.settings.cushion}" data-setting="cushion"></label><div class="hint">Runway ends when cash falls below this, not at $0.</div></div>
        <div class="field"><label for="setHorizon">Projection length<select id="setHorizon" data-setting="horizon">${[12, 24, 36].map(m => `<option value="${m}" ${S.settings.horizon === m ? 'selected' : ''}>${m} months</option>`).join('')}</select></label></div>
      </div>
    </div>
    <div class="set-section">
      <div><h2>Backups</h2><div class="desc">An exported file is the only copy that survives clearing your browser. Keep one in cloud storage.</div></div>
      <div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">${le && daysBetween(parse(le), today()) <= 14 ? badge('good', 'Up to date') : badge('warning', le ? 'Overdue' : 'Never exported')}<span class="sub">Last exported ${le ? safeDate(le) : 'never'}</span></div>
        <div class="actions"><button class="btn primary" data-action="export">${ic('download')}Export backup</button><button class="btn" data-action="import">${ic('upload')}Import backup</button></div>
      </div>
    </div>
    <div class="set-section">
      <div><h2>Snapshots</h2><div class="desc">Saved automatically each day you open the app (last ${MAX_AUTO_SNAPSHOTS} kept), and before any erase, import or restore.</div></div>
      <div>${snaps.length ? `<div class="snap-list tablewrap"><table><thead><tr><th>Saved</th><th>Reason</th><th class="hide-sm">Contents</th><th></th></tr></thead><tbody>
        ${snaps.map(s => { const d = s.data || {}; const n = k => (Array.isArray(d[k]) ? d[k].length : 0);
          return `<tr><td>${esc(new Date(s.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td><td>${esc(s.label)}</td>
          <td class="hide-sm muted">${n('accounts')} accounts · ${n('bills')} bills · ${n('income')} income</td>
          <td><div class="rowbtns" style="opacity:1"><button class="btn xs" data-action="restore" data-ts="${s.ts}">Restore</button></div></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="sub">No snapshots yet.</div>'}</div>
    </div>
  </section>
  <section class="card danger-zone">
    <div class="set-section">
      <div><h2>Start over</h2><div class="desc">A snapshot is saved first, so either action can be undone from Snapshots.</div></div>
      <div class="actions" style="align-content:start"><button class="btn" data-action="sample">Load sample data</button><button class="btn danger-solid" data-action="reset">${ic('trash')}Erase all data</button></div>
    </div>
  </section>`;
}

function welcomeHTML() {
  return `<section class="card welcome fade">
    <span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 17c3-.8 5.5-3 7-6s3.2-5 6.5-5"/><path d="M4 21h16"/></svg></span>
    <h2>Know exactly how long your money lasts</h2>
    <p>Runway projects your balance day by day from your real bills and income, so you always know your number while you're between jobs.</p>
    <div class="steps">
      <div class="step"><div class="n">1</div><b>Add your accounts</b><span>Checking and savings you can spend.</span></div>
      <div class="step"><div class="n">2</div><b>List your bills</b><span>Rent, insurance, groceries, loans.</span></div>
      <div class="step"><div class="n">3</div><b>Add money coming in</b><span>Benefits, severance, freelance work.</span></div>
    </div>
    <div class="actions">
      <button class="btn primary" data-action="add" data-kind="account">${ic('plus')}Add your first account</button>
      <button class="btn" data-action="sample">Explore with sample data</button>
      <button class="btn ghost" data-action="import">${ic('upload')}Import a backup</button>
    </div>
    ${readSnapshots().length ? `<p class="sub" style="margin-top:18px">Looking for earlier data? <button class="btn xs" data-action="restore-latest">Restore latest snapshot</button></p>` : ''}
  </section>`;
}

/* =====================================================================
 * Chart
 * ===================================================================== */
function niceStep(range, target) {
  const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function drawChart(all, ess, range) {
  const box = document.getElementById('chartBox');
  if (!box) return;
  const W = Math.max(280, box.clientWidth || 300), Hh = W < 560 ? 230 : 300;
  const M = { l: 48, r: W < 560 ? 8 : 92, t: 16, b: 28 };
  const t0 = today();
  const days = Math.max(1, Math.min(all.bal.length - 1, Math.round(range * MONTH)));
  const cks = S.checkins.map(c => ({ d: daysBetween(t0, parse(c.date)), v: c.total })).filter(c => c.d >= -183 && c.d <= 0);
  const dMin = cks.length ? Math.min(0, ...cks.map(c => c.d)) : 0;

  let lo = Math.min(S.settings.cushion, 0), hi = Math.max(S.settings.cushion, 0);
  for (let d = 0; d <= days; d++) { lo = Math.min(lo, all.bal[d], ess.bal[d]); hi = Math.max(hi, all.bal[d], ess.bal[d]); }
  cks.forEach(c => { lo = Math.min(lo, c.v); hi = Math.max(hi, c.v); });
  if (hi - lo < 1) hi = lo + 1000;
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;

  const x = d => M.l + (d - dMin) / (days - dMin) * (W - M.l - M.r);
  const y = v => M.t + (hi - v) / (hi - lo) * (Hh - M.t - M.b);
  const path = bal => { let p = ''; for (let d = 0; d <= days; d++) p += (d ? 'L' : 'M') + x(d).toFixed(1) + ' ' + y(bal[d]).toFixed(1); return p; };
  const base = y(Math.max(lo, Math.min(hi, 0)));

  let g = `<defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="var(--s1)" stop-opacity=".16"/><stop offset="100%" stop-color="var(--s1)" stop-opacity="0"/></linearGradient></defs>`;
  for (let v = lo; v <= hi + step / 2; v += step) {
    g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>
          <text x="${M.l - 10}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${compact(v)}</text>`;
  }
  const totalMonths = Math.ceil((days - dMin) / MONTH);
  const every = W < 560 ? (totalMonths > 12 ? 6 : 3) : (totalMonths > 18 ? 3 : totalMonths > 9 ? 2 : 1);
  const startD = addDays(t0, dMin);
  let mt = new Date(startD.getFullYear(), startD.getMonth() + 1, 1), idx = 0;
  while (daysBetween(t0, mt) <= days && idx < 600) {
    if (idx % every === 0) {
      const xd = x(daysBetween(t0, mt));
      const lab = mt.getMonth() === 0 || idx === 0 ? mt.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : mt.toLocaleDateString(undefined, { month: 'short' });
      g += `<text x="${xd}" y="${Hh - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${lab}</text>`;
    }
    mt = new Date(mt.getFullYear(), mt.getMonth() + 1, 1); idx++;
  }
  if (lo <= 0 && hi >= 0) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--axis)" stroke-width="1"/>`;
  if (S.settings.cushion) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(S.settings.cushion)}" y2="${y(S.settings.cushion)}" stroke="var(--faint)" stroke-width="1.25" stroke-dasharray="4 4"/>`;
  if (dMin < 0) g += `<line x1="${x(0)}" x2="${x(0)}" y1="${M.t}" y2="${Hh - M.b}" stroke="var(--axis)" stroke-dasharray="2 3"/><text x="${x(0) + 6}" y="${M.t + 4}" font-size="11" font-weight="500" fill="var(--muted)">Today</text>`;

  g += `<path d="${path(all.bal)}L${x(days).toFixed(1)} ${base}L${x(0).toFixed(1)} ${base}Z" fill="url(#areaFill)" stroke="none"/>`;
  g += `<path d="${path(ess.bal)}" fill="none" stroke="var(--s2)" stroke-width="2" stroke-linejoin="round"/>`;
  g += `<path d="${path(all.bal)}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round"/>`;
  if (cks.length) {
    const pts = [...cks].sort((a, b) => a.d - b.d);
    if (pts.length > 1) g += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + x(p.d) + ' ' + y(p.v)).join('')}" fill="none" stroke="var(--s3)" stroke-width="2"/>`;
    pts.forEach(p => { g += `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="4" fill="var(--s3)" stroke="var(--surface)" stroke-width="2"/>`; });
  }
  const mark = (sim, col, below) => {
    if (sim.out < 0 || sim.out > days) return '';
    const cx = x(sim.out), cy = y(sim.bal[sim.out]);
    const label = `Out ${fmtDate(addDays(t0, sim.out), { month: 'short', day: 'numeric' })}`;
    const w = label.length * 6.2 + 14, ty = below ? cy + 12 : cy - 30;
    const lx = Math.max(M.l, Math.min(W - M.r - w, cx - w / 2));
    return `<circle cx="${cx}" cy="${cy}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>
      <rect x="${lx}" y="${ty}" width="${w}" height="18" rx="5" fill="var(--surface)" stroke="var(--border)"/>
      <text x="${lx + w / 2}" y="${ty + 12.5}" text-anchor="middle" font-size="11" font-weight="600" fill="var(--ink)">${label}</text>`;
  };
  g += mark(all, 'var(--s1)', false);
  if (ess.out !== all.out) g += mark(ess, 'var(--s2)', true);
  if (M.r > 40) {
    let ya = y(all.bal[days]), ye = y(ess.bal[days]);
    if (Math.abs(ya - ye) < 28) { const mid = (ya + ye) / 2, s = ya <= ye ? -1 : 1; ya = mid + s * 14; ye = mid - s * 14; }
    g += `<text x="${W - M.r + 10}" y="${ya - 2}" font-size="11" fill="var(--muted)">All bills</text><text x="${W - M.r + 10}" y="${ya + 12}" font-size="12" font-weight="600" fill="var(--ink)">${compact(all.bal[days])}</text>`;
    g += `<text x="${W - M.r + 10}" y="${ye - 2}" font-size="11" fill="var(--muted)">Essentials</text><text x="${W - M.r + 10}" y="${ye + 12}" font-size="12" font-weight="600" fill="var(--ink)">${compact(ess.bal[days])}</text>`;
  }
  g += `<g id="hover" style="display:none"><line id="hx" y1="${M.t}" y2="${Hh - M.b}" stroke="var(--border-strong)" stroke-width="1"/>
        <circle id="ha" r="4.5" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"/><circle id="he" r="4.5" fill="var(--s2)" stroke="var(--surface)" stroke-width="2"/></g>
        <rect id="hit" x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${Hh - M.t - M.b}" fill="transparent"/>`;

  box.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Projected cash balance over ${range} months">${g}</svg><div class="tip" id="tip"></div>`;
  const svg = box.querySelector('svg'), tip = box.querySelector('#tip'), hov = svg.querySelector('#hover');
  const hx = svg.querySelector('#hx'), ha = svg.querySelector('#ha'), he = svg.querySelector('#he');
  const move = ev => {
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
    const d = Math.max(dMin, Math.min(days, Math.round(dMin + (px - M.l) / (W - M.l - M.r) * (days - dMin))));
    let rows = '';
    if (d >= 0) {
      hov.style.display = '';
      hx.setAttribute('x1', x(d)); hx.setAttribute('x2', x(d));
      ha.setAttribute('cx', x(d)); ha.setAttribute('cy', y(all.bal[d]));
      he.setAttribute('cx', x(d)); he.setAttribute('cy', y(ess.bal[d]));
      rows = `<div class="row"><span><i style="background:var(--s1)"></i>All bills</span><b class="num">${money(all.bal[d])}</b></div>
              <div class="row"><span><i style="background:var(--s2)"></i>Essentials only</span><b class="num">${money(ess.bal[d])}</b></div>`;
    } else {
      hov.style.display = 'none';
      const near = cks.reduce((b, c) => (Math.abs(c.d - d) < Math.abs(b.d - d) ? c : b), cks[0]);
      if (near) rows = `<div class="row"><span><i style="background:var(--s3)"></i>Check-in ${fmtDate(addDays(t0, near.d), { month: 'short', day: 'numeric' })}</span><b class="num">${money(near.v)}</b></div>`;
    }
    tip.innerHTML = `<div class="t">${fmtDate(addDays(t0, d), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>${rows}`;
    tip.style.display = 'block';
    const bx = box.getBoundingClientRect(), tx = ev.clientX - bx.left;
    tip.style.top = '4px';
    tip.style.left = (tx + 16 + tip.offsetWidth > bx.width ? Math.max(0, tx - tip.offsetWidth - 16) : tx + 16) + 'px';
  };
  const hit = svg.querySelector('#hit');
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { hov.style.display = 'none'; tip.style.display = 'none'; });
}

/* =====================================================================
 * Dialogs and validation
 * ===================================================================== */
const dlg = document.getElementById('dlg'), form = document.getElementById('dlgForm');
let onSubmit = null;
function openDialog(title, fieldsHTML, submitLabel, handler, subtitle = '') {
  form.innerHTML = `<div class="dlg-head"><div><h3>${title}</h3>${subtitle ? `<div class="sub">${subtitle}</div>` : ''}</div><button type="button" class="btn icon sm ghost" data-close aria-label="Close">${ic('x')}</button></div>
    <div class="dlg-body">${fieldsHTML}<div class="form-error" role="alert" hidden></div></div>
    <div class="dlg-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" value="ok">${submitLabel}</button></div>`;
  onSubmit = handler;
  if (dlg.open) dlg.close();
  dlg.showModal();
  const first = form.querySelector('.dlg-body input, .dlg-body select');
  if (first) first.focus();
}
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!onSubmit) return;
  const fd = Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll('input[type=checkbox]').forEach(c => { fd[c.name] = c.checked; });
  const before = JSON.stringify(S);
  let res;
  try { res = onSubmit(fd) || {}; } catch (err) { console.error(err); res = { error: 'Something went wrong saving that. Nothing was changed.' }; S = C.normalizeState(JSON.parse(before)).state; }
  if (res.error) {
    const el = form.querySelector('.form-error');
    el.textContent = res.error; el.hidden = false;
    if (res.field) { const f = form.querySelector(`[name="${res.field}"]`); if (f) f.focus(); }
    return;
  }
  dlg.close();
  render();
  if (res.label) toast(res.label, () => { S = C.normalizeState(JSON.parse(before)).state; render(); toast('Undone.'); });
});
form.addEventListener('click', e => { if (e.target.closest('[data-close]')) dlg.close(); });

const fld = (label, inner, hint) => `<div class="field"><label>${label}${inner}</label>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
const freqSelect = v => `<select name="freq">${Object.entries(FREQ).map(([k, f]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${f.label}</option>`).join('')}</select>`;
const CATS = ['Housing', 'Utilities', 'Insurance', 'Health', 'Food', 'Transportation', 'Debt', 'Phone & internet', 'Subscriptions', 'Childcare', 'Personal', 'Other'];

/** Parse a money field. Returns a number, or null when invalid. */
function amountOf(v, { allowNegative = false, allowZero = true } = {}) {
  const n = finite(String(v ?? '').replace(/[$,\s]/g, ''), NaN);
  if (!Number.isFinite(n) || Math.abs(n) > 1e9) return null;
  if (!allowNegative && n < 0) return null;
  if (!allowZero && n === 0) return null;
  return round2(n);
}
/** Validate the fields shared by bills and income. */
function validateFlow(fd) {
  const name = String(fd.name || '').trim().slice(0, 120);
  if (!name) return { error: 'Give it a name.', field: 'name' };
  const amount = amountOf(fd.amount, { allowZero: false });
  if (amount === null) return { error: 'Enter an amount greater than $0.', field: 'amount' };
  if (!FREQ[fd.freq]) return { error: 'Choose how often.', field: 'freq' };
  if (!isISODate(fd.next)) return { error: 'Enter a valid date.', field: 'next' };
  const end = fd.end || '';
  if (end && !isISODate(end)) return { error: 'Enter a valid end date, or leave it blank.', field: 'end' };
  if (end && end < fd.next) return { error: 'The last payment date can\'t be before the next date.', field: 'end' };
  return { ok: { name, amount, freq: fd.freq, next: fd.next, end } };
}
function anchorFor(prev, next, freq) {
  if (!['monthly', 'quarterly', 'annual'].includes(freq)) return undefined;
  if (prev && prev.next === next && prev.freq === freq && prev.anchorDay) return prev.anchorDay;
  return parse(next).getDate();
}
function upsert(list, prev, rec) {
  if (rec.anchorDay === undefined) delete rec.anchorDay;
  const i = prev ? list.findIndex(x => x.id === prev.id) : -1;
  if (i >= 0) list[i] = rec; else list.push(rec);
}

function editBill(b) {
  const isNew = !b;
  const v = b || { name: '', amount: '', freq: 'monthly', next: iso(today()), category: 'Housing', essential: true, end: '' };
  const cats = [...new Set([...CATS, ...S.bills.map(x => x.category)])];
  openDialog(isNew ? 'Add bill or expense' : 'Edit bill', `
    ${fld('Name', `<input type="text" name="name" required maxlength="120" value="${esc(v.name)}" placeholder="Rent, car insurance, groceries…">`)}
    <div class="row2">
      ${fld('Amount ($)', `<input type="text" inputmode="decimal" name="amount" required value="${esc(v.amount)}" placeholder="0.00">`)}
      ${fld('How often', freqSelect(v.freq))}
    </div>
    <div class="row2">
      ${fld('Next due date', `<input type="date" name="next" required value="${esc(v.next)}">`)}
      ${fld('Category', `<input type="text" name="category" maxlength="40" list="catList" value="${esc(v.category)}"><datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`)}
    </div>
    ${fld('Last payment (optional)', `<input type="date" name="end" value="${esc(v.end || '')}">`, 'For loans or plans that end, like a car payment.')}
    <label class="check"><input type="checkbox" name="essential" ${v.essential ? 'checked' : ''}> Essential: I'd keep paying this even in a bare-bones budget</label>
  `, isNew ? 'Add bill' : 'Save', fd => {
    const r = validateFlow(fd);
    if (r.error) return r;
    upsert(S.bills, b, { id: b ? b.id : C.uid(), ...r.ok, anchorDay: anchorFor(b, r.ok.next, r.ok.freq), category: String(fd.category || '').trim().slice(0, 40) || 'Other', essential: !!fd.essential });
    return { label: isNew ? `Added ${r.ok.name}.` : `Saved ${r.ok.name}.` };
  });
}
function editIncome(i) {
  const isNew = !i;
  const v = i || { name: '', amount: '', freq: 'weekly', next: iso(today()), end: '' };
  openDialog(isNew ? 'Add money coming in' : 'Edit income', `
    ${fld('Source', `<input type="text" name="name" required maxlength="120" value="${esc(v.name)}" placeholder="Unemployment benefits, severance, freelance…">`)}
    <div class="row2">
      ${fld('Amount ($, after tax)', `<input type="text" inputmode="decimal" name="amount" required value="${esc(v.amount)}" placeholder="0.00">`)}
      ${fld('How often', freqSelect(v.freq))}
    </div>
    <div class="row2">
      ${fld('Next payment date', `<input type="date" name="next" required value="${esc(v.next)}">`)}
      ${fld('Last payment (optional)', `<input type="date" name="end" value="${esc(v.end || '')}">`)}
    </div>
    <div class="hint">Unemployment benefits usually stop after a set number of weeks, so give them an end date. Use "One time" for severance or a tax refund.</div>
  `, isNew ? 'Add income' : 'Save', fd => {
    const r = validateFlow(fd);
    if (r.error) return r;
    upsert(S.income, i, { id: i ? i.id : C.uid(), ...r.ok, anchorDay: anchorFor(i, r.ok.next, r.ok.freq) });
    return { label: isNew ? `Added ${r.ok.name}.` : `Saved ${r.ok.name}.` };
  });
}
function editAccount(a) {
  const isNew = !a;
  const v = a || { name: '', balance: '', include: true };
  openDialog(isNew ? 'Add account' : 'Edit account', `
    ${fld('Account name', `<input type="text" name="name" required maxlength="120" value="${esc(v.name)}" placeholder="Checking, high-yield savings…">`)}
    ${fld('Current balance ($)', `<input type="text" inputmode="decimal" name="balance" required value="${esc(v.balance)}" placeholder="0.00">`, 'Use a minus sign if the account is overdrawn.')}
    <label class="check"><input type="checkbox" name="include" ${v.include !== false ? 'checked' : ''}> Count this toward my runway</label>
  `, isNew ? 'Add account' : 'Save', fd => {
    const name = String(fd.name || '').trim().slice(0, 120);
    if (!name) return { error: 'Give the account a name.', field: 'name' };
    const balance = amountOf(fd.balance, { allowNegative: true });
    if (balance === null) return { error: 'Enter the balance as a number, like 2500 or 2,500.00.', field: 'balance' };
    upsert(S.accounts, a, { id: a ? a.id : C.uid(), name, balance, include: !!fd.include, updated: iso(today()) });
    return { label: isNew ? `Added ${name}.` : `Saved ${name}.` };
  });
}
function checkinDialog() {
  if (!S.accounts.length) { editAccount(); return; }
  openDialog('Balance check-in', `
    <p class="sub" style="margin-top:-6px">Enter what each account shows right now. This updates your balances and records a data point.</p>
    ${S.accounts.map(a => fld(esc(a.name) + (a.include === false ? ' <span class="muted">(not counted)</span>' : ''), `<input type="text" inputmode="decimal" name="acc_${esc(a.id)}" value="${a.balance}">`)).join('')}
  `, 'Save check-in', fd => {
    const vals = {};
    for (const a of S.accounts) {
      const v = amountOf(fd['acc_' + a.id], { allowNegative: true });
      if (v === null) return { error: `Enter a number for ${a.name}.`, field: 'acc_' + a.id };
      vals[a.id] = v;
    }
    const d = iso(today());
    S.accounts.forEach(a => { a.balance = vals[a.id]; a.updated = d; });
    S.checkins = S.checkins.filter(c => c.date !== d);
    S.checkins.push({ date: d, total: cashTotal() });
    S.checkins.sort((x, y) => x.date.localeCompare(y.date));
    return { label: `Check-in saved: ${money(cashTotal())}.` };
  });
}
function settle(kind, id) {
  const list = listFor(kind), item = list.find(x => x.id === id);
  if (!item) return;
  const counted = S.accounts.filter(a => a.include !== false);
  const accs = counted.length ? counted : S.accounts;
  const nxt = C.nextAfter(item);
  openDialog(kind === 'bill' ? `Mark “${esc(item.name)}” paid` : `Mark “${esc(item.name)}” received`, `
    <div class="row2">
      ${fld('Amount ($)', `<input type="text" inputmode="decimal" name="amount" value="${item.amount}">`)}
      ${fld('Date', `<input type="date" name="date" value="${iso(today())}">`)}
    </div>
    ${accs.length ? fld(kind === 'bill' ? 'Paid from' : 'Deposited to', `<select name="acc">${accs.map(a => `<option value="${esc(a.id)}">${esc(a.name)} (${money(a.balance)})</option>`).join('')}<option value="">Don't change any balance</option></select>`) : ''}
    <div class="hint">The next date moves to ${nxt ? fmtDate(parse(nxt)) : '(none: this item is finished and will be removed)'}.</div>
  `, kind === 'bill' ? 'Mark paid' : 'Mark received', fd => {
    const amt = amountOf(fd.amount);
    if (amt === null) return { error: 'Enter the amount as a number.', field: 'amount' };
    if (!isISODate(fd.date)) return { error: 'Enter a valid date.', field: 'date' };
    if (!list.includes(item)) return { error: 'This item was changed or removed (maybe in another tab). Close and try again.' };
    const acc = S.accounts.find(a => a.id === fd.acc);
    if (acc) { acc.balance = round2(acc.balance + (kind === 'bill' ? -amt : amt)); acc.updated = iso(today()); }
    S.activity.push({ date: fd.date, name: item.name, amount: kind === 'bill' ? -amt : amt, account: acc ? acc.name : '' });
    if (S.activity.length > C.MAX_ACTIVITY) S.activity = S.activity.slice(-C.MAX_ACTIVITY);
    const n = C.nextAfter(item);
    if (n) item.next = n; else list.splice(list.indexOf(item), 1);
    return { label: `${item.name} marked ${kind === 'bill' ? 'paid' : 'received'}.` };
  });
}

/* =====================================================================
 * Sample data
 * ===================================================================== */
function sampleState() {
  const t = today(), d = n => iso(addDays(t, n));
  const nextDom = dom => { let x = new Date(t.getFullYear(), t.getMonth(), dom); if (x < t) x = new Date(t.getFullYear(), t.getMonth() + 1, dom); return iso(x); };
  const inMonths = m => iso(C.addMonths(t, m));
  const s = {
    settings: { cushion: 1000 },
    accounts: [
      { name: 'Checking', balance: 4850, updated: d(0) },
      { name: 'High-yield savings', balance: 21500, updated: d(0) },
      { name: '401(k)', balance: 62000, include: false, updated: d(0) }
    ],
    bills: [
      { name: 'Rent', amount: 1950, freq: 'monthly', next: nextDom(1), category: 'Housing', essential: true },
      { name: 'Electric & gas', amount: 165, freq: 'monthly', next: nextDom(12), category: 'Utilities', essential: true },
      { name: 'Internet', amount: 70, freq: 'monthly', next: nextDom(18), category: 'Phone & internet', essential: true },
      { name: 'Phone', amount: 85, freq: 'monthly', next: nextDom(22), category: 'Phone & internet', essential: true },
      { name: 'Health insurance (COBRA)', amount: 640, freq: 'monthly', next: nextDom(1), category: 'Insurance', essential: true },
      { name: 'Car payment', amount: 389, freq: 'monthly', next: nextDom(15), category: 'Transportation', essential: true, end: inMonths(14) },
      { name: 'Car insurance', amount: 132, freq: 'monthly', next: nextDom(8), category: 'Insurance', essential: true },
      { name: 'Gas', amount: 60, freq: 'biweekly', next: d(3), category: 'Transportation', essential: true },
      { name: 'Groceries', amount: 140, freq: 'weekly', next: d(2), category: 'Food', essential: true },
      { name: 'Student loan', amount: 285, freq: 'monthly', next: nextDom(25), category: 'Debt', essential: true },
      { name: 'Eating out', amount: 180, freq: 'monthly', next: nextDom(28), category: 'Food', essential: false },
      { name: 'Streaming services', amount: 48, freq: 'monthly', next: nextDom(5), category: 'Subscriptions', essential: false },
      { name: 'Gym', amount: 55, freq: 'monthly', next: nextDom(3), category: 'Personal', essential: false },
      { name: 'Renters insurance', amount: 168, freq: 'annual', next: inMonths(4), category: 'Insurance', essential: true }
    ],
    income: [
      { name: 'Unemployment benefits', amount: 520, freq: 'weekly', next: d(4), end: d(4 + 7 * 20) },
      { name: 'Freelance project', amount: 1200, freq: 'monthly', next: nextDom(20), end: inMonths(3) },
      { name: 'Tax refund', amount: 1400, freq: 'once', next: inMonths(5) }
    ]
  };
  const tot = 4850 + 21500;
  s.checkins = [{ date: d(-42), total: tot + 4100 }, { date: d(-28), total: tot + 2600 }, { date: d(-14), total: tot + 1350 }, { date: d(0), total: tot }];
  s.settings.lastExport = d(0);
  return C.normalizeState(s).state;
}

/* =====================================================================
 * Backup import / export / restore
 * ===================================================================== */
function exportBackup() {
  S.settings.lastExport = iso(today());
  persist();
  const payload = { app: 'runway-tracker', exportedAt: new Date().toISOString(), ...S };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `runway-backup-${iso(today())}.json`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  render();
  toast('Backup downloaded. Keep it somewhere safe, like cloud storage.');
}
async function importBackup(file) {
  if (file.size > MAX_IMPORT_BYTES) { alert('That file is too large to be a Runway Tracker backup.'); return; }
  let parsed;
  try { parsed = C.normalizeState(JSON.parse(await file.text())); }
  catch (err) { alert('Could not import: this is not a valid Runway Tracker backup.'); return; }
  const { state, warnings } = parsed;
  if (!hasData(state)) { alert('That backup has no accounts, bills or income in it. Nothing was imported.'); return; }
  const msg = `Replace your current data with this backup?\n\n${state.accounts.length} accounts, ${state.bills.length} bills, ${state.income.length} income sources.` +
    (warnings.length ? `\n\n${warnings.length} problem(s) will be repaired:\n• ${warnings.slice(0, 5).join('\n• ')}` : '') +
    (hasData(S) ? '\n\nA snapshot of your current data is saved first.' : '');
  if (!confirm(msg)) return;
  snapshot('Before import', S);
  commit('Backup imported.', () => { S = state; });
}
function restoreSnapshot(snap) {
  if (!snap) { toast('No snapshot found.'); return; }
  let st;
  try { st = C.normalizeState(snap.data).state; } catch (e) { alert('That snapshot is damaged and cannot be restored.'); return; }
  if (hasData(S) && !confirm(`Restore the snapshot from ${new Date(snap.ts).toLocaleString()}? Your current data is saved as a snapshot first.`)) return;
  snapshot('Before restore', S);
  commit('Snapshot restored.', () => { S = st; });
}

/* =====================================================================
 * Events
 * ===================================================================== */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action, kind = el.dataset.kind, id = el.dataset.id;
  const find = () => listFor(kind).find(x => x.id === id);
  const editors = { bill: editBill, income: editIncome, account: editAccount };
  switch (a) {
    case 'add': editors[kind](); break;
    case 'edit': { const it = find(); if (it) editors[kind](it); break; }
    case 'del': {
      const it = find(); if (!it) return;
      commit(`Deleted ${it.name}.`, () => { const l = listFor(kind); l.splice(l.indexOf(it), 1); });
      break;
    }
    case 'settle': settle(kind, id); break;
    case 'skip': {
      const it = find(); if (!it) return;
      const n = C.nextAfter(it);
      commit(n ? `${it.name} moved to ${fmtDate(parse(n))}.` : `${it.name} removed (no later date).`, () => {
        if (n) it.next = n; else { const l = listFor(kind); l.splice(l.indexOf(it), 1); }
      });
      break;
    }
    case 'checkin': checkinDialog(); break;
    case 'delck': commit('Check-in deleted.', () => { S.checkins = S.checkins.filter(c => c.date !== el.dataset.date); }); break;
    case 'tab': if (VIEWS[el.dataset.tab]) { ui.view = el.dataset.tab; render(); window.scrollTo({ top: 0 }); } break;
    case 'billfilter': ui.billFilter = el.dataset.f; render(); break;
    case 'range': ui.range = +el.dataset.m; render(); break;
    case 'sample':
      if (hasData(S) && !confirm('Replace your current data with sample data? A snapshot of your data is saved first.')) return;
      snapshot('Before sample data', S);
      commit(hasData(S) ? 'Sample data loaded.' : '', () => { S = sampleState(); ui.view = 'overview'; });
      break;
    case 'reset':
      if (!confirm('Erase all accounts, bills, income and history? A snapshot is saved first, so you can restore it from Settings.')) return;
      snapshot('Before erase', S);
      commit('All data erased.', () => { S = C.blank(); ui.view = 'overview'; });
      break;
    case 'export': exportBackup(); break;
    case 'import': document.getElementById('importFile').click(); break;
    case 'restore': restoreSnapshot(readSnapshots().find(s => String(s.ts) === el.dataset.ts)); break;
    case 'restore-latest': restoreSnapshot(readSnapshots().pop()); break;
    case 'reload': location.reload(); break;
    case 'dismiss-notice': loadNotices.splice(+el.dataset.i, 1); renderBanners(); break;
    case 'theme': {
      const r = document.documentElement;
      const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      r.dataset.theme = dark ? 'light' : 'dark';
      try { ls.set(THEME_KEY, r.dataset.theme); } catch (er) {}
      render(); break;
    }
  }
});
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.setting;
  if (!k) return;
  const v = finite(e.target.value, NaN);
  if (k === 'targetMonths') S.settings.targetMonths = Number.isFinite(v) ? Math.max(1, Math.min(60, Math.round(v))) : 12;
  else if (k === 'cushion') S.settings.cushion = Number.isFinite(v) ? round2(Math.max(0, Math.min(1e9, v))) : 0;
  else if (k === 'horizon') S.settings.horizon = [12, 24, 36].includes(v) ? v : 24;
  render();
});
document.getElementById('importFile').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) importBackup(f);
});

/* Keep tabs in sync: another tab saved, so adopt its data. */
window.addEventListener('storage', e => {
  if (e.key !== KEY || e.newValue == null) return;
  try {
    S = C.normalizeState(JSON.parse(e.newValue)).state;
    if (dlg.open) dlg.close();
    model = hasData(S) ? computeModel() : null; renderShell(); renderView(); renderBanners();
    toast('Updated with changes from another tab.');
  } catch (err) {}
});

/* Roll over at midnight, or when returning to a tab left open for days. */
const checkDay = () => { if (iso(today()) !== renderedDay && !dlg.open) render(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
setInterval(checkDay, 60000);

let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { try { if (ui.view === 'overview' && model) drawChart(model.all, model.ess, chartRange()); } catch (err) {} }, 150); });
window.addEventListener('error', ev => { console.error(ev.error || ev.message); toast('Something went wrong. Your data is saved; try reloading if things look off.'); });
window.addEventListener('unhandledrejection', ev => { console.error(ev.reason); });

try { const th = ls.get(THEME_KEY); if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th; } catch (e) {}
snapshot('Daily auto-save', S, { daily: true });
render();
})();
