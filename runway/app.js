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
  if (u && ['overview', 'bills', 'income', 'accounts', 'whatif', 'history', 'settings'].includes(u.view)) ui.view = u.view;
  if (u && [6, 12, 24, 36].includes(u.range)) ui.range = u.range;
  if (u && ['all', 'essential', 'extras'].includes(u.billFilter)) ui.billFilter = u.billFilter;
} catch (e) {}

/* Change tracking for sync: when the data last changed on this device, and
   which of those changes the cloud copy already has. Data saved before sync
   existed gets a stamp of 1, so any real cloud copy counts as newer, while
   still marking it as unsynced so it is snapshotted before being replaced. */
let lastPersistedJSON = JSON.stringify(S);
let localUpdatedAt = finite(Number(ls.get(KEY + '.updatedAt')), 0) || (hasData(S) ? 1 : 0);
let syncedAt = finite(Number(ls.get(KEY + '.syncedAt')), 0);
let applyingRemote = false;
function setStamp(k, v) { try { ls.set(KEY + '.' + k, String(v)); } catch (e) {} }

function persist() {
  const json = JSON.stringify(S);
  if (json !== lastPersistedJSON) {
    lastPersistedJSON = json;
    if (!applyingRemote) {
      localUpdatedAt = Date.now();
      setStamp('updatedAt', localUpdatedAt);
      scheduleCloudPush();
    }
  }
  try {
    ls.set(KEY, json);
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
 * Icons (24px grid, stroke) and category styling
 * ===================================================================== */
const ICON_PATHS = {
  overview: '<rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/>',
  bills: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  income: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  down: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  accounts: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  download: '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M5 21h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  checkin: '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  edit: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  skip: '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  dollar: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  bolt: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  tv: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
  bank: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  cloudcheck: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="m9 13.5 2 2 4-4"/>',
  cloudoff: '<path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>'
};
const ic = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
const tile = (icon, color, cls = '') => `<span class="tile ${cls}" style="background:var(--${color})">${ic(icon)}</span>`;

const CAT_STYLE = {
  'housing': ['house', 'blue'], 'utilities': ['bolt', 'yellow'], 'insurance': ['shield', 'indigo'],
  'health': ['heart', 'pink'], 'food': ['cart', 'orange'], 'transportation': ['car', 'teal'],
  'debt': ['accounts', 'red'], 'phone & internet': ['phone', 'green'], 'subscriptions': ['tv', 'purple'],
  'childcare': ['smile', 'mint'], 'personal': ['user', 'pink'], 'other': ['tag', 'gray']
};
const catTile = (category, cls = '') => { const [i, c] = CAT_STYLE[String(category).toLowerCase()] || ['tag', 'gray']; return tile(i, c, cls); };

/* =====================================================================
 * Toast (HUD) with undo
 * ===================================================================== */
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg, undoFn) {
  clearTimeout(toastTimer);
  toastEl.hidden = true;
  void toastEl.offsetWidth;   // restart the entrance animation
  toastEl.innerHTML = `${ic('check')}<span>${esc(msg)}</span>${undoFn ? '<button type="button" data-undo>Undo</button>' : ''}`;
  toastEl.hidden = false;
  const btn = toastEl.querySelector('[data-undo]');
  if (btn) btn.onclick = () => { toastEl.hidden = true; undoFn(); };
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, undoFn ? 10000 : 3500);
}
/** Run a change; offer to undo it. `fn` returning false cancels. */
function commit(label, fn) {
  const before = JSON.stringify(S);
  if (fn() === false) return false;
  render();
  if (label) toast(label, () => { S = C.normalizeState(JSON.parse(before)).state; render(); toast('Undone'); });
  return true;
}

/* =====================================================================
 * Render: shell + current view
 * ===================================================================== */
const VIEWS = {
  overview: { title: 'Summary', short: 'Summary', icon: 'overview' },
  bills:    { title: 'Bills', short: 'Bills', icon: 'bills' },
  income:   { title: 'Income', short: 'Income', icon: 'income' },
  accounts: { title: 'Accounts', short: 'Accounts', icon: 'accounts' },
  whatif:   { title: 'What If', short: 'What If', icon: 'sparkles' },
  history:  { title: 'History', short: 'History', icon: 'history', nav: false },
  settings: { title: 'Settings', short: 'Settings', icon: 'settings' }
};
let renderedDay = '';
let lastView = '';
let model = null;

function computeModel() {
  const t0 = today();
  const H = Math.round(S.settings.horizon * MONTH);
  return {
    all: C.simulate(S, { days: H }, t0),
    ess: C.simulate(S, { essentialOnly: true, days: H }, t0),
    billsMo: monthly(S.bills, b => b.freq !== 'once' && isActive(b)),
    essMo: monthly(S.bills, b => b.freq !== 'once' && b.essential && isActive(b)),
    incMo: monthly(S.income, i => i.freq !== 'once' && isActive(i)),
    cardMin: C.monthlyMinimums(S),
    cred: C.creditSummary(S).cards ? C.creditProjection(S, { days: H }, t0) : null
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
    app.innerHTML = `<div class="welcome">
      <span class="tile" style="background:var(--red);width:64px;height:64px;border-radius:16px;margin:0 auto 20px">${ic('alert')}</span>
      <h2>Something Went Wrong</h2>
      <p class="l2" style="margin-top:10px">Your data is still saved. Export a backup, then restore a snapshot or reload.</p>
      <p class="l3" style="margin-top:8px;font-size:13px">${esc(err && err.message)}</p>
      <div class="more" style="margin-top:24px">
        <button class="btn primary" data-action="export">Export Backup</button>
        <button class="btn" data-action="restore-latest">Restore Snapshot</button>
        <button class="btn" data-action="reload">Reload</button>
      </div></div>`;
  }
}

function renderShell() {
  const counts = { bills: S.bills.length, income: S.income.length, accounts: S.accounts.length };
  const current = ui.view === 'history' ? 'accounts' : ui.view;
  document.getElementById('nav').innerHTML = Object.entries(VIEWS).filter(([, v]) => v.nav !== false).map(([k, v]) =>
    `<button data-action="tab" data-tab="${k}" ${current === k ? 'aria-current="page"' : ''} aria-label="${v.title}">${ic(v.icon)}<span class="long">${v.title}</span><span class="short">${v.short}</span>${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('');

  const side = document.getElementById('sideStatus');
  if (model) {
    const r = runwayText(model.all), st = statusOf(model.all);
    side.innerHTML = `<div class="side-widget">${ringSVG(goalPct(model.all), st.color, 40, 5)}<div><div class="k">Runway</div><div class="v">${r.big} <small>${r.unit === 'months' ? 'mo' : r.unit}</small></div></div></div>`;
  } else side.innerHTML = '';

  document.getElementById('pageTitle').textContent = VIEWS[ui.view].title;
  document.getElementById('pageSub').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const exportBtn = `<button class="btn round" data-action="export" aria-label="Export backup" title="Export Backup">${ic('download')}</button>`;
  const checkin = `<button class="btn primary has-lbl" data-action="checkin" title="Check In">${ic('checkin')}<span class="lbl">Check In</span></button>`;
  const add = (kind, label) => `<button class="btn primary" data-action="add" data-kind="${kind}">${ic('plus')}${label}</button>`;
  const acts = {
    overview: model ? [exportBtn, checkin] : [],
    bills: [add('bill', 'Add Bill')],
    income: [add('income', 'Add Income')],
    accounts: [`<button class="btn has-lbl" data-action="tab" data-tab="history" title="History">${ic('history')}<span class="lbl">History</span></button>`, `<button class="btn has-lbl" data-action="checkin" title="Check In">${ic('checkin')}<span class="lbl">Check In</span></button>`, add('account', 'Add')],
    whatif: [],
    history: [checkin],
    settings: [exportBtn]
  };
  document.getElementById('topActions').innerHTML = acts[ui.view].join('');
}

function renderBanners() {
  const el = document.getElementById('banners');
  const items = [];
  if (sync.status === 'noaccess') items.push(['orange', '<b>This tracker isn’t shared with you yet.</b> Ask the owner to invite you as an Editor from the Share menu, then reload. Anything you enter now stays on this device only.', '']);
  if (sync.status === 'error') items.push(['red', `<b>Sync paused.</b> ${esc(sync.detail || 'Your changes are saved on this device and will sync when possible.')}`, '']);
  if (!storage.ok && !['synced', 'saving', 'connecting'].includes(sync.status)) items.push(['red', `<b>Changes are not being saved.</b> ${esc(storage.msg)} Export a backup now so you don't lose your work.`, `<button class="btn sm tinted" data-action="export">Export</button>`]);
  loadNotices.forEach((n, i) => items.push([n[0] === 'critical' ? 'red' : 'orange', n[1], `<button class="btn sm" data-action="dismiss-notice" data-i="${i}">Dismiss</button>`]));
  el.innerHTML = items.map(([c, h, btn]) => `<div class="group"><div class="list-row has-tile">${tile('alert', c)}<div class="body" style="white-space:normal;font-size:14px">${h}</div>${btn}</div></div>`).join('');
  el.hidden = !items.length;
}

function renderView() {
  if (ui.view === 'overview' && !model) { app.innerHTML = welcomeHTML(); renderSyncStatus(); return; }
  const views = { overview: overviewHTML, bills: billsView, income: incomeView, accounts: accountsView, whatif: whatIfView, history: historyView, settings: settingsView };
  const fade = lastView !== ui.view ? ' fade' : '';
  lastView = ui.view;
  app.innerHTML = `<div class="stack${fade}">${views[ui.view]()}</div>`;
  if (ui.view === 'overview') drawChart(model.all, model.ess, chartRange());
  if (ui.view === 'whatif') drawCompare();
  renderSyncStatus();
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
  if (sim.out < 0 || sim.out > 12 * MONTH) return { label: 'Comfortable', color: 'var(--green)' };
  if (sim.out > 6 * MONTH) return { label: 'Watch Closely', color: 'var(--yellow)' };
  if (sim.out > 3 * MONTH) return { label: 'Tight', color: 'var(--orange)' };
  return { label: 'Urgent', color: 'var(--red)' };
}
function goalPct(sim) {
  const have = sim.out < 0 ? Infinity : sim.out;
  return Math.max(1, Math.min(100, (have / (S.settings.targetMonths * MONTH)) * 100));
}
/** Activity-style ring. */
function ringSVG(pct, color, size, stroke) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);flex:none" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-opacity=".22" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/></svg>`;
}
const status = st => `<span class="status" style="color:${st.color}"><span class="dot" style="background:${st.color}"></span>${st.label}</span>`;
const signed = n => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;
const emptyHTML = (icon, color, title, text, btn = '') => `<div class="empty">${tile(icon, color)}<b>${title}</b>${text}${btn ? `<div>${btn}</div>` : ''}</div>`;

/* =====================================================================
 * Summary (overview)
 * ===================================================================== */
function overviewHTML() {
  return `${heroHTML()}${whatIfHint()}${attentionHTML()}${chartCardHTML()}
    <div class="cols">${upcomingHTML()}<div class="stack">${creditHTML()}${plannerHTML()}${categoriesHTML()}</div></div>`;
}

function heroHTML() {
  const { all, ess, billsMo, essMo, incMo, cardMin } = model;
  const r = runwayText(all), re = runwayText(ess), st = statusOf(all);
  const net = incMo - billsMo - cardMin, tm = S.settings.targetMonths, pct = goalPct(all);
  const ck = S.checkins, last = ck[ck.length - 1], prev = ck[ck.length - 2];
  const cashDelta = last && prev ? last.total - prev.total : null;
  const activeInc = S.income.filter(i => isActive(i) && i.freq !== 'once').length;
  const counted = S.accounts.filter(a => a.include !== false && a.type !== 'credit').length;
  const size = 156, stroke = 18, rr = (size - stroke) / 2, circ = 2 * Math.PI * rr;
  return `
  <section class="hero">
    <div class="card hero-main">
      <div>
        <div class="k">Runway ${status(st)}</div>
        <div class="big">${r.big}<small>${r.unit}</small></div>
        <div class="sub">${r.now ? '<b>Cash is already below your cushion.</b>' : r.date ? `Cash lasts until <b>${fmtDate(r.date, { month: 'long', day: 'numeric', year: 'numeric' })}</b>` : `Cash lasts beyond the ${S.settings.horizon}-month projection`}</div>
        <div class="hero-meta">
          <div><div class="mk">Essentials Only</div><div class="mv">${re.big} ${re.unit === 'months' ? 'mo' : re.unit}</div></div>
          ${model.cred ? (() => { const rc = runwayText(model.cred); return `<div><div class="mk">With Credit</div><div class="mv">${rc.big} ${rc.unit === 'months' ? 'mo' : rc.unit}</div></div>`; })() : `<div><div class="mk">Cushion</div><div class="mv">${money(S.settings.cushion)}</div></div>`}
          <div><div class="mk">Last Check-In</div><div class="mv">${last ? safeDate(last.date, { month: 'short', day: 'numeric' }) : '—'}</div></div>
        </div>
      </div>
      <div class="ring" role="img" aria-label="${Math.round(pct)} percent of a ${tm}-month goal">
        <svg viewBox="0 0 ${size} ${size}">
          <circle cx="${size / 2}" cy="${size / 2}" r="${rr}" stroke="${st.color}" stroke-opacity=".2" stroke-width="${stroke}"/>
          <circle class="prog" cx="${size / 2}" cy="${size / 2}" r="${rr}" stroke="${st.color}" stroke-width="${stroke}" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ * (1 - pct / 100)).toFixed(2)}"/>
        </svg>
        <div class="center"><div><div class="p">${Math.round(pct)}%</div><div class="c">of ${tm} mo goal</div></div></div>
      </div>
    </div>
    <div class="kpis">
      ${kpi('Cash on Hand', 'wallet', 'blue', money(cashTotal()), cashDelta === null ? `${counted} account${counted === 1 ? '' : 's'}` : `<span style="color:var(--${cashDelta >= 0 ? 'green' : 'red'})">${signed(cashDelta)}</span> since ${safeDate(prev.date, { month: 'short', day: 'numeric' })}`)}
      ${kpi('Bills', 'bills', 'orange', money(billsMo), cardMin ? `plus ${money(cardMin)} card minimums per month` : `${money(essMo)} essential per month`)}
      ${kpi('Income', 'income', 'green', money(incMo), `${activeInc} active source${activeInc === 1 ? '' : 's'} per month`)}
      ${kpi('Net', net >= 0 ? 'income' : 'down', net >= 0 ? 'green' : 'red', signed(net), net >= 0 ? 'Cash growing each month' : 'Burn per month')}
    </div>
  </section>`;
}
const kpi = (label, icon, color, val, note) => `<div class="card kpi"><div class="kh" style="color:var(--${color})">${ic(icon)}${label}</div><div class="val num">${val}</div><div class="note">${note}</div></div>`;

function attentionItems() {
  const t0 = today(), A = [];
  const overdue = S.bills.filter(b => parse(b.next) < t0);
  if (overdue.length) A.push(['alert', 'red', `${overdue.length} Bill${overdue.length > 1 ? 's' : ''} Past Due`, `${listNames(overdue)}. If paid, check in to mark ${overdue.length > 1 ? 'them' : 'it'} done.`, `<button class="btn xs tinted" data-action="checkin">Check In</button>`]);
  const cs = C.creditSummary(S);
  const dupes = cs.owedAll > 0 ? S.bills.filter(b => /\b(card|visa|amex|american express|mastercard|discover)\b/i.test(b.name)) : [];
  if (dupes.length) A.push(['accounts', 'indigo', 'Card Payment Listed as a Bill?', `Runway already counts your card minimums. If ${listNames(dupes)} ${dupes.length > 1 ? 'are card payments' : 'is a card payment'}, delete ${dupes.length > 1 ? 'them' : 'it'} so it isn’t counted twice.`, '']);
  const late = S.income.filter(i => parse(i.next) < t0);
  if (late.length) A.push(['clock', 'orange', 'Confirm Income', `${listNames(late)}: mark received or skip`, '']);
  if (model.all.out === 0) A.push(['alert', 'red', 'Below Your Cushion', 'Cash is under your safety cushion right now', '']);
  else if (model.all.out > 0 && model.all.out <= 3 * MONTH) { const re = runwayText(model.ess); A.push(['alert', 'red', 'Less Than 3 Months Left', `Essentials only gives you ${re.big} ${re.unit}`, '']); }
  for (const i of S.income) {
    if (!i.end) continue;
    const d = daysBetween(t0, parse(i.end));
    if (d >= 0 && d <= 60) A.push(['calendar', 'yellow', `${i.name} Ends in ${d} Day${d === 1 ? '' : 's'}`, `Income drops by ${money(i.amount * FREQ[i.freq].perMonth)} per month`, '']);
  }
  const lastCk = S.checkins[S.checkins.length - 1];
  if (S.accounts.length && (!lastCk || daysBetween(parse(lastCk.date), t0) > 10))
    A.push(['checkin', 'blue', 'Update Your Balances', lastCk ? `Last check-in was ${daysBetween(parse(lastCk.date), t0)} days ago` : 'No check-ins yet', `<button class="btn xs tinted" data-action="checkin">Check In</button>`]);
  const le = S.settings.lastExport, since = le ? daysBetween(parse(le), t0) : null;
  if (!['synced', 'saving', 'connecting'].includes(sync.status) && (since === null || since > 14))
    A.push(['shield', 'gray', 'Back Up Your Data', since === null ? 'No backup exported yet' : `Last backup was ${since} days ago`, `<button class="btn xs tinted" data-action="export">Export</button>`]);
  return A;
}
const listNames = items => items.length <= 3 ? items.map(i => i.name).join(', ') : `${items.slice(0, 3).map(i => i.name).join(', ')} and ${items.length - 3} more`;
function attentionHTML() {
  const A = attentionItems();
  if (!A.length) return `<div class="group"><div class="list-row has-tile">${tile('check', 'green')}<div class="body"><div class="t">You're All Set</div><div class="s">No overdue bills, nothing ending soon, backup is current.</div></div></div></div>`;
  return `<div role="status"><div class="sect"><span>Needs Attention</span></div><div class="group">
    ${A.map(([i, c, t, s, btn]) => `<div class="list-row has-tile">${tile(i, c)}<div class="body"><div class="t">${esc(t)}</div><div class="s">${esc(s)}</div></div>${btn}</div>`).join('')}
  </div></div>`;
}

function chartCardHTML() {
  const range = chartRange();
  return `<section class="card" aria-labelledby="chartTitle">
    <div class="card-title">
      <div><h2 id="chartTitle">Projected Balance</h2><div class="foot13">Day by day, from your real bill and income dates</div></div>
      <div class="seg" role="group" aria-label="Chart range">
        ${[6, 12, 24, 36].filter(m => m <= S.settings.horizon).map(m => `<button data-action="range" data-m="${m}" aria-pressed="${range === m}">${m}M</button>`).join('')}
      </div>
    </div>
    <div class="legend">
      <span><i style="background:var(--s1)"></i>All bills</span>
      <span><i style="background:var(--s2)"></i>Essentials only</span>
      ${S.checkins.length ? '<span><i class="dotkey" style="background:var(--s3)"></i>Actual balance</span>' : ''}
      ${S.settings.cushion ? `<span><i class="dash"></i>Cushion</span>` : ''}
    </div>
    <div class="chart-box" id="chartBox"></div>
    ${monthTableHTML(model.all, model.ess, range)}
  </section>`;
}

function upcomingHTML() {
  const t0 = today();
  const ev = C.upcoming(S, 30, t0);
  const groups = [['Overdue', e => e.overdue], ['Next 7 Days', e => !e.overdue && daysBetween(t0, e.date) < 7], ['Later This Month', e => !e.overdue && daysBetween(t0, e.date) >= 7]];
  const row = e => {
    const isNext = parse(e.item.next).getTime() === e.date.getTime();
    const tag = isNext ? `button type="button" class="list-row has-tile" data-action="settle" data-kind="${e.kind}" data-id="${esc(e.item.id)}"` : 'div class="list-row has-tile"';
    return `<${tag}>
      <div class="cal ${e.overdue ? 'over' : ''}"><div class="m">${e.date.toLocaleDateString(undefined, { month: 'short' })}</div><div class="d">${e.date.getDate()}</div></div>
      <div class="body">
        <div class="t">${esc(e.item.name)}${e.overdue ? `<span class="tag red">${e.kind === 'bill' ? 'Overdue' : 'Confirm'}</span>` : ''}</div>
        <div class="s num">Balance after ${money(e.after)}</div>
      </div>
      <div class="end">
        <div class="amt ${e.amount > 0 ? 'in' : ''}">${e.amount > 0 ? '+' : '−'}${money(Math.abs(e.amount), true)}</div>
      </div>
      ${isNext ? ic('chevron', 'chev') : '<span class="chev-space"></span>'}
    </${isNext ? 'button' : 'div'}>`;
  };
  const out = ev.reduce((t, e) => t + (e.amount < 0 ? -e.amount : 0), 0);
  const inn = ev.reduce((t, e) => t + (e.amount > 0 ? e.amount : 0), 0);
  return `<section>
    <div class="card pad" style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;gap:16px">
      <div><h2 style="font-size:17px;font-weight:600">Next 30 Days</h2><div class="foot13">${ev.length} item${ev.length === 1 ? '' : 's'} · tap one to mark it done</div></div>
      <div style="display:flex;gap:22px;text-align:right">
        <div><div class="foot13">Out</div><div class="rounded num" style="font-size:20px;font-weight:700">${money(out)}</div></div>
        <div><div class="foot13">In</div><div class="rounded num in" style="font-size:20px;font-weight:700">${money(inn)}</div></div>
      </div>
    </div>
    ${ev.length ? groups.map(([label, f]) => {
        const g = ev.filter(f);
        if (!g.length) return '';
        const LIMIT = 10, cap = label === 'Later This Month' && g.length > LIMIT + 1;
        const shown = cap && !ui.showAllUpcoming ? g.slice(0, LIMIT) : g;
        const more = cap ? `<div class="list-row action-row" data-action="toggle-upcoming" role="button" tabindex="0">${ui.showAllUpcoming ? 'Show Less' : `Show All ${g.length}`}</div>` : '';
        return `<div class="sect"><span>${label}</span><span>${g.length}</span></div><div class="group" style="margin-bottom:24px">${shown.map(row).join('')}${more}</div>`;
      }).join('')
      : `<div class="group">${emptyHTML('calendar', 'red', 'Nothing Due', 'No bills or income in the next 30 days.')}</div>`}
  </section>`;
}

function creditHTML() {
  const cs = C.creditSummary(S);
  const head = tag => `<div style="display:flex;align-items:center;gap:10px;justify-content:space-between"><div style="display:flex;align-items:center;gap:10px">${tile('accounts', 'indigo', 'sm')}<h2 style="font-size:17px;font-weight:600">Credit Backstop</h2></div>${tag || ''}</div>`;
  if (!cs.cards) return `<section class="card pad planner">${head()}
    <p style="margin-top:12px">Add your credit cards to see how many months they could add to your runway, and what the interest would cost.</p>
    <button class="btn tinted" style="margin-top:14px" data-action="add" data-kind="account" data-type="credit">${ic('plus')}Add Credit Card</button></section>`;
  const { all, cred } = model;
  const H = cred.days, endAll = all.out < 0 ? H : all.out, endCred = cred.out < 0 ? H : cred.out;
  const extra = (endCred - endAll) / MONTH;
  const rc = runwayText(cred);
  const toEnd = C.simulate(S, { useCredit: true, creditFrom: cred.creditFrom, days: endCred }, today());
  const owedEnd = toEnd.owed[toEnd.owed.length - 1] || 0;
  const startDay = cred.owed.findIndex(v => v > cs.owed + 1);
  const cardBills = S.bills.filter(b => b.card).length;
  const maxApr = Math.max(...S.accounts.filter(a => a.type === 'credit' && a.include !== false).map(a => a.apr || 0));
  const row = (k, v, color) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:.5px solid var(--sep);font-size:14px"><span class="l2">${k}</span><span class="num" style="font-weight:600${color ? `;color:${color}` : ''}">${v}</span></div>`;
  let big;
  if (all.out < 0 && cred.out < 0) big = `<div class="answer" style="font-size:28px">Not needed</div><p>Your cash covers the full ${S.settings.horizon}-month projection without touching credit.</p>`;
  else if (extra < 0.05) big = `<div class="answer" style="font-size:28px">Adds no time</div><p>${cardBills ? 'Your cards can’t cover the bills that run out first. Bills that must be paid in cash, like rent or loans, set the limit.' : 'No bills are marked Can Pay by Card yet. Edit your bills to mark the ones a card can cover.'}</p>`;
  else big = `<div class="answer num" style="color:var(--green)">+${extra.toFixed(1)}<small> months</small></div><p>With credit, cash lasts ${rc.date ? `until <b>${fmtDate(rc.date, { month: 'long', year: 'numeric' })}</b>` : `beyond <b>${S.settings.horizon} months</b>`}.</p>`;
  return `<section class="card pad planner">${head(`<span class="tag ${extra >= 0.05 ? 'blue' : ''}">${cs.cards} card${cs.cards === 1 ? '' : 's'}</span>`)}
    ${big}
    <div style="margin-top:14px">
      ${row('Usable credit', `${money(cs.usable)} <span class="l3" style="font-weight:500">of ${money(cs.limit)}</span>`)}
      ${S.settings.creditStrategy === 'now' ? row('Card strategy', 'Carrying a balance from today') : startDay > 0 && extra >= 0.05 ? row('Cards start covering bills', fmtDate(addDays(today(), startDay), { month: 'short', day: 'numeric', year: 'numeric' })) : ''}
      ${row('Card debt by then', money(owedEnd), owedEnd > cs.owed + 1 ? 'var(--orange)' : '')}
      ${row('Interest by then', money(toEnd.interest), toEnd.interest > 1 ? 'var(--red)' : '')}
      ${row('Bills a card can pay', `${cardBills} of ${S.bills.length}`)}
    </div>
    ${maxApr > 0 ? `<div class="note-box">${ic('info')}<span>At ${maxApr}% APR, every $1,000 you carry costs about ${money(1000 * maxApr / 100 / 12)} a month in interest, and minimum payments come out of cash.</span></div>` : ''}
  </section>`;
}

function plannerHTML() {
  const tm = S.settings.targetMonths, t0 = today();
  const gapAll = C.gapFor(S, tm, false, t0), gapEss = C.gapFor(S, tm, true, t0);
  let ans;
  if (gapAll === Infinity) ans = `<div class="answer" style="color:var(--red)">Below Cushion</div><p>Your cash is already under your ${money(S.settings.cushion)} cushion. Lower it in Settings, or add money to an account.</p>`;
  else if (gapAll <= 0.5) ans = `<div class="answer" style="color:var(--green)">You're Covered</div><p>Your cash lasts at least ${tm} months at current bills and income.</p>`;
  else ans = `<div class="answer num">${money(Math.ceil(gapAll))}<small> per month</small></div>
       <p>Extra income or cuts to stay above ${money(S.settings.cushion)} for ${tm} months.</p>
       <p>${gapEss <= 0.5 ? 'Or cut to <b>essentials only</b> — that alone gets you there.' : `On essentials only, you'd still need <b>${money(Math.ceil(gapEss))}</b> per month.`}</p>`;
  return `<section class="card pad planner">
    <div style="display:flex;align-items:center;gap:10px">${tile('target', 'red', 'sm')}<h2 style="font-size:17px;font-weight:600">Runway Goal</h2></div>
    <div class="stepper-row"><span>Stay covered for <b class="rounded num">${tm}</b> months</span>
      <span class="stepper"><button data-action="goal" data-d="-1" aria-label="Fewer months">${ic('minus')}</button><button data-action="goal" data-d="1" aria-label="More months">${ic('plus')}</button></span></div>
    ${ans}
    <div class="note-box">${ic('info')}<span>Plan for a 6–9 month search, plus about a month before the first paycheck lands.</span></div>
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
  return `<section class="card pad">
    <h2 style="font-size:17px;font-weight:600">Spending by Category</h2>
    <div class="foot13" style="margin-bottom:10px">${money(total)} per month</div>
    ${rows.map(([k, v]) => `<div class="cat" title="${esc(k)}: ${money(v)}/mo (${Math.round(v / total * 100)}%)">
      ${catTile(k, 'sm')}
      <div><div class="bt"><span>${esc(k)}</span><span>${money(v)}</span></div><div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%"></div></div></div>
      <span></span>
    </div>`).join('')}
  </section>`;
}

function monthTableHTML(all, ess, range) {
  const rows = [], t0 = today();
  for (let m = 1; m <= range; m++) {
    const d = Math.min(all.bal.length - 1, Math.round(m * MONTH));
    rows.push(`<div class="list-row"><div class="body">${fmtDate(addDays(t0, d), { month: 'long', year: 'numeric' })}</div><div class="end" style="flex-direction:row;gap:18px"><span class="num" style="color:var(--s1)">${money(all.bal[d])}</span><span class="num l2">${money(ess.bal[d])}</span>${model.cred ? `<span class="num" style="color:var(--orange)">${money(model.cred.owed[d])}</span>` : ''}</div></div>`);
  }
  return `<details class="tableview"><summary>${ic('chevron')}Show Month by Month</summary><div class="group"><div class="list-row" style="min-height:36px"><div class="body foot13">Month</div><div class="end foot13" style="flex-direction:row;gap:18px"><span>All bills</span><span>Essentials</span>${model.cred ? '<span>Card debt (with credit)</span>' : ''}</div></div>${rows.join('')}</div></details>`;
}

/* =====================================================================
 * Lists
 * ===================================================================== */
const stat = (k, v) => `<div><div class="k">${k}</div><div class="v num">${v}</div></div>`;
const dueText = (i, kind) => {
  const d = parse(i.next), days = daysBetween(today(), d);
  if (days < 0) return `<span class="tag red">${kind === 'income' ? 'Confirm' : 'Overdue'}</span>`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return safeDate(i.next, { month: 'short', day: 'numeric' });
};

function billsView() {
  const active = S.bills.filter(b => isActive(b) && b.freq !== 'once');
  const total = monthly(active), ess = monthly(active, b => b.essential);
  const f = ui.billFilter;
  const rows = S.bills.filter(b => f === 'all' || (f === 'essential' ? b.essential : !b.essential)).sort((a, b) => a.next.localeCompare(b.next));
  return `
  <div class="card stats">${stat('Per Month', money(total))}${stat('Essential', money(ess))}${stat('Extras', money(total - ess))}${stat('Bills', S.bills.length)}</div>
  <div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Filter bills">
        ${[['all', 'All'], ['essential', 'Essential'], ['extras', 'Extras']].map(([k, l]) => `<button data-action="billfilter" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="group">
    ${rows.length ? rows.map(b => `<div class="list-row has-tile split">
        <button type="button" class="row-main" data-action="edit" data-kind="bill" data-id="${esc(b.id)}" aria-label="Edit ${esc(b.name)}">
          ${catTile(b.category)}
          <div class="body">
            <div class="t">${esc(b.name)}${b.essential ? '' : '<span class="tag">Extra</span>'}${b.card ? '<span class="tag blue">Card OK</span>' : ''}</div>
            <div class="s">${FREQ[b.freq].label} · ${esc(b.category)}${b.end ? ` · until ${safeDate(b.end, { month: 'short', year: 'numeric' })}` : ''}</div>
          </div>
          <div class="end"><div class="amt">${money(b.amount, true)}</div><div class="foot13">${dueText(b, 'bill')}</div></div>
        </button>
        <button type="button" class="btn xs ${parse(b.next) <= today() ? 'primary' : 'tinted'} row-pay" data-action="settle" data-kind="bill" data-id="${esc(b.id)}" aria-label="Mark ${esc(b.name)} paid">${ic('check')}Paid</button>
      </div>`).join('')
      : emptyHTML('bills', 'orange', S.bills.length ? 'No Matching Bills' : 'No Bills Yet', S.bills.length ? 'Try a different filter.' : 'Add rent, insurance, phone, loans, groceries and gas.', S.bills.length ? '' : `<button class="btn primary" data-action="add" data-kind="bill">${ic('plus')}Add Bill</button>`)}
    </div>
    <div class="sect-foot">Tap Paid when a bill goes through; it moves to its next due date and comes off the account you choose. Tap the bill itself to edit or delete it.</div>
  </div>`;
}

function incomeView() {
  const t0 = today();
  const active = S.income.filter(i => isActive(i));
  const next90 = C.upcoming(S, 90, t0).filter(e => e.kind === 'income').reduce((t, e) => t + e.amount, 0);
  const ending = S.income.filter(i => i.end && daysBetween(t0, parse(i.end)) >= 0 && daysBetween(t0, parse(i.end)) <= 90).length;
  const rows = [...S.income].sort((a, b) => a.next.localeCompare(b.next));
  return `
  <div class="card stats">${stat('Per Month', money(model ? model.incMo : 0))}${stat('Next 90 Days', money(next90))}${stat('Active', active.length)}${stat('Ending Soon', ending)}</div>
  <div>
    <div class="group">
    ${rows.length ? rows.map(i => `<button type="button" class="list-row has-tile" data-action="edit" data-kind="income" data-id="${esc(i.id)}">
        ${tile(i.freq === 'once' ? 'sparkles' : 'briefcase', isActive(i) ? 'green' : 'gray')}
        <div class="body">
          <div class="t">${esc(i.name)}${!isActive(i) ? '<span class="tag">Ended</span>' : ''}</div>
          <div class="s">${(() => { const e = C.endOf(i), left = C.paymentsLeft(i);
            return FREQ[i.freq].label + (e ? ` · ends ${safeDate(e, { month: 'short', day: 'numeric', year: 'numeric' })}` : ' · ongoing') + (left !== null ? ` · ${left} payment${left === 1 ? '' : 's'} left of ${money(i.remaining)}` : ''); })()}</div>
        </div>
        <div class="end"><div class="amt in">+${money(i.amount, true)}</div><div class="foot13">${dueText(i, 'income')}</div></div>
        ${ic('chevron', 'chev')}
      </button>`).join('')
      : emptyHTML('briefcase', 'green', 'No Income Yet', 'Add unemployment benefits, severance, freelance work or a partner\'s help.', `<button class="btn primary" data-action="add" data-kind="income">${ic('plus')}Add Income</button>`)}
    </div>
    <div class="sect-foot">Benefits usually stop after a set number of weeks — give them an end date. Use “One time” for severance or a tax refund.</div>
  </div>`;
}

function accountsView() {
  const excluded = S.accounts.filter(a => a.include === false && a.type !== 'credit').reduce((t, a) => t + a.balance, 0);
  const cs = C.creditSummary(S);
  let gi = 0;
  const cashCard = a => {
    const cls = a.include === false ? 'off' : 'g' + (gi++ % 4);
    return `<div class="wcard ${cls}">
      <div class="wt"><div><div class="wn">${esc(a.name)}</div><div class="ws">${a.include === false ? 'Not counted toward runway' : 'Counts toward runway'}</div></div>${tools(a)}</div>
      <div>
        <div class="wb num">${money(a.balance, true)}</div>
        <div class="wf"><span>${a.updated ? 'Updated ' + safeDate(a.updated, { month: 'short', day: 'numeric' }) : ''}</span>${ic(a.include === false ? 'archive' : 'bank')}</div>
      </div>
    </div>`;
  };
  const creditCard = a => {
    const used = a.limit ? Math.min(100, a.balance / a.limit * 100) : 0;
    return `<div class="wcard ${a.include === false ? 'off' : 'credit'}">
      <div class="wt"><div><div class="wn">${esc(a.name)}</div><div class="ws">Credit card${a.apr ? ` · ${a.apr}% APR` : ''}${a.include === false ? ' · not used for runway' : ''}</div></div>${tools(a)}</div>
      <div>
        <div class="ws" style="margin-bottom:2px">Owed</div>
        <div class="wb num">${money(a.balance, true)}</div>
        <div class="wmeter"><i style="width:${used.toFixed(1)}%"></i></div>
        <div class="wf"><span>${money(Math.max(0, a.limit - a.balance))} available of ${money(a.limit)}</span>${ic('accounts')}</div>
      </div>
    </div>`;
  };
  const tools = a => `<div class="wtools"><button class="btn round xs" data-action="edit" data-kind="account" data-id="${esc(a.id)}" aria-label="Edit" title="Edit">${ic('edit')}</button><button class="btn round xs" data-action="del" data-kind="account" data-id="${esc(a.id)}" aria-label="Delete" title="Delete">${ic('trash')}</button></div>`;
  const cash = S.accounts.filter(a => a.type !== 'credit'), cards = S.accounts.filter(a => a.type === 'credit');
  return `
  <div class="card stats">${stat('Cash Counted', money(cashTotal()))}${stat('Not Counted', money(excluded))}${stat('Usable Credit', money(cs.usable))}${stat('Card Debt', money(cs.owedAll))}</div>
  <div>
    <div class="sect"><span>Cash</span></div>
    <div class="wallet">${cash.map(cashCard).join('')}<button class="wadd" data-action="add" data-kind="account">${ic('plus')}Add Account</button></div>
    <div class="sect-foot">Include cash you can actually spend. Leave retirement accounts out unless you plan to tap them.</div>
  </div>
  <div>
    <div class="sect"><span>Credit Cards</span></div>
    <div class="wallet">${cards.map(creditCard).join('')}<button class="wadd" data-action="add" data-kind="account" data-type="credit">${ic('plus')}Add Credit Card</button></div>
    <div class="sect-foot">Cards never count as cash. They extend your runway only for bills marked Can Pay by Card, and only up to ${S.settings.creditCap}% of each limit (change this in Settings).</div>
  </div>`;
}

function historyView() {
  const ck = [...S.checkins].reverse();
  const act = [...S.activity].reverse().slice(0, 50);
  return `<div class="cols">
    <div>
      <div class="sect"><span>Balance Check-Ins</span></div>
      <div class="group">
      ${ck.length ? ck.slice(0, ui.showAllCheckins ? ck.length : 60).map((c, idx) => { const prev = ck[idx + 1], ch = prev ? c.total - prev.total : null;
        return `<div class="list-row has-tile">${tile('checkin', 'blue', 'sm')}
          <div class="body"><div class="t">${safeDate(c.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>${ch == null ? '' : `<div class="s" style="color:var(--${ch >= 0 ? 'green' : 'red'})">${signed(ch)}</div>`}</div>
          <div class="amt rounded" style="font-weight:600">${money(c.total)}</div>
          <button class="btn round xs" data-action="delck" data-date="${esc(c.date)}" aria-label="Delete check-in" title="Delete" style="color:var(--label-2)">${ic('trash')}</button></div>`; }).join('') + (ck.length > 60 ? `<button type="button" class="list-row action-row" data-action="toggle-checkins">${ui.showAllCheckins ? 'Show Recent' : `Show All ${ck.length}`}</button>` : '')
        : emptyHTML('checkin', 'blue', 'No Check-Ins Yet', 'Log your balances weekly to compare reality with the plan.', `<button class="btn primary" data-action="checkin">Check In</button>`)}
      </div>
    </div>
    <div>
      <div class="sect"><span>Recent Activity</span></div>
      <div class="group">
      ${act.length ? act.map(a => `<div class="list-row has-tile">${tile(a.amount > 0 ? 'income' : 'bills', a.amount > 0 ? 'green' : 'orange', 'sm')}
          <div class="body"><div class="t">${esc(a.name)}</div><div class="s">${safeDate(a.date, { month: 'short', day: 'numeric' })}${a.account ? ' · ' + esc(a.account) : ''}</div></div>
          <div class="amt ${a.amount > 0 ? 'in' : ''}">${a.amount > 0 ? '+' : '−'}${money(Math.abs(a.amount), true)}</div></div>`).join('')
        : emptyHTML('history', 'gray', 'No Activity Yet', 'Mark bills paid and income received from Summary.')}
      </div>
    </div>
  </div>`;
}

function settingsView() {
  const snaps = readSnapshots().reverse();
  const le = S.settings.lastExport, fresh = le && daysBetween(parse(le), today()) <= 14;
  const syncFoot = {
    local: 'Your data is saved in this browser only. Open Runway from its claude.ai link to sync it across your devices.',
    signedout: 'Sign in to claude.ai to sync your data across devices.',
    noaccess: 'You can open this page, but the shared household tracker is only visible to people with edit access. Ask the owner to invite you as an Editor from the Share menu. Anything you enter here stays on this device.',
  }[sync.status] || 'Your household’s data syncs to everyone with edit access: the owner, plus anyone invited as an Editor from the Share menu. Viewers and public links never see it. Changes from either of you appear on every device within seconds.';
  return `<div style="max-width:720px;width:100%;margin:0 auto">
    <div class="sect"><span>Sync</span></div>
    <div class="group">
      <div class="list-row has-tile">${tile('cloud', 'blue')}<div class="body">Sync Across Devices</div><span class="value" id="syncValue"></span></div>
    </div>
    <div class="sect-foot">${syncFoot}</div>

    <div class="sect"><span>Home Screen</span></div>
    <div class="group">
      <button type="button" class="list-row has-tile" data-action="homescreen">${tile('share', 'blue')}<div class="body"><div class="t">Add to Home Screen</div><div class="s">Open Runway like an app, in one tap</div></div>${ic('chevron', 'chev')}</button>
    </div>

    <div class="sect"><span>Projection</span></div>
    <div class="group">
      <label class="list-row has-tile">${tile('shield', 'green')}<div class="body">Safety Cushion</div><span class="value"><input type="text" inputmode="decimal" id="setCushion" value="${money(S.settings.cushion)}" data-setting="cushion" aria-label="Safety cushion in dollars"></span></label>
      <label class="list-row has-tile">${tile('calendar', 'red')}<div class="body">Projection Length</div><span class="value"><select id="setHorizon" data-setting="horizon" aria-label="Projection length">${[12, 24, 36].map(m => `<option value="${m}" ${S.settings.horizon === m ? 'selected' : ''}>${m} months</option>`).join('')}</select></span></label>
      <label class="list-row has-tile">${tile('target', 'orange')}<div class="body">Runway Goal</div><span class="value"><select data-setting="targetMonths" aria-label="Runway goal">${[3, 6, 9, 12, 18, 24].concat([S.settings.targetMonths]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map(m => `<option value="${m}" ${S.settings.targetMonths === m ? 'selected' : ''}>${m} months</option>`).join('')}</select></span></label>
      <label class="list-row has-tile">${tile('accounts', 'blue')}<div class="body">Use Cards</div><span class="value"><select data-setting="creditStrategy" aria-label="When to use credit cards">
        <option value="late" ${S.settings.creditStrategy !== 'now' ? 'selected' : ''}>When cash runs low</option>
        <option value="now" ${S.settings.creditStrategy === 'now' ? 'selected' : ''}>Carry from now</option></select></span></label>
      <label class="list-row has-tile">${tile('accounts', 'indigo')}<div class="body">Use Up To</div><span class="value"><select data-setting="creditCap" aria-label="Share of each card limit to use">${[30, 50, 60, 70, 80, 90, 100].concat([S.settings.creditCap]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map(p => `<option value="${p}" ${S.settings.creditCap === p ? 'selected' : ''}>${p}% of card limits</option>`).join('')}</select></span></label>
    </div>
    <div class="sect-foot">Runway ends when cash falls below your cushion, not at $0. Card companies can lower limits without notice, so the credit runway counts only part of each limit. “When cash runs low” starts carrying card balances as late as possible and costs the least interest; “Carry from now” matches putting card bills on the card today.</div>

    <div class="sect"><span>Backup</span></div>
    <div class="group">
      <div class="list-row has-tile">${tile('archive', 'blue')}<div class="body">Last Exported</div><span class="value">${le ? safeDate(le) : 'Never'}</span>${fresh ? '<span class="tag green">Current</span>' : `<span class="tag orange">${le ? 'Overdue' : 'Needed'}</span>`}</div>
      <div class="list-row action-row" data-action="export" role="button" tabindex="0">Export Backup…</div>
      <div class="list-row action-row" data-action="import" role="button" tabindex="0">Import Backup…</div>
    </div>
    <div class="sect-foot">An exported file is the only copy that survives clearing your browser. Keep one in iCloud Drive or another safe place.</div>

    <div class="sect"><span>Snapshots</span><span>${snaps.length}</span></div>
    <div class="group">
      ${snaps.length ? snaps.map(s => { const d = s.data || {}; const n = k => (Array.isArray(d[k]) ? d[k].length : 0);
        return `<div class="list-row"><div class="body"><div class="t">${esc(new Date(s.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div><div class="s">${esc(s.label)} · ${n('accounts')} accounts, ${n('bills')} bills, ${n('income')} income</div></div><button class="btn xs tinted" data-action="restore" data-ts="${s.ts}">Restore</button></div>`; }).join('')
        : '<div class="list-row"><div class="body l2">No snapshots yet</div></div>'}
    </div>
    <div class="sect-foot">Saved automatically each day you open Runway (last ${MAX_AUTO_SNAPSHOTS} kept), and before any erase, import or restore.</div>

    <div class="sect"><span>Data</span></div>
    <div class="group">
      <div class="list-row action-row" data-action="sample" role="button" tabindex="0">Load Sample Data</div>
      <div class="list-row action-row destructive" data-action="reset" role="button" tabindex="0">Erase All Data</div>
    </div>
    <div class="sect-foot">A snapshot is saved first, so either can be undone.</div>
  </div>`;
}

function welcomeHTML() {
  return `<div class="welcome fade">
    <span class="app-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 17c3-.8 5.5-3 7-6s3.2-5 6.5-5"/></svg></span>
    <h2>Welcome to Runway</h2>
    <div class="features">
      <div class="feature">${ic('wallet')}<div><b>Know Your Number</b><span>See exactly how many months your cash lasts, projected day by day.</span></div></div>
      <div class="feature">${ic('calendar')}<div><b>Every Bill, On Time</b><span>Track what's due and mark it paid in one tap.</span></div></div>
      <div class="feature">${ic('lock')}<div><b>Private by Design</b><span>Everything stays on this device. Nothing is uploaded.</span></div></div>
    </div>
    <button class="btn primary lg" data-action="add" data-kind="account">Add Your First Account</button>
    <div class="more">
      <button class="btn plain" data-action="sample">Explore with Sample Data</button>
      <button class="btn plain" data-action="import">Import a Backup</button>
    </div>
    ${readSnapshots().length ? `<div class="more"><button class="btn plain" data-action="restore-latest">Restore Latest Snapshot</button></div>` : ''}
  </div>`;
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
  const M = { l: 46, r: W < 560 ? 8 : 92, t: 18, b: 28 };
  const t0 = today();
  const days = Math.max(1, Math.min(all.bal.length - 1, Math.round(range * MONTH)));
  const cks = S.checkins.map(c => ({ d: daysBetween(t0, parse(c.date)), v: c.total })).filter(c => c.d >= -183 && c.d <= 0);
  const dMin = cks.length ? Math.min(0, ...cks.map(c => c.d)) : 0;

  let lo = Math.min(S.settings.cushion, 0), hi = Math.max(S.settings.cushion, 0);
  for (let d = 0; d <= days; d++) { lo = Math.min(lo, all.bal[d], ess.bal[d]); hi = Math.max(hi, all.bal[d], ess.bal[d]); }
  cks.forEach(c => { lo = Math.min(lo, c.v); hi = Math.max(hi, c.v); });
  if (hi - lo < 1) hi = lo + 1000;
  // Past the run-out date the lines keep falling; don't let that squeeze
  // the months that matter. Show at most ~30% of the height below $0.
  const floor = -Math.max(hi * 0.3, S.settings.cushion, 2000);
  if (lo < floor) lo = floor;
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;

  const x = d => M.l + (d - dMin) / (days - dMin) * (W - M.l - M.r);
  const y = v => M.t + (hi - v) / (hi - lo) * (Hh - M.t - M.b);
  const path = bal => { let p = ''; for (let d = 0; d <= days; d++) p += (d ? 'L' : 'M') + x(d).toFixed(1) + ' ' + y(bal[d]).toFixed(1); return p; };
  const base = y(Math.max(lo, Math.min(hi, 0)));

  let g = `<defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#0a84ff" stop-opacity=".32"/><stop offset="100%" stop-color="#0a84ff" stop-opacity="0"/></linearGradient></defs>`;
  for (let v = lo; v <= hi + step / 2; v += step) {
    g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1" stroke-dasharray="2 4"/>
          <text x="${M.l - 10}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="rgba(235,235,245,.5)">${compact(v)}</text>`;
  }
  const totalMonths = Math.ceil((days - dMin) / MONTH);
  const every = W < 560 ? (totalMonths > 12 ? 6 : 3) : (totalMonths > 18 ? 3 : totalMonths > 9 ? 2 : 1);
  const startD = addDays(t0, dMin);
  let mt = new Date(startD.getFullYear(), startD.getMonth() + 1, 1), idx = 0;
  while (daysBetween(t0, mt) <= days && idx < 600) {
    if (idx % every === 0) {
      const mon = mt.toLocaleDateString(undefined, { month: 'short' });
      const lab = mt.getMonth() === 0 || idx === 0 ? `${mon} ’${String(mt.getFullYear()).slice(2)}` : mon;
      g += `<text x="${x(daysBetween(t0, mt))}" y="${Hh - 8}" text-anchor="middle" font-size="11" fill="rgba(235,235,245,.5)">${lab}</text>`;
    }
    mt = new Date(mt.getFullYear(), mt.getMonth() + 1, 1); idx++;
  }
  const plotW = W - M.l - M.r, plotH = Hh - M.t - M.b;
  g += `<defs><clipPath id="plotClip"><rect x="${M.l}" y="${M.t - 6}" width="${plotW}" height="${plotH + 6}"/></clipPath>
        <clipPath id="aboveZero"><rect x="${M.l}" y="${M.t - 6}" width="${plotW}" height="${Math.max(0, y(0) - M.t + 6)}"/></clipPath></defs>`;
  if (lo < 0) g += `<rect x="${M.l}" y="${y(0)}" width="${plotW}" height="${Hh - M.b - y(0)}" fill="rgba(255,69,58,.07)"/><text x="${W - M.r - 6}" y="${Hh - M.b - 8}" text-anchor="end" font-size="11" font-weight="600" fill="rgba(255,105,97,.7)">Short of cash</text>`;
  if (lo <= 0 && hi >= 0) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--axis)" stroke-width="1"/>`;
  if (S.settings.cushion) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(S.settings.cushion)}" y2="${y(S.settings.cushion)}" stroke="rgba(235,235,245,.4)" stroke-width="1.25" stroke-dasharray="4 4"/>`;
  if (dMin < 0) g += `<line x1="${x(0)}" x2="${x(0)}" y1="${M.t}" y2="${Hh - M.b}" stroke="var(--axis)" stroke-dasharray="2 3"/><text x="${x(0) + 6}" y="${M.t + 2}" font-size="11" font-weight="600" fill="rgba(235,235,245,.6)">Today</text>`;

  const seg = (bal, a, b) => { let p = ''; for (let d = a; d <= b; d++) p += (d === a ? 'M' : 'L') + x(d).toFixed(1) + ' ' + y(bal[d]).toFixed(1); return p; };
  const line = (sim, color, width) => {
    const cut = sim.out < 0 || sim.out > days ? days : sim.out;
    let out = `<path d="${seg(sim.bal, 0, cut)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round"/>`;
    if (cut < days) out += `<path d="${seg(sim.bal, cut, days)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-opacity=".28" stroke-dasharray="3 4"/>`;
    return out;
  };
  g += `<g clip-path="url(#plotClip)">`;
  g += `<path clip-path="url(#aboveZero)" d="${path(all.bal)}L${x(days).toFixed(1)} ${base}L${x(0).toFixed(1)} ${base}Z" fill="url(#areaFill)"/>`;
  g += line(ess, 'var(--s2)', 2) + line(all, 'var(--s1)', 2.25);
  g += `</g>`;
  if (cks.length) {
    const pts = [...cks].sort((a, b) => a.d - b.d);
    if (pts.length > 1) g += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + x(p.d) + ' ' + y(p.v)).join('')}" fill="none" stroke="var(--s3)" stroke-width="2"/>`;
    pts.forEach(p => { g += `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="4.5" fill="var(--s3)" stroke="var(--bg-2)" stroke-width="2"/>`; });
  }
  const mark = (sim, col, below) => {
    if (sim.out < 0 || sim.out > days) return '';
    const cx = x(sim.out), cy = y(sim.bal[sim.out]);
    const label = `Out ${fmtDate(addDays(t0, sim.out), { month: 'short', day: 'numeric' })}`;
    const w = label.length * 6.4 + 16, ty = below ? cy + 12 : cy - 32;
    const lx = Math.max(M.l, Math.min(W - M.r - w, cx - w / 2));
    return `<circle cx="${cx}" cy="${cy}" r="5.5" fill="${col}" stroke="var(--bg-2)" stroke-width="2.5"/>
      <rect x="${lx}" y="${ty}" width="${w}" height="20" rx="10" fill="#3a3a3c"/>
      <text x="${lx + w / 2}" y="${ty + 14}" text-anchor="middle" font-size="11" font-weight="600" fill="#fff">${label}</text>`;
  };
  g += mark(all, 'var(--s1)', false);
  if (ess.out !== all.out) g += mark(ess, 'var(--s2)', true);
  if (M.r > 40) {
    const cy = v => Math.max(M.t + 8, Math.min(Hh - M.b - 4, y(v)));
    let ya = cy(all.bal[days]), ye = cy(ess.bal[days]);
    if (Math.abs(ya - ye) < 28) { const mid = (ya + ye) / 2, s = ya <= ye ? -1 : 1; ya = mid + s * 14; ye = mid - s * 14; }
    g += `<text x="${W - M.r + 10}" y="${ya - 2}" font-size="11" fill="rgba(235,235,245,.55)">All bills</text><text x="${W - M.r + 10}" y="${ya + 12}" font-size="12" font-weight="600" fill="#fff">${compact(all.bal[days])}</text>`;
    g += `<text x="${W - M.r + 10}" y="${ye - 2}" font-size="11" fill="rgba(235,235,245,.55)">Essentials</text><text x="${W - M.r + 10}" y="${ye + 12}" font-size="12" font-weight="600" fill="#fff">${compact(ess.bal[days])}</text>`;
  }
  g += `<g id="hover" style="display:none"><line id="hx" y1="${M.t}" y2="${Hh - M.b}" stroke="rgba(235,235,245,.35)" stroke-width="1"/>
        <circle id="ha" r="5" fill="var(--s1)" stroke="var(--bg-2)" stroke-width="2.5"/><circle id="he" r="5" fill="var(--s2)" stroke="var(--bg-2)" stroke-width="2.5"/></g>
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
    tip.style.top = '0px';
    tip.style.left = (tx + 16 + tip.offsetWidth > bx.width ? Math.max(0, tx - tip.offsetWidth - 16) : tx + 16) + 'px';
  };
  const hit = svg.querySelector('#hit');
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { hov.style.display = 'none'; tip.style.display = 'none'; });
}

/* =====================================================================
 * Sheets (dialogs) and validation
 * ===================================================================== */
const dlg = document.getElementById('dlg'), form = document.getElementById('dlgForm');
let onSubmit = null;
function openDialog(title, bodyHTML, submitLabel, handler) {
  form.innerHTML = `<div class="sheet-head"><button type="button" class="btn plain" data-close>Cancel</button><h3>${title}</h3><button class="btn plain primary" value="ok">${submitLabel}</button></div>
    <div class="sheet-body">${bodyHTML}<div class="form-error" role="alert" hidden></div></div>`;
  onSubmit = handler;
  if (dlg.open) dlg.close();
  dlg.showModal();
  const first = form.querySelector('.sheet-body input:not([type=checkbox]), .sheet-body select');
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
  if (res.label) toast(res.label, () => { S = C.normalizeState(JSON.parse(before)).state; render(); toast('Undone'); });
});
form.addEventListener('click', e => { if (e.target.closest('[data-close]')) dlg.close(); });
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });   // tap outside the sheet

/* sheet building blocks */
const grp = (...rows) => `<div class="group">${rows.join('')}</div>`;
const frow = (label, input) => `<label class="frow"><span>${label}</span>${input}</label>`;
const gap = '<div style="height:24px"></div>';
const note = t => `<div class="sect-foot" style="padding-bottom:4px">${t}</div>`;
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
  if (end && end < fd.next) return { error: 'The last payment can\'t be before the next date.', field: 'end' };
  return { ok: { name, amount, freq: fd.freq, next: fd.next, end } };
}
function anchorFor(prev, next, freq) {
  if (!['monthly', 'quarterly', 'semiannual', 'annual'].includes(freq)) return undefined;
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
  openDialog(isNew ? 'New Bill' : 'Edit Bill', `
    ${isNew ? '' : grp(`<button type="button" class="list-row action-row" data-action="settle" data-kind="bill" data-id="${esc(b.id)}">Mark Paid…</button>`) + gap}
    ${grp(frow('Name', `<input type="text" name="name" required maxlength="120" value="${esc(v.name)}" placeholder="Rent, insurance…">`),
          frow('Amount', `<input type="text" inputmode="decimal" name="amount" required value="${esc(v.amount)}" placeholder="$0.00">`))}
    ${gap}
    ${grp(frow('Repeats', freqSelect(v.freq)),
          frow('Next Due', `<input type="date" name="next" required value="${esc(v.next)}">`),
          frow('Ends', `<input type="date" name="end" value="${esc(v.end || '')}">`))}
    ${note('Set an end date for loans or plans that finish, like a car payment.')}
    ${gap}
    ${grp(frow('Category', `<input type="text" name="category" maxlength="40" list="catList" value="${esc(v.category)}"><datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`),
          frow('Essential', `<input type="checkbox" class="switch" name="essential" ${v.essential ? 'checked' : ''}>`),
          frow('Can Pay by Card', `<input type="checkbox" class="switch" name="card" ${v.card ? 'checked' : ''}>`))}
    ${note('Essentials are bills you\'d keep paying on a bare-bones budget. Turn on Can Pay by Card if this biller takes credit cards; when cash runs low, your cards can cover it.')}
    ${isNew ? '' : gap + grp(`<button type="button" class="list-row action-row destructive" data-action="del" data-kind="bill" data-id="${esc(b.id)}">Delete Bill</button>`)}
  `, isNew ? 'Add' : 'Done', fd => {
    const r = validateFlow(fd);
    if (r.error) return r;
    upsert(S.bills, b, { id: b ? b.id : C.uid(), ...r.ok, anchorDay: anchorFor(b, r.ok.next, r.ok.freq), category: String(fd.category || '').trim().slice(0, 40) || 'Other', essential: !!fd.essential, card: !!fd.card });
    return { label: isNew ? `Added ${r.ok.name}` : `Saved ${r.ok.name}` };
  });
}
function editIncome(i) {
  const isNew = !i;
  const v = i || { name: '', amount: '', freq: 'weekly', next: iso(today()), end: '' };
  openDialog(isNew ? 'New Income' : 'Edit Income', `
    ${grp(frow('Source', `<input type="text" name="name" required maxlength="120" value="${esc(v.name)}" placeholder="Unemployment, freelance…">`),
          frow('Amount', `<input type="text" inputmode="decimal" name="amount" required value="${esc(v.amount)}" placeholder="$0.00 after tax">`))}
    ${gap}
    ${grp(frow('Repeats', freqSelect(v.freq)),
          frow('Next Payment', `<input type="date" name="next" required value="${esc(v.next)}">`),
          frow('Ends', `<input type="date" name="end" value="${esc(v.end || '')}">`))}
    ${note('Use “One time” for severance or a tax refund.')}
    ${gap}
    ${grp(frow('Balance Left', `<input type="text" inputmode="decimal" name="remaining" value="${esc(v.remaining ?? '')}" placeholder="Optional">`),
          frow('Each Payment Before Tax', `<input type="text" inputmode="decimal" name="gross" value="${esc(v.gross ?? '')}" placeholder="Optional">`))}
    ${note('For unemployment: enter the benefit balance left and the weekly amount before withholding, both from your state’s benefits portal. Runway counts the balance down with each payment and stops the income when it runs out, so you don’t need an end date.')}
    ${isNew ? '' : gap + grp(`<button type="button" class="list-row action-row destructive" data-action="del" data-kind="income" data-id="${esc(i.id)}">Delete Income</button>`)}
  `, isNew ? 'Add' : 'Done', fd => {
    const r = validateFlow(fd);
    if (r.error) return r;
    const hasRem = String(fd.remaining || '').trim() !== '', hasGross = String(fd.gross || '').trim() !== '';
    let benefit = {};
    if (hasRem || hasGross) {
      const remaining = amountOf(fd.remaining), gross = amountOf(fd.gross, { allowZero: false });
      if (remaining === null) return { error: 'Enter the balance left as a number, or clear both benefit fields.', field: 'remaining' };
      if (gross === null) return { error: 'Enter each payment before tax, or clear both benefit fields.', field: 'gross' };
      if (gross < r.ok.amount) return { error: 'The amount before tax can’t be less than the amount deposited.', field: 'gross' };
      benefit = { remaining, gross };
    }
    upsert(S.income, i, { id: i ? i.id : C.uid(), ...r.ok, anchorDay: anchorFor(i, r.ok.next, r.ok.freq), ...benefit });
    return { label: isNew ? `Added ${r.ok.name}` : `Saved ${r.ok.name}` };
  });
}
function editAccount(a, presetType) {
  const isNew = !a;
  const v = a || { name: '', balance: '', include: true, type: presetType === 'credit' ? 'credit' : 'cash', limit: '', apr: '' };
  const isCredit = v.type === 'credit';
  openDialog(isNew ? (isCredit ? 'New Credit Card' : 'New Account') : (isCredit ? 'Edit Credit Card' : 'Edit Account'), `
    ${grp(frow('Type', `<select name="type"><option value="cash" ${!isCredit ? 'selected' : ''}>Cash account</option><option value="credit" ${isCredit ? 'selected' : ''}>Credit card</option></select>`),
          frow('Name', `<input type="text" name="name" required maxlength="120" value="${esc(v.name)}" placeholder="${isCredit ? 'Rewards card…' : 'Checking, savings…'}">`),
          `<label class="frow"><span data-label-balance>${isCredit ? 'Amount Owed' : 'Balance'}</span><input type="text" ${isCredit ? 'inputmode="decimal"' : ''} name="balance" required value="${esc(v.balance)}" placeholder="$0.00"></label>`,
          `<label class="frow" data-for="credit" ${isCredit ? '' : 'hidden'}><span>Credit Limit</span><input type="text" inputmode="decimal" name="limit" value="${esc(v.limit ?? '')}" placeholder="$0.00"></label>`,
          `<label class="frow" data-for="credit" ${isCredit ? '' : 'hidden'}><span>Interest Rate (APR)</span><input type="text" inputmode="decimal" name="apr" value="${esc(v.apr ?? '')}" placeholder="0%"></label>`)}
    <div data-for="cash" ${isCredit ? 'hidden' : ''}>${note('Use a minus sign if the account is overdrawn.')}</div>
    <div data-for="credit" ${isCredit ? '' : 'hidden'}>${note('Use the purchase APR from your statement. Promotional 0% offers count as 0 until they end.')}</div>
    ${gap}
    ${grp(`<label class="frow"><span data-label-include>${isCredit ? 'Use for Runway' : 'Count Toward Runway'}</span><input type="checkbox" class="switch" name="include" ${v.include !== false ? 'checked' : ''}></label>`)}
  `, isNew ? 'Add' : 'Done', fd => {
    const type = fd.type === 'credit' ? 'credit' : 'cash';
    const name = String(fd.name || '').trim().slice(0, 120);
    if (!name) return { error: 'Give the account a name.', field: 'name' };
    const balance = amountOf(fd.balance, { allowNegative: type === 'cash' });
    if (balance === null) return { error: type === 'credit' ? 'Enter what you owe as a number, like 450 or 0.' : 'Enter the balance as a number, like 2500 or 2,500.00.', field: 'balance' };
    const rec = { id: a ? a.id : C.uid(), name, type, balance, include: !!fd.include, updated: iso(today()) };
    if (type === 'credit') {
      const limit = amountOf(fd.limit, { allowZero: false });
      if (limit === null) return { error: 'Enter the card’s credit limit.', field: 'limit' };
      const apr = amountOf(String(fd.apr || '0').replace('%', ''));
      if (apr === null || apr > 100) return { error: 'Enter the APR as a percentage, like 24.99.', field: 'apr' };
      Object.assign(rec, { limit, apr });
    }
    upsert(S.accounts, a, rec);
    return { label: isNew ? `Added ${name}` : `Saved ${name}` };
  });
}
/* Switching the type in the account sheet shows the matching fields. */
form.addEventListener('change', e => {
  if (e.target.name !== 'type') return;
  const credit = e.target.value === 'credit';
  form.querySelectorAll('[data-for]').forEach(el => { el.hidden = el.dataset.for !== (credit ? 'credit' : 'cash'); });
  const bl = form.querySelector('[data-label-balance]'); if (bl) bl.textContent = credit ? 'Amount Owed' : 'Balance';
  const il = form.querySelector('[data-label-include]'); if (il) il.textContent = credit ? 'Use for Runway' : 'Count Toward Runway';
  form.querySelector('.sheet-head h3').textContent = credit ? 'Credit Card' : 'Account';
});
/** Benefit payments reduce the balance left. */
function countDown(item) {
  if (item.remaining > 0 && item.gross > 0) item.remaining = round2(Math.max(0, item.remaining - item.gross));
}
/** Every bill and income dated before today, with how many times each came due. */
function pastDue() {
  const t0 = today(), y = addDays(t0, -1), out = [];
  for (const [kind, list] of [['bill', S.bills], ['income', S.income]]) {
    for (const it of list) {
      const dates = C.occurrences(it, y);
      if (dates.length) out.push({ kind, it, dates });
    }
  }
  return out.sort((a, b) => a.dates[0] - b.dates[0]);
}
function checkinDialog() {
  if (!S.accounts.length) { editAccount(); return; }
  const due = pastDue();
  const dueRows = due.map(({ kind, it, dates }) => frow(
    `${esc(it.name)}<span class="l2" style="display:block;font-size:12px">${dates.length > 1 ? `${dates.length} times since ` : ''}${fmtDate(dates[0], { month: 'short', day: 'numeric' })} · ${kind === 'bill' ? '−' : '+'}${money(it.amount * dates.length, true)}</span>`,
    `<input type="checkbox" class="switch" name="done_${kind}_${esc(it.id)}" checked>`));
  openDialog('Check In', `
    <div class="lead">Enter what each account shows right now.</div>
    ${grp(...S.accounts.map(a => frow(esc(a.name) + (a.type === 'credit' ? ' <span class="l2">owed</span>' : ''), `<input type="text" inputmode="decimal" name="acc_${esc(a.id)}" value="${a.balance}">`)))}
    ${due.length ? `${gap}<div class="sect"><span>Already Happened</span><span>${due.length}</span></div>${grp(...dueRows)}
      ${note('These were due before today, so your balances above should already include them. They’ll be marked done and moved to their next date. Switch off anything that hasn’t actually gone through yet.')}` : ''}
  `, 'Save', fd => {
    const vals = {};
    for (const a of S.accounts) {
      const val = amountOf(fd['acc_' + a.id], { allowNegative: a.type !== 'credit' });
      if (val === null) return { error: `Enter a number for ${a.name}.`, field: 'acc_' + a.id };
      vals[a.id] = val;
    }
    const d = iso(today());
    S.accounts.forEach(a => { a.balance = vals[a.id]; a.updated = d; });
    let settled = 0;
    for (const { kind, it, dates } of due) {
      if (!fd[`done_${kind}_${it.id}`]) continue;
      const list = listFor(kind);
      if (!list.includes(it)) continue;
      for (const dt of dates) {
        S.activity.push({ date: iso(dt), name: it.name, amount: kind === 'bill' ? -it.amount : it.amount, account: 'Settled at check-in' });
        if (kind === 'income') countDown(it);
        settled++;
      }
      let n = it.next;
      for (let k = 0; k < dates.length && n; k++) { it.next = n; n = C.nextAfter(it); }
      if (n) it.next = n; else list.splice(list.indexOf(it), 1);
    }
    if (S.activity.length > C.MAX_ACTIVITY) S.activity = S.activity.slice(-C.MAX_ACTIVITY);
    S.checkins = S.checkins.filter(c => c.date !== d);
    S.checkins.push({ date: d, total: cashTotal() });
    S.checkins.sort((x, y) => x.date.localeCompare(y.date));
    return { label: `Checked in at ${money(cashTotal())}${settled ? ` · ${settled} item${settled === 1 ? '' : 's'} marked done` : ''}` };
  });
}
function settle(kind, id) {
  const list = listFor(kind), item = list.find(x => x.id === id);
  if (!item) return;
  const cashAccs = S.accounts.filter(a => a.type !== 'credit');
  const counted = cashAccs.filter(a => a.include !== false);
  const accs = (counted.length ? counted : cashAccs).concat(kind === 'bill' && item.card ? S.accounts.filter(a => a.type === 'credit') : []);
  const nxt = C.nextAfter(item);
  openDialog(kind === 'bill' ? 'Mark Paid' : 'Mark Received', `
    <div class="lead">${esc(item.name)}</div>
    ${grp(frow('Amount', `<input type="text" inputmode="decimal" name="amount" value="${item.amount}">`),
          frow('Date', `<input type="date" name="date" value="${iso(today())}">`),
          ...(accs.length ? [frow(kind === 'bill' ? 'Paid From' : 'Deposit To', `<select name="acc">${accs.map(a => `<option value="${esc(a.id)}">${esc(a.name)}${a.type === 'credit' ? ' (card)' : ''}</option>`).join('')}<option value="">None</option></select>`)] : []))}
    ${note(nxt ? `Next date moves to ${fmtDate(parse(nxt))}.` : 'This was the last one, so it will be removed.')}
    ${gap}${grp(`<button type="button" class="list-row action-row" data-action="skip" data-kind="${kind}" data-id="${esc(item.id)}">Skip This Time</button>`)}
    ${note('Skip moves it to the next date without changing any balance, for a bill that was waived or a payment that won’t come.')}
  `, kind === 'bill' ? 'Paid' : 'Done', fd => {
    const amt = amountOf(fd.amount);
    if (amt === null) return { error: 'Enter the amount as a number.', field: 'amount' };
    if (!isISODate(fd.date)) return { error: 'Enter a valid date.', field: 'date' };
    if (!list.includes(item)) return { error: 'This item was changed or removed (maybe in another tab). Close and try again.' };
    const acc = S.accounts.find(a => a.id === fd.acc);
    if (acc) { acc.balance = round2(acc.balance + (acc.type === 'credit' ? amt : kind === 'bill' ? -amt : amt)); acc.updated = iso(today()); }
    S.activity.push({ date: fd.date, name: item.name, amount: kind === 'bill' ? -amt : amt, account: acc ? acc.name : '' });
    if (S.activity.length > C.MAX_ACTIVITY) S.activity = S.activity.slice(-C.MAX_ACTIVITY);
    countDown(item);
    const n = C.nextAfter(item);
    if (n) item.next = n; else list.splice(list.indexOf(item), 1);
    return { label: `${item.name} marked ${kind === 'bill' ? 'paid' : 'received'}` };
  });
}

/* =====================================================================
 * What If
 * ===================================================================== */
const WI = {
  sell:    { icon: 'dollar',    color: 'green',  title: 'Sell Something',        desc: 'A car or other asset, with or without paying off its loan' },
  bill:    { icon: 'bills',     color: 'orange', title: 'Pause or Change a Bill', desc: 'A mortgage deferral, a lower payment, or cancelling something' },
  job:     { icon: 'briefcase', color: 'blue',   title: 'New Job',               desc: 'Paychecks start and unemployment stops' },
  income:  { icon: 'income',    color: 'teal',   title: 'Extra Income',          desc: 'Side work, freelance, or a one-time payment' },
  expense: { icon: 'cart',      color: 'red',    title: 'New Expense',           desc: 'A one-time cost or a new regular bill' }
};
const WI_H = () => Math.round(36 * MONTH);

function wiRun(st) {
  const t0 = today(), H = WI_H();
  return { cash: C.simulate(st, { days: H }, t0), cred: C.creditSummary(st).cards ? C.creditProjection(st, { days: H }, t0) : null };
}
const wiMonths = r => (r.out < 0 ? WI_H() : r.out) / MONTH;
function wiCovered(r) {
  if (r.out < 0) return { big: '36+', date: 'beyond 3 years' };
  if (r.out === 0) return { big: '0', date: 'below your cushion now' };
  return { big: (r.out / MONTH).toFixed(1), date: 'until ' + fmtDate(addDays(today(), r.out), { month: 'short', day: 'numeric', year: 'numeric' }) };
}
const wiDelta = (a, b) => {
  if (a.out < 0 && b.out < 0) return '';
  const d = wiMonths(b) - wiMonths(a);
  if (Math.abs(d) < 0.05) return '±0 months';
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} month${Math.abs(d) >= 0.95 && Math.abs(d) < 1.05 ? '' : 's'}`;
};
const nameOf = (list, id) => { const x = list.find(i => i.id === id); return x ? x.name : 'a deleted item'; };

function wiSummary(sc) {
  const p = sc.p, d = v => safeDate(v, { month: 'short', day: 'numeric', year: 'numeric' }), f = v => FREQ[v].label.toLowerCase();
  switch (sc.type) {
    case 'sell': return `+${money(p.amount)} on ${d(p.date)}${p.billId ? ` · stops ${nameOf(S.bills, p.billId)}` : ''}${p.payoff ? ` · pays off ${money(p.payoff)}` : ''}`;
    case 'bill': return p.mode === 'pause'
      ? `Pauses ${nameOf(S.bills, p.billId)} for ${p.months} month${p.months === 1 ? '' : 's'} from ${d(p.from)}`
      : p.amount === 0 ? `Cancels ${nameOf(S.bills, p.billId)} from ${d(p.from)}` : `${nameOf(S.bills, p.billId)} becomes ${money(p.amount)} from ${d(p.from)}`;
    case 'job': return `+${money(p.amount)} ${f(p.freq)} from ${d(p.start)}${p.stopIncomeId ? ` · ends ${nameOf(S.income, p.stopIncomeId)}` : ''}`;
    case 'income': return p.freq === 'once' ? `+${money(p.amount)} on ${d(p.start)}` : `+${money(p.amount)} ${f(p.freq)} from ${d(p.start)}${p.end ? ` to ${d(p.end)}` : ''}`;
    case 'expense': return p.freq === 'once' ? `−${money(p.amount)} on ${d(p.start)}` : `−${money(p.amount)} ${f(p.freq)} from ${d(p.start)}${p.end ? ` to ${d(p.end)}` : ''}`;
  }
  return '';
}

let wiCache = null;
function whatIfView() {
  const on = S.scenarios.filter(x => x.on);
  const base = wiRun(S), scen = on.length ? wiRun(C.applyScenarios(S, on)) : null;
  wiCache = { base, scen };
  const b = wiCovered(base.cash), w = scen ? wiCovered(scen.cash) : null;
  const delta = scen ? wiDelta(base.cash, scen.cash) : '';
  const credLine = base.cred ? `<div class="wi-credit">
      <span class="l2">With the main card</span>
      <span class="num"><b>${wiCovered(base.cred).big}</b> mo${scen && scen.cred ? ` → <b style="color:var(--blue)">${wiCovered(scen.cred).big}</b> mo` : ''}</span>
    </div>` : '';
  const compare = `<section class="card pad wi-compare">
    <div class="wi-cols">
      <div><div class="wi-k">Today</div><div class="wi-big num">${b.big}<small> mo</small></div><div class="foot13">${b.date}</div></div>
      <div class="wi-arrow" aria-hidden="true">${ic('chevron')}</div>
      <div><div class="wi-k" style="color:var(--blue)">With what-ifs on</div>
        ${w ? `<div class="wi-big num" style="color:var(--blue)">${w.big}<small> mo</small></div><div class="foot13">${w.date}</div>`
            : '<div class="wi-big l3">—</div><div class="foot13">Switch on a scenario below</div>'}</div>
      ${delta ? `<span class="tag ${delta.startsWith('+') ? 'green' : delta.startsWith('−') ? 'red' : ''} wi-delta">${delta}</span>` : ''}
    </div>
    ${credLine}
    <div class="legend" style="padding:16px 0 0">
      <span><i style="background:var(--gray)"></i>Today</span>
      ${scen ? '<span><i style="background:var(--s1)"></i>With what-ifs</span>' : ''}
    </div>
    <div class="chart-box" id="wiChart" style="margin:10px 0 0"></div>
  </section>`;

  const rows = S.scenarios.map(sc => {
    const t = WI[sc.type], alone = wiRun(C.applyScenarios(S, [sc]));
    const d = wiDelta(base.cash, alone.cash), dc = base.cred && alone.cred ? wiDelta(base.cred, alone.cred) : '';
    return `<div class="list-row has-tile split">
      <button type="button" class="row-main" data-action="scenario-edit" data-id="${esc(sc.id)}" aria-label="Edit ${esc(sc.name)}">
        ${tile(t.icon, t.color)}
        <div class="body">
          <div class="t">${esc(sc.name)}</div>
          <div class="s" style="white-space:normal">${esc(wiSummary(sc))}</div>
          <div class="wi-impact"><span class="tag ${d.startsWith('+') ? 'green' : d.startsWith('−') ? 'red' : ''}">${d || 'No change'}</span>${dc && dc !== d ? `<span class="foot13">${dc} with card</span>` : ''}</div>
        </div>
      </button>
      <input type="checkbox" class="switch row-switch" data-action="scenario-toggle" data-id="${esc(sc.id)}" ${sc.on ? 'checked' : ''} aria-label="Include ${esc(sc.name)}">
    </div>`;
  }).join('');

  const templates = Object.entries(WI).map(([k, t]) => `<button type="button" class="list-row has-tile" data-action="scenario-new" data-type="${k}">${tile(t.icon, t.color)}<div class="body"><div class="t">${t.title}</div><div class="s" style="white-space:normal">${t.desc}</div></div>${ic('chevron', 'chev')}</button>`).join('');

  return `${compare}
  <div>
    <div class="sect"><span>Scenarios</span><span>${on.length} of ${S.scenarios.length} on</span></div>
    ${S.scenarios.length ? `<div class="group">${rows}</div>` : `<div class="group">${emptyHTML('sparkles', 'blue', 'No Scenarios Yet', 'Pick one below to see how it changes your runway. Your real numbers never change.')}</div>`}
    <div class="sect-foot">The number on each scenario is what it adds on its own. Switch several on to see them combined at the top. Scenarios never change your real bills, income or balances, and your household sees the same ones.</div>
  </div>
  <div>
    <div class="sect"><span>Add a Scenario</span></div>
    <div class="group">${templates}</div>
  </div>`;
}

/* Two-line comparison chart: today vs with what-ifs. */
function drawCompare() {
  const box = document.getElementById('wiChart');
  if (!box || !wiCache) return;
  const { base, scen } = wiCache;
  const W = Math.max(280, box.clientWidth || 300), Hh = W < 560 ? 210 : 260;
  const M = { l: 46, r: 8, t: 14, b: 26 };
  const t0 = today(), days = Math.round(24 * MONTH);
  const series = [{ bal: base.cash.bal, out: base.cash.out, color: 'var(--gray)', w: 2 }];
  if (scen) series.push({ bal: scen.cash.bal, out: scen.cash.out, color: 'var(--s1)', w: 2.25 });
  let lo = Math.min(0, S.settings.cushion), hi = Math.max(0, S.settings.cushion);
  for (const s of series) for (let d = 0; d <= days; d++) { lo = Math.min(lo, s.bal[d]); hi = Math.max(hi, s.bal[d]); }
  if (hi - lo < 1) hi = lo + 1000;
  lo = Math.max(lo, -Math.max(hi * 0.3, S.settings.cushion, 2000));
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const x = d => M.l + d / days * (W - M.l - M.r);
  const y = v => M.t + (hi - v) / (hi - lo) * (Hh - M.t - M.b);
  const plotW = W - M.l - M.r;
  let g = `<defs><clipPath id="wiClip"><rect x="${M.l}" y="${M.t - 6}" width="${plotW}" height="${Hh - M.t - M.b + 6}"/></clipPath></defs>`;
  for (let v = lo; v <= hi + step / 2; v += step) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-dasharray="2 4"/><text x="${M.l - 10}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="rgba(235,235,245,.5)">${compact(v)}</text>`;
  if (lo < 0) g += `<rect x="${M.l}" y="${y(0)}" width="${plotW}" height="${Hh - M.b - y(0)}" fill="rgba(255,69,58,.07)"/>`;
  g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--axis)"/>`;
  let mt = new Date(t0.getFullYear(), t0.getMonth() + 1, 1), idx = 0;
  const every = W < 560 ? 6 : 3;
  while (daysBetween(t0, mt) <= days) {
    if (idx % every === 0) { const mon = mt.toLocaleDateString(undefined, { month: 'short' }); g += `<text x="${x(daysBetween(t0, mt))}" y="${Hh - 6}" text-anchor="middle" font-size="11" fill="rgba(235,235,245,.5)">${mt.getMonth() === 0 || idx === 0 ? `${mon} ’${String(mt.getFullYear()).slice(2)}` : mon}</text>`; }
    mt = new Date(mt.getFullYear(), mt.getMonth() + 1, 1); idx++;
  }
  const seg = (bal, a, b) => { let p = ''; for (let d = a; d <= b; d++) p += (d === a ? 'M' : 'L') + x(d).toFixed(1) + ' ' + y(bal[d]).toFixed(1); return p; };
  g += '<g clip-path="url(#wiClip)">';
  for (const s of series) {
    const cut = s.out < 0 || s.out > days ? days : s.out;
    g += `<path d="${seg(s.bal, 0, cut)}" fill="none" stroke="${s.color}" stroke-width="${s.w}" stroke-linejoin="round"/>`;
    if (cut < days) g += `<path d="${seg(s.bal, cut, days)}" fill="none" stroke="${s.color}" stroke-width="${s.w}" stroke-opacity=".28" stroke-dasharray="3 4"/>`;
  }
  g += '</g>';
  for (const s of series) if (s.out >= 0 && s.out <= days) g += `<circle cx="${x(s.out)}" cy="${y(s.bal[s.out])}" r="5" fill="${s.color}" stroke="var(--bg-2)" stroke-width="2.5"/>`;
  g += `<g id="wiHover" style="display:none"><line id="wiHx" y1="${M.t}" y2="${Hh - M.b}" stroke="rgba(235,235,245,.35)"/></g><rect id="wiHit" x="${M.l}" y="${M.t}" width="${plotW}" height="${Hh - M.t - M.b}" fill="transparent"/>`;
  box.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Cash balance today versus with what-ifs, next 24 months">${g}</svg><div class="tip" id="wiTip"></div>`;
  const svg = box.querySelector('svg'), tip = box.querySelector('#wiTip'), hov = svg.querySelector('#wiHover'), hx = svg.querySelector('#wiHx');
  const move = ev => {
    const r = svg.getBoundingClientRect(), d = Math.max(0, Math.min(days, Math.round(((ev.clientX - r.left) * (W / r.width) - M.l) / plotW * days)));
    hov.style.display = ''; hx.setAttribute('x1', x(d)); hx.setAttribute('x2', x(d));
    tip.innerHTML = `<div class="t">${fmtDate(addDays(t0, d), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
      <div class="row"><span><i style="background:var(--gray)"></i>Today</span><b class="num">${money(base.cash.bal[d])}</b></div>
      ${scen ? `<div class="row"><span><i style="background:var(--s1)"></i>With what-ifs</span><b class="num">${money(scen.cash.bal[d])}</b></div>` : ''}`;
    tip.style.display = 'block';
    const bx = box.getBoundingClientRect(), tx = ev.clientX - bx.left;
    tip.style.top = '0px'; tip.style.left = (tx + 16 + tip.offsetWidth > bx.width ? Math.max(0, tx - tip.offsetWidth - 16) : tx + 16) + 'px';
  };
  const hit = svg.querySelector('#wiHit');
  hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
  hit.addEventListener('pointerleave', () => { hov.style.display = 'none'; tip.style.display = 'none'; });
}

/* Summary: a short line when what-ifs are on. */
function whatIfHint() {
  const on = S.scenarios.filter(x => x.on);
  if (!on.length) return '';
  const H = Math.round(S.settings.horizon * MONTH), t0 = today();
  const r = C.simulate(C.applyScenarios(S, on), { days: H }, t0);
  const d = wiDelta(model.all, r);
  const when = r.out < 0 ? `beyond ${S.settings.horizon} months` : 'until ' + fmtDate(addDays(t0, r.out), { month: 'short', day: 'numeric', year: 'numeric' });
  return `<div class="group"><button type="button" class="list-row has-tile" data-action="tab" data-tab="whatif">${tile('sparkles', 'blue')}<div class="body"><div class="t">With ${on.length} what-if${on.length === 1 ? '' : 's'} on: covered ${when}</div><div class="s">${d ? `${d} versus today · ` : ''}${esc(on.map(x => x.name).join(', '))}</div></div>${ic('chevron', 'chev')}</button></div>`;
}

/* Scenario sheet */
function editScenario(existing, type) {
  const isNew = !existing;
  const t = type || existing.type, info = WI[t];
  const p = existing ? existing.p : {};
  const d0 = iso(addDays(today(), 30));
  const billOpts = (sel, none) => `<select name="billId">${none ? `<option value="">${none}</option>` : ''}${S.bills.filter(b => b.freq !== 'once').map(b => `<option value="${esc(b.id)}" ${sel === b.id ? 'selected' : ''}>${esc(b.name)} (${money(b.amount)})</option>`).join('')}</select>`;
  const incomeGuess = (S.income.find(i => i.remaining > 0 || /unemploy|benefit/i.test(i.name)) || {}).id || '';
  const freqs = (v, once) => `<select name="freq">${Object.entries(FREQ).filter(([k]) => once || k !== 'once').map(([k, f]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${f.label}</option>`).join('')}</select>`;
  const name = frow('Name', `<input type="text" name="name" required maxlength="120" value="${esc(existing ? existing.name : '')}" placeholder="${{ sell: 'Sell the Corvette', bill: 'Mortgage deferral', job: 'New job', income: 'Freelance work', expense: 'New expense' }[t]}">`);
  const amt = (label, v, ph = '$0.00') => frow(label, `<input type="text" inputmode="decimal" name="amount" value="${esc(v ?? '')}" placeholder="${ph}">`);
  let body = '';
  if (t === 'sell') body = `${grp(name, amt('Sale Amount', p.amount), frow('Date', `<input type="date" name="date" value="${esc(p.date || d0)}">`))}${gap}
    ${grp(frow('Stops a Payment', billOpts(p.billId || '', 'None, keep paying')), frow('Loan Payoff', `<input type="text" inputmode="decimal" name="payoff" value="${esc(p.payoff || '')}" placeholder="Optional">`))}
    ${note('To keep a loan after selling (like the LightStream loan on the Corvette), leave Stops a Payment on None. To pay a loan off from the sale, pick its payment and enter the payoff amount.')}`;
  else if (t === 'bill') body = `${grp(name, frow('Bill', billOpts(p.billId || '')), frow('Change', `<select name="mode"><option value="pause" ${p.mode !== 'change' ? 'selected' : ''}>Pause it</option><option value="change" ${p.mode === 'change' ? 'selected' : ''}>New amount</option></select>`), frow('Starting', `<input type="date" name="from" value="${esc(p.from || iso(new Date(today().getFullYear(), today().getMonth() + 1, 1)))}">`),
      `<label class="frow" data-for-mode="pause" ${p.mode === 'change' ? 'hidden' : ''}><span>For How Many Months</span><input type="number" name="months" min="1" max="36" value="${esc(p.months || 3)}"></label>`,
      `<label class="frow" data-for-mode="change" ${p.mode === 'change' ? '' : 'hidden'}><span>New Amount</span><input type="text" inputmode="decimal" name="newAmount" value="${esc(p.mode === 'change' ? p.amount : '')}" placeholder="$0 cancels it"></label>`)}
    ${note('Pause for a mortgage deferral or a lender hardship plan: payments stop, then resume. New amount for a lower payment from a date on; $0 cancels the bill.')}`;
  else if (t === 'job') body = `${grp(name, amt('Take-Home Pay', p.amount, 'Per paycheck'), frow('Paid', freqs(p.freq || 'biweekly')), frow('First Paycheck', `<input type="date" name="start" value="${esc(p.start || d0)}">`))}${gap}
    ${grp(frow('Ends Income', `<select name="stopIncomeId"><option value="">Nothing</option>${S.income.map(i => `<option value="${esc(i.id)}" ${(existing ? p.stopIncomeId : incomeGuess) === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>`))}
    ${note('Unemployment usually stops when a job starts, so it ends the day before the first paycheck.')}`;
  else body = `${grp(name, amt('Amount', p.amount), frow('Repeats', freqs(p.freq || (t === 'income' ? 'monthly' : 'once'), true)), frow('Starts', `<input type="date" name="start" value="${esc(p.start || d0)}">`), frow('Ends', `<input type="date" name="end" value="${esc(p.end || '')}">`))}
    ${t === 'expense' ? gap + grp(frow('Can Pay by Card', `<input type="checkbox" class="switch" name="card" ${p.card ? 'checked' : ''}>`), frow('Essential', `<input type="checkbox" class="switch" name="essential" ${p.essential !== false ? 'checked' : ''}>`)) : ''}
    ${note(t === 'income' ? 'Use One time for a single payment, like a bonus or a sale.' : 'Use One time for a single cost, like a repair or a trip.')}`;
  const del = isNew ? '' : gap + grp(`<button type="button" class="list-row action-row destructive" data-action="scenario-del" data-id="${esc(existing.id)}">Delete Scenario</button>`);
  openDialog(isNew ? info.title : 'Edit Scenario', `<div class="lead">${info.desc}. This doesn’t change your real numbers.</div>${body}${del}`, isNew ? 'Add' : 'Done', fd => {
    const nm = String(fd.name || '').trim().slice(0, 120) || (WI[t].title);
    const dateOk = (v, f) => (isISODate(v) ? null : { error: 'Enter a valid date.', field: f });
    let q;
    if (t === 'sell') {
      const amount = amountOf(fd.amount, { allowZero: false }); if (amount === null) return { error: 'Enter the sale amount.', field: 'amount' };
      const e = dateOk(fd.date, 'date'); if (e) return e;
      const payoff = String(fd.payoff || '').trim() ? amountOf(fd.payoff) : 0; if (payoff === null) return { error: 'Enter the payoff as a number, or leave it blank.', field: 'payoff' };
      q = { amount, date: fd.date, billId: fd.billId || '', payoff };
    } else if (t === 'bill') {
      if (!fd.billId) return { error: 'Choose a bill.', field: 'billId' };
      const e = dateOk(fd.from, 'from'); if (e) return e;
      if (fd.mode === 'change') {
        const a = amountOf(fd.newAmount); if (a === null) return { error: 'Enter the new amount ($0 cancels it).', field: 'newAmount' };
        q = { billId: fd.billId, mode: 'change', from: fd.from, months: 3, amount: a };
      } else {
        const m = Math.round(finite(fd.months, NaN)); if (!(m >= 1 && m <= 36)) return { error: 'Enter 1 to 36 months.', field: 'months' };
        q = { billId: fd.billId, mode: 'pause', from: fd.from, months: m, amount: 0 };
      }
    } else if (t === 'job') {
      const amount = amountOf(fd.amount, { allowZero: false }); if (amount === null) return { error: 'Enter the take-home pay per paycheck.', field: 'amount' };
      const e = dateOk(fd.start, 'start'); if (e) return e;
      q = { amount, freq: fd.freq, start: fd.start, stopIncomeId: fd.stopIncomeId || '' };
    } else {
      const amount = amountOf(fd.amount, { allowZero: false }); if (amount === null) return { error: 'Enter an amount greater than $0.', field: 'amount' };
      const e = dateOk(fd.start, 'start'); if (e) return e;
      if (fd.end && (!isISODate(fd.end) || fd.end < fd.start)) return { error: 'The end date must be after the start, or blank.', field: 'end' };
      q = { amount, freq: fd.freq, start: fd.start, end: fd.end || '', ...(t === 'expense' ? { card: !!fd.card, essential: !!fd.essential } : {}) };
    }
    const rec = C.normalizeState({ scenarios: [{ id: existing ? existing.id : C.uid(), name: nm, type: t, on: existing ? existing.on : true, p: q }] }).state.scenarios[0];
    if (!rec) return { error: 'That scenario isn’t complete yet.' };
    const i = existing ? S.scenarios.findIndex(x => x.id === existing.id) : -1;
    if (i >= 0) S.scenarios[i] = rec; else { if (S.scenarios.length >= 30) return { error: 'You can keep up to 30 scenarios. Delete one first.' }; S.scenarios.push(rec); }
    return { label: isNew ? `Added ${nm}` : `Saved ${nm}` };
  });
}
form.addEventListener('change', e => {
  if (e.target.name !== 'mode') return;
  form.querySelectorAll('[data-for-mode]').forEach(el => { el.hidden = el.dataset.forMode !== e.target.value; });
});

/* =====================================================================
 * Add to Home Screen
 * ===================================================================== */
const APP_URL = 'https://claude.ai/artifact/WAduFqicBoRPJeEwuvM7ci';
function platform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
const STEPS = {
  ios: ['iPhone or iPad', [
    'Tap <b>Copy Link</b> below.',
    'Open <b>Safari</b>, paste the link into the address bar and go. Sign in to claude.ai if asked. (Already reading this in Safari? Skip to step 3.)',
    `Tap the <b>Share</b> button ${ic('upload')} at the bottom of the screen.`,
    'Scroll down, tap <b>Add to Home Screen</b>, name it <b>Runway</b>, then tap <b>Add</b>.'
  ]],
  android: ['Android', [
    'Tap <b>Copy Link</b> below.',
    'Open <b>Chrome</b>, paste the link and go. Sign in to claude.ai if asked.',
    'Tap the <b>⋮</b> menu, then <b>Add to Home screen</b>, name it <b>Runway</b>, then tap <b>Add</b>.'
  ]],
  desktop: ['Computer', [
    'Tap <b>Copy Link</b> below and open it in your browser.',
    '<b>Chrome or Edge:</b> menu, then <b>Cast, save and share</b> (or <b>Apps</b>), then <b>Install page as app</b> or <b>Create shortcut</b>.',
    '<b>Safari on Mac:</b> File, then <b>Add to Dock</b>.'
  ]]
};
function homeScreenDialog() {
  const mine = platform();
  const list = (steps) => `<div class="group steps-list">${steps.map((t, i) => `<div class="list-row"><span class="step-n">${i + 1}</span><div class="body" style="white-space:normal">${t}</div></div>`).join('')}</div>`;
  const others = Object.entries(STEPS).filter(([k]) => k !== mine);
  openDialog('Add to Home Screen', `
    <div class="lead">Runway then opens from an icon like any app, already signed in.</div>
    <div class="group">
      <div class="list-row"><div class="body"><div class="s" style="white-space:normal;overflow-wrap:anywhere;user-select:all;-webkit-user-select:all" id="appLink">${esc(APP_URL)}</div></div><button type="button" class="btn sm primary" data-action="copylink" style="flex:none">Copy Link</button></div>
    </div>
    ${gap}<div class="sect"><span>${STEPS[mine][0]}</span></div>${list(STEPS[mine][1])}
    ${note('The icon shows the Claude logo, since the page lives on claude.ai. The name is whatever you type, so use Runway.')}
    ${others.map(([, [label, steps]]) => `${gap}<details class="other-steps"><summary>${ic('chevron')}${label}</summary>${list(steps)}</details>`).join('')}
  `, 'Done', () => ({}));
}
async function copyLink(btn) {
  let ok = false;
  try { await navigator.clipboard.writeText(APP_URL); ok = true; } catch (e) {}
  if (!ok) {
    const el = document.getElementById('appLink');
    if (el) { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  }
  if (btn) { btn.textContent = ok ? 'Copied' : 'Link selected'; setTimeout(() => { if (btn.isConnected) btn.textContent = 'Copy Link'; }, 2500); }
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
      { name: '401(k)', balance: 62000, include: false, updated: d(0) },
      { name: 'Travel Rewards Card', type: 'credit', balance: 0, limit: 15000, apr: 24.99, updated: d(0) },
      { name: 'Cash Back Card', type: 'credit', balance: 450, limit: 8000, apr: 21.49, updated: d(0) }
    ],
    bills: [
      { name: 'Rent', amount: 1950, freq: 'monthly', next: nextDom(1), category: 'Housing', essential: true },
      { name: 'Electric & gas', amount: 165, freq: 'monthly', next: nextDom(12), category: 'Utilities', essential: true , card: true },
      { name: 'Internet', amount: 70, freq: 'monthly', next: nextDom(18), category: 'Phone & internet', essential: true , card: true },
      { name: 'Phone', amount: 85, freq: 'monthly', next: nextDom(22), category: 'Phone & internet', essential: true , card: true },
      { name: 'Health insurance (COBRA)', amount: 640, freq: 'monthly', next: nextDom(1), category: 'Insurance', essential: true },
      { name: 'Car payment', amount: 389, freq: 'monthly', next: nextDom(15), category: 'Transportation', essential: true, end: inMonths(14) },
      { name: 'Car insurance', amount: 132, freq: 'monthly', next: nextDom(8), category: 'Insurance', essential: true , card: true },
      { name: 'Gas', amount: 60, freq: 'biweekly', next: d(3), category: 'Transportation', essential: true , card: true },
      { name: 'Groceries', amount: 140, freq: 'weekly', next: d(2), category: 'Food', essential: true , card: true },
      { name: 'Student loan', amount: 285, freq: 'monthly', next: nextDom(25), category: 'Debt', essential: true },
      { name: 'Eating out', amount: 180, freq: 'monthly', next: nextDom(28), category: 'Food', essential: false , card: true },
      { name: 'Streaming services', amount: 48, freq: 'monthly', next: nextDom(5), category: 'Subscriptions', essential: false , card: true },
      { name: 'Gym', amount: 55, freq: 'monthly', next: nextDom(3), category: 'Personal', essential: false , card: true },
      { name: 'Renters insurance', amount: 168, freq: 'annual', next: inMonths(4), category: 'Insurance', essential: true , card: true }
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
async function exportBackup() {
  const payload = { app: 'runway-tracker', exportedAt: new Date().toISOString(), ...S };
  const text = JSON.stringify(payload, null, 2);
  const filename = `runway-backup-${iso(today())}.json`;
  const dl = await useCapability('downloads');
  if (dl) {
    try { await dl.save({ filename, data: text }); }
    catch (e) {
      if (e && e.code === 'declined') return;
      await showAlert('Couldn’t Save Backup', e && e.code === 'rate_limited' ? 'A save prompt is already open. Try again in a moment.' : 'Saving files isn’t available here right now.');
      return;
    }
  } else {
    const blob = new Blob([text], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }
  S.settings.lastExport = iso(today());
  render();
  toast('Backup saved');
}
async function importBackup(file) {
  if (file.size > MAX_IMPORT_BYTES) { await showAlert('File Too Large', 'That file is too large to be a Runway backup.'); return; }
  let parsed;
  try { parsed = C.normalizeState(JSON.parse(await file.text())); }
  catch (err) { await showAlert('Can’t Import File', 'This is not a valid Runway backup.'); return; }
  const { state, warnings } = parsed;
  if (!hasData(state)) { await showAlert('Nothing to Import', 'That backup has no accounts, bills or income in it.'); return; }
  const msg = `${state.accounts.length} accounts, ${state.bills.length} bills, ${state.income.length} income sources.` +
    (warnings.length ? `\n\n${warnings.length} problem(s) will be repaired:\n• ${warnings.slice(0, 5).join('\n• ')}` : '') +
    (hasData(S) ? '\n\nA snapshot of your current data is saved first.' : '');
  if (!await askConfirm({ title: 'Replace With Backup?', message: msg, ok: 'Replace', destructive: true })) return;
  snapshot('Before import', S);
  commit('Backup imported.', () => { S = state; });
}
async function restoreSnapshot(snap) {
  if (!snap) { toast('No snapshot found.'); return; }
  let st;
  try { st = C.normalizeState(snap.data).state; } catch (e) { await showAlert('Can’t Restore', 'That snapshot is damaged.'); return; }
  if (hasData(S) && !await askConfirm({ title: 'Restore Snapshot?', message: `Restore the copy from ${new Date(snap.ts).toLocaleString()}. Your current data is saved as a snapshot first.`, ok: 'Restore' })) return;
  snapshot('Before restore', S);
  commit('Snapshot restored.', () => { S = st; });
}

/* =====================================================================
 * Platform capabilities (present only when opened from claude.ai)
 * ===================================================================== */
function useCapability(name) {
  try {
    if (window.claude && typeof window.claude.use === 'function') return window.claude.use(name).catch(() => null);
  } catch (e) {}
  return Promise.resolve(null);
}

/* =====================================================================
 * Alerts (the claude.ai frame blocks confirm() and alert())
 * ===================================================================== */
const alertDlg = document.getElementById('alertDlg');
function askConfirm({ title, message = '', ok = 'OK', cancel = 'Cancel', destructive = false }) {
  return new Promise(resolve => {
    alertDlg.innerHTML = `<div class="alert-box"><h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}</div>
      <div class="alert-btns${cancel ? ' two' : ''}">${cancel ? `<button type="button" data-r="0">${esc(cancel)}</button>` : ''}<button type="button" data-r="1" data-ok class="${destructive ? 'destructive' : 'strong'}">${esc(ok)}</button></div>`;
    let settled = false;
    const done = v => { if (settled) return; settled = true; if (alertDlg.open) alertDlg.close(); resolve(v); };
    alertDlg.onclick = e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); };
    alertDlg.oncancel = e => { e.preventDefault(); done(false); };
    if (alertDlg.open) alertDlg.close();
    alertDlg.showModal();
    const focus = alertDlg.querySelector(cancel ? '[data-r="0"]' : '[data-ok]');
    if (focus) focus.focus();
  });
}
const showAlert = (title, message) => askConfirm({ title, message, ok: 'OK', cancel: null });

/* =====================================================================
 * Cloud sync: one private document per person, via claude.ai
 *
 * The whole state lives in data/users/<id>/runway, a path only that person
 * can read or write. Each write carries the time of the change it holds;
 * the newer copy wins. Before a copy with unsynced local edits is replaced,
 * it is saved as a snapshot on this device, so nothing is lost silently.
 * ===================================================================== */
const DEVICE = (() => {
  let d = ls.get(KEY + '.device');
  if (!d) { d = C.uid(); try { ls.set(KEY + '.device', d); } catch (e) {} }
  return d;
})();
const sync = { status: 'local', detail: '', ref: null, writing: false, again: false, pending: null, first: true, loadTimer: null, pushTimer: null, at: 0 };

function setSync(status, detail = '') {
  sync.status = status; sync.detail = detail;
  if (status === 'synced') sync.at = Date.now();
  renderSyncStatus();
  renderBanners();
}

async function startSync() {
  const [db, user] = await Promise.all([useCapability('db'), useCapability('user')]);
  if (!db || !user) { setSync('local'); return; }
  setSync('connecting');
  const id = await user.id();
  if (!id) { setSync('signedout'); return; }
  sync.user = user; sync.uid = id;
  /* One shared household record. The page's access rules let only people
     with edit access (the owner, and anyone invited as an Editor) read or
     write it; everyone else gets a local-only tracker. */
  if (!(await user.canEdit())) { setSync('noaccess'); return; }
  sync.privateRef = db.doc(`data/users/${id}/runway`);
  try { sync.ref = db.doc('household/runway'); }
  catch (e) { setSync('error', 'Sync could not start. Your data is saved on this device.'); return; }
  sync.loadTimer = setTimeout(() => { if (sync.status === 'connecting') setSync('offline'); }, 10000);
  sync.unsub = sync.ref.onSnapshot(onRemote, err => {
    clearTimeout(sync.loadTimer);
    sync.ref = null;
    if (err && err.code === 'revoked') setSync('local');
    else setSync('error', 'Sync stopped. Your changes are saved on this device. Reload to reconnect.');
  });
}

function onRemote(snap) {
  if (snap.metadata.hasPendingWrites) return;          // the echo of our own write
  const definitive = !snap.metadata.fromCache;
  if (definitive) clearTimeout(sync.loadTimer);
  const first = sync.first;
  if (definitive) sync.first = false;

  if (!snap.exists) {
    if (!definitive) return;
    if (hasData(S)) { pushNow(); return; }                // first device: upload what is here
    migratePrivate();                                     // or bring over the owner's earlier private copy
    return;
  }
  const body = snap.data() || {};
  let remote;
  try { remote = C.normalizeState(body.state || {}).state; }
  catch (e) { setSync('error', 'The synced copy could not be read. Your data on this device is unchanged.'); return; }
  const ru = finite(body.updatedAt, 0);
  if (JSON.stringify(remote) === JSON.stringify(S)) {
    syncedAt = Math.max(syncedAt, ru); setStamp('syncedAt', syncedAt);
    if (definitive || sync.status === 'connecting') setSync('synced');
    return;
  }
  if (ru >= localUpdatedAt || !hasData(S)) adoptRemote(remote, ru, body.device, first, body.by);
  else if (definitive) pushNow();                       // this device has the newer change
}

/* Before sharing existed, data lived in the person's private subtree. */
async function migratePrivate() {
  try {
    const old = sync.privateRef && await sync.privateRef.get();
    const body = old && old.exists ? old.data() : null;
    if (body && body.state) {
      const st = C.normalizeState(body.state).state;
      if (hasData(st)) { adoptRemote(st, finite(body.updatedAt, Date.now()), body.device, true, body.by); pushNow(); return; }
    }
  } catch (e) {}
  setSync('synced');
}

function adoptRemote(remote, ru, device, quiet, by) {
  if (dlg.open || alertDlg.open) { sync.pending = { remote, ru, device, by }; return; }
  if (hasData(S) && localUpdatedAt > syncedAt) snapshot('Before sync', S);
  applyingRemote = true;
  S = remote;
  localUpdatedAt = ru; syncedAt = ru;
  setStamp('updatedAt', ru); setStamp('syncedAt', ru);
  render();
  applyingRemote = false;
  setSync('synced');
  if (!quiet && device !== DEVICE) announceChange(by);
}
async function announceChange(by) {
  if (by && sync.user && by !== sync.uid) {
    let name = '';
    try { const ps = await sync.user.profiles([by]); name = (ps[by] && ps[by].name) || ''; } catch (e) {}
    toast(name ? `Updated by ${name}` : 'Updated by someone you share with');
  } else toast('Updated from your other device');
}

function scheduleCloudPush() {
  if (!sync.ref) return;
  clearTimeout(sync.pushTimer);
  if (sync.status !== 'saving') setSync('saving');
  sync.pushTimer = setTimeout(pushNow, 700);           // one write per pause in editing
}

async function pushNow() {
  if (!sync.ref) return;
  clearTimeout(sync.pushTimer);
  if (sync.writing) { sync.again = true; return; }
  sync.writing = true;
  setSync('saving');
  if (localUpdatedAt < 10) { localUpdatedAt = Date.now(); setStamp('updatedAt', localUpdatedAt); }
  const stamp = localUpdatedAt;
  const body = { v: 1, updatedAt: stamp, device: DEVICE, by: sync.uid || null, state: JSON.parse(JSON.stringify(S)) };
  const kb = Math.round(JSON.stringify(body).length / 1024);
  if (kb > 240) {
    sync.writing = false;
    setSync('error', `Your data is too large to sync (${kb} KB; the limit is about 240 KB). Delete old check-ins, activity or unused bills, and it will sync again.`);
    return;
  }
  try {
    try { await sync.ref.set(body); }
    catch (e) {
      if (!e || e.code !== 'unavailable') throw e;
      await new Promise(r => setTimeout(r, 600 + Math.random() * 900));
      await sync.ref.set(body);
    }
    syncedAt = Math.max(syncedAt, stamp); setStamp('syncedAt', syncedAt);
    setSync('synced');
  } catch (e) {
    const code = e && e.code;
    if (code === 'quota_exceeded' || code === 'invalid_argument') setSync('error', 'Your data couldn’t be synced because it is too large. It is still saved on this device; deleting old check-ins may help.');
    else if (code === 'revoked') { sync.ref = null; setSync('local'); }
    else setSync('offline');
  } finally {
    sync.writing = false;
    if (sync.again) { sync.again = false; pushNow(); }
  }
}

/* Retry unsynced changes when the connection or the page comes back. */
function retryPush() { if (sync.ref && localUpdatedAt > syncedAt && !sync.writing) pushNow(); }
window.addEventListener('online', retryPush);
document.addEventListener('visibilitychange', () => { if (!document.hidden) retryPush(); });
/* A copy that arrived while a sheet was open is applied once it closes,
   unless the sheet saved a newer change, which then syncs instead. */
const applyPending = () => {
  if (!sync.pending || dlg.open || alertDlg.open) return;
  const p = sync.pending; sync.pending = null;
  if (p.ru >= localUpdatedAt) adoptRemote(p.remote, p.ru, p.device, false, p.by); else retryPush();
};
dlg.addEventListener('close', () => setTimeout(applyPending, 0));
alertDlg.addEventListener('close', () => setTimeout(applyPending, 0));

const SYNC_TEXT = {
  local:      ['lock', 'var(--label-3)', 'On this device only'],
  noaccess:   ['lock', 'var(--orange)', 'Not shared with you'],
  signedout:  ['cloudoff', 'var(--orange)', 'Sign in to sync'],
  connecting: ['cloud', 'var(--label-3)', 'Connecting…'],
  saving:     ['cloud', 'var(--label-2)', 'Syncing…'],
  synced:     ['cloudcheck', 'var(--green)', 'Synced'],
  offline:    ['cloudoff', 'var(--orange)', 'Offline · saved here'],
  error:      ['cloudoff', 'var(--red)', 'Sync paused']
};
function renderSyncStatus() {
  const [icon, color, text] = SYNC_TEXT[sync.status] || SYNC_TEXT.local;
  const note = document.getElementById('syncNote');
  if (note) note.innerHTML = `<span style="color:${color};display:inline-flex">${ic(icon)}</span><span>${esc(text)}</span>`;
  const chip = document.getElementById('syncChip');
  if (chip) { chip.innerHTML = sync.status === 'local' ? '' : `<span class="dot" style="background:${color}"></span>${esc(text)}`; chip.hidden = sync.status === 'local'; }
  const row = document.getElementById('syncValue');
  if (row) row.innerHTML = `<span style="color:${color}">${esc(text)}</span>`;
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
    case 'add': editors[kind](undefined, el.dataset.type); break;
    case 'edit': { const it = find(); if (it) editors[kind](it); break; }
    case 'del': {
      const it = find(); if (!it) return;
      if (dlg.open) dlg.close();
      commit(`Deleted ${it.name}.`, () => { const l = listFor(kind); l.splice(l.indexOf(it), 1); });
      break;
    }
    case 'settle': settle(kind, id); break;
    case 'skip': {
      const it = find(); if (!it) return;
      if (dlg.open) dlg.close();
      const n = C.nextAfter(it);
      commit(n ? `${it.name} moved to ${fmtDate(parse(n))}.` : `${it.name} removed (no later date).`, () => {
        if (n) it.next = n; else { const l = listFor(kind); l.splice(l.indexOf(it), 1); }
      });
      break;
    }
    case 'checkin': checkinDialog(); break;
    case 'delck': commit('Check-in deleted.', () => { S.checkins = S.checkins.filter(c => c.date !== el.dataset.date); }); break;
    case 'tab': if (VIEWS[el.dataset.tab]) { ui.view = el.dataset.tab; render(); window.scrollTo({ top: 0 }); } break;
    case 'homescreen': homeScreenDialog(); break;
    case 'scenario-new': editScenario(null, el.dataset.type); break;
    case 'scenario-edit': { const sc = S.scenarios.find(x => x.id === el.dataset.id); if (sc) editScenario(sc); break; }
    case 'scenario-toggle': { const sc = S.scenarios.find(x => x.id === el.dataset.id); if (sc) { sc.on = el.checked; render(); } break; }
    case 'scenario-del': {
      const sc = S.scenarios.find(x => x.id === el.dataset.id); if (!sc) return;
      if (dlg.open) dlg.close();
      commit(`Deleted ${sc.name}.`, () => { S.scenarios = S.scenarios.filter(x => x !== sc); });
      break;
    }
    case 'copylink': copyLink(el); break;
    case 'toggle-checkins': ui.showAllCheckins = !ui.showAllCheckins; render(); break;
    case 'toggle-upcoming': ui.showAllUpcoming = !ui.showAllUpcoming; render(); break;
    case 'goal': S.settings.targetMonths = Math.max(1, Math.min(60, S.settings.targetMonths + (+el.dataset.d || 0))); render(); break;
    case 'billfilter': ui.billFilter = el.dataset.f; render(); break;
    case 'range': ui.range = +el.dataset.m; render(); break;
    case 'sample': (async () => {
      const had = hasData(S);
      if (had && !await askConfirm({ title: 'Load Sample Data?', message: 'This replaces your data on every synced device, including anyone you share with. A snapshot of your data is saved on this device first.', ok: 'Replace', destructive: true })) return;
      snapshot('Before sample data', S);
      commit(had ? 'Sample data loaded' : '', () => { S = sampleState(); ui.view = 'overview'; });
    })(); break;
    case 'reset': (async () => {
      if (!await askConfirm({ title: 'Erase All Data?', message: 'Accounts, bills, income and history will be erased on every synced device, including anyone you share with. A snapshot is saved on this device first.', ok: 'Erase', destructive: true })) return;
      snapshot('Before erase', S);
      commit('All data erased', () => { S = C.blank(); ui.view = 'overview'; });
    })(); break;
    case 'export': exportBackup(); break;
    case 'import': document.getElementById('importFile').click(); break;
    case 'restore': restoreSnapshot(readSnapshots().find(s => String(s.ts) === el.dataset.ts)); break;
    case 'restore-latest': restoreSnapshot(readSnapshots().pop()); break;
    case 'reload': location.reload(); break;
    case 'dismiss-notice': loadNotices.splice(+el.dataset.i, 1); renderBanners(); break;
  }
});
/* Rows that act like buttons respond to Enter and Space. */
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.list-row[data-action]:not(button)')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.setting;
  if (!k) return;
  const v = finite(String(e.target.value).replace(/[$,\s]/g, ''), NaN);
  if (k === 'targetMonths') S.settings.targetMonths = Number.isFinite(v) ? Math.max(1, Math.min(60, Math.round(v))) : 12;
  else if (k === 'cushion') S.settings.cushion = Number.isFinite(v) ? round2(Math.max(0, Math.min(1e9, v))) : 0;
  else if (k === 'horizon') S.settings.horizon = [12, 24, 36].includes(v) ? v : 24;
  else if (k === 'creditStrategy') S.settings.creditStrategy = e.target.value === 'now' ? 'now' : 'late';
  else if (k === 'creditCap') S.settings.creditCap = Number.isFinite(v) ? Math.max(10, Math.min(100, Math.round(v))) : 80;
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
    lastPersistedJSON = JSON.stringify(S);
    localUpdatedAt = finite(Number(ls.get(KEY + '.updatedAt')), localUpdatedAt);
    syncedAt = finite(Number(ls.get(KEY + '.syncedAt')), syncedAt);
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
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { try { if (ui.view === 'overview' && model) drawChart(model.all, model.ess, chartRange()); if (ui.view === 'whatif') drawCompare(); } catch (err) {} }, 150); });
window.addEventListener('error', ev => { console.error(ev.error || ev.message); toast('Something went wrong. Your data is saved; try reloading if things look off.'); });
window.addEventListener('unhandledrejection', ev => { console.error(ev.reason); });

snapshot('Daily auto-save', S, { daily: true });
render();
startSync();
})();
