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
let ui = { tab: 'bills', range: 12 };
try {
  const u = JSON.parse(ls.get(UI_KEY) || 'null');
  if (u && ['bills', 'income', 'accounts', 'history', 'settings'].includes(u.tab)) ui.tab = u.tab;
  if (u && [6, 12, 24, 36].includes(u.range)) ui.range = u.range;
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
 * Toasts with undo
 * ===================================================================== */
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg, undoFn) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${esc(msg)}</span>${undoFn ? '<button type="button" class="small" data-undo>Undo</button>' : ''}`;
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
 * Render
 * ===================================================================== */
let renderedDay = '';

function render() {
  persist();
  requestPersistentStorage();
  renderedDay = iso(today());
  renderBanners();
  try {
    renderApp();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<section class="card welcome">
      <h2>Something went wrong showing your data</h2>
      <p>Your data is still saved. Export a backup, then try restoring a snapshot from Settings or reloading the page.</p>
      <p class="muted" style="font-size:12px">${esc(err && err.message)}</p>
      <div class="actions" style="justify-content:center">
        <button class="primary" data-action="export">Export backup</button>
        <button data-action="restore-latest">Restore latest snapshot</button>
        <button data-action="reload">Reload</button>
      </div></section>`;
  }
}

function renderBanners() {
  const el = document.getElementById('banners');
  const items = [];
  if (!storage.ok) items.push(['critical', `<b>Changes are not being saved.</b> ${esc(storage.msg)} Export a backup now so you don't lose your work.`, '<button class="small" data-action="export">Export backup</button>']);
  loadNotices.forEach((n, i) => items.push([n[0], n[1], `<button class="small ghost" data-action="dismiss-notice" data-i="${i}">Dismiss</button>`]));
  el.innerHTML = items.map(([c, h, btn]) => `<div class="alert ${c}"><span class="ico" aria-hidden="true">!</span><div style="flex:1">${h}</div>${btn || ''}</div>`).join('');
  el.hidden = !items.length;
}

function renderApp() {
  if (!hasData(S)) { app.innerHTML = welcomeHTML(); return; }
  const t0 = today();
  const H = Math.round(S.settings.horizon * MONTH);
  const all = C.simulate(S, { days: H }, t0);
  const ess = C.simulate(S, { essentialOnly: true, days: H }, t0);
  const billsMo = monthly(S.bills, b => b.freq !== 'once' && isActive(b));
  const essMo = monthly(S.bills, b => b.freq !== 'once' && b.essential && isActive(b));
  const incMo = monthly(S.income, i => i.freq !== 'once' && isActive(i));
  const range = Math.min(ui.range, S.settings.horizon);

  app.innerHTML = `
    ${heroHTML(all, ess, billsMo, essMo, incMo)}
    ${alertsHTML(all, ess)}
    <section class="card" aria-labelledby="chartTitle">
      <div class="card-head">
        <h2 id="chartTitle">Projected cash balance</h2>
        <div class="seg" role="group" aria-label="Chart range">
          ${[6, 12, 24, 36].filter(m => m <= S.settings.horizon).map(m => `<button data-action="range" data-m="${m}" aria-pressed="${range === m}">${m} mo</button>`).join('')}
        </div>
      </div>
      <div class="legend">
        <span><i style="background:var(--s1)"></i>All bills</span>
        <span><i style="background:var(--s2)"></i>Essentials only</span>
        ${S.checkins.length ? '<span><i class="dotkey" style="background:var(--s3)"></i>Actual (check-ins)</span>' : ''}
        ${S.settings.cushion ? `<span><i style="background:transparent;height:0;border-top:2px dashed var(--muted)"></i>Cushion ${money(S.settings.cushion)}</span>` : ''}
      </div>
      <div class="chart-box" id="chartBox"></div>
      ${monthTableHTML(all, ess, range)}
    </section>
    <div class="grid2">
      ${upcomingHTML()}
      ${plannerHTML()}
    </div>
    ${dataTabsHTML()}
    ${categoriesHTML()}
  `;
  drawChart(all, ess, range);
}

function runwayText(sim) {
  if (sim.out < 0) return { big: `${S.settings.horizon}+`, unit: 'months', date: null, now: false };
  if (sim.out === 0) return { big: '0', unit: 'days', date: today(), now: true };
  const m = sim.out / MONTH;
  return { big: m < 1 ? String(sim.out) : m.toFixed(1), unit: m < 1 ? (sim.out === 1 ? 'day' : 'days') : 'months', date: addDays(today(), sim.out), now: false };
}
function statusOf(sim) {
  if (sim.out < 0 || sim.out > 12 * MONTH) return { label: 'Comfortable', color: 'var(--good)' };
  if (sim.out > 6 * MONTH) return { label: 'Watch closely', color: 'var(--warning)' };
  if (sim.out > 3 * MONTH) return { label: 'Tight', color: 'var(--serious)' };
  return { label: 'Urgent', color: 'var(--critical)' };
}

function heroHTML(all, ess, billsMo, essMo, incMo) {
  const r = runwayText(all), re = runwayText(ess), st = statusOf(all);
  const cushion = S.settings.cushion, net = incMo - billsMo;
  const last = S.checkins[S.checkins.length - 1];
  const counted = S.accounts.filter(a => a.include !== false).length;
  return `
  <section class="hero">
    <div class="card hero-main">
      <div class="label">Runway${cushion ? ` (until cash drops below ${money(cushion)})` : ''}</div>
      <div class="big">${r.big} <small>${r.unit}</small></div>
      <div class="sub">${r.now ? '<b>Cash is already below your cushion.</b>' : r.date ? `Cash runs out around <b>${fmtDate(r.date)}</b>` : `Cash lasts beyond the ${S.settings.horizon}-month projection`}</div>
      <div class="status"><span class="dot" style="background:${st.color}"></span>${st.label}</div>
    </div>
    <div class="tiles">
      <div class="card tile"><div class="label">Cash on hand</div><div class="val">${money(cashTotal())}</div><div class="note">${counted} account${counted === 1 ? '' : 's'} counted</div></div>
      <div class="card tile"><div class="label">Bills per month</div><div class="val">${money(billsMo)}</div><div class="note">${money(essMo)} essential</div></div>
      <div class="card tile"><div class="label">Income per month</div><div class="val">${money(incMo)}</div><div class="note">active sources</div></div>
      <div class="card tile"><div class="label">Net per month</div><div class="val" style="color:${net >= 0 ? 'var(--good-text)' : 'var(--critical-text)'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</div><div class="note">${net >= 0 ? 'cash growing' : 'burn rate'}</div></div>
      <div class="card tile"><div class="label">Essentials-only runway</div><div class="val">${re.big} ${re.unit}</div><div class="note">${re.date && !re.now ? 'until ' + fmtDate(re.date, { month: 'short', year: 'numeric' }) : 'if you cut extras'}</div></div>
      <div class="card tile"><div class="label">Last check-in</div><div class="val">${last ? money(last.total) : '—'}</div><div class="note">${last ? safeDate(last.date) : 'log one weekly'}</div></div>
    </div>
  </section>`;
}

function alertsHTML(all, ess) {
  const t0 = today(), A = [];
  const overdue = S.bills.filter(b => parse(b.next) < t0);
  if (overdue.length) A.push(['critical', '!', `<b>${overdue.length} overdue bill${overdue.length > 1 ? 's' : ''}:</b> ${overdue.map(b => esc(b.name)).join(', ')}. Mark them paid or skip them in "Next 30 days".`]);
  const late = S.income.filter(i => parse(i.next) < t0);
  if (late.length) A.push(['warning', '?', `<b>Confirm income:</b> ${late.map(i => esc(i.name)).join(', ')} ${late.length > 1 ? 'were' : 'was'} expected already. Mark ${late.length > 1 ? 'them' : 'it'} received or skip so your runway isn't overstated.`]);
  if (all.out === 0) A.push(['critical', '!', '<b>Your cash is below your safety cushion right now.</b>']);
  else if (all.out > 0 && all.out <= 3 * MONTH) { const re = runwayText(ess); A.push(['critical', '!', `<b>Less than 3 months of runway.</b> Cutting to essentials gives you ${re.big} ${re.unit}.`]); }
  for (const i of S.income) {
    if (!i.end) continue;
    const d = daysBetween(t0, parse(i.end));
    if (d >= 0 && d <= 60) A.push(['warning', '!', `<b>${esc(i.name)}</b> ends ${safeDate(i.end)} (${d} day${d === 1 ? '' : 's'}). Your monthly income drops by ${money(i.amount * FREQ[i.freq].perMonth)}.`]);
  }
  const lastCk = S.checkins[S.checkins.length - 1];
  if (S.accounts.length && (!lastCk || daysBetween(parse(lastCk.date), t0) > 10)) A.push(['warning', 'i', `<b>Update your balances.</b> ${lastCk ? `Last check-in was ${daysBetween(parse(lastCk.date), t0)} days ago.` : 'No check-ins yet.'} A weekly check-in keeps the runway honest. <button class="small" data-action="checkin">Check in</button>`]);
  const le = S.settings.lastExport;
  const sinceExport = le ? daysBetween(parse(le), t0) : null;
  if (sinceExport === null || sinceExport > 14) A.push(['warning', 'i', `<b>Back up your data.</b> ${sinceExport === null ? "You haven't exported a backup yet." : `Last backup was ${sinceExport} days ago.`} It only lives in this browser. <button class="small" data-action="export">Export backup</button>`]);
  if (!A.length) A.push(['good', '✓', 'No overdue bills, nothing ending soon, and your backup is current.']);
  return `<div class="alerts" role="status">${A.map(([c, i, t]) => `<div class="alert ${c}"><span class="ico" aria-hidden="true">${i}</span><div>${t}</div></div>`).join('')}</div>`;
}

function upcomingHTML() {
  const ev = C.upcoming(S, 30, today());
  return `<section class="card upcoming">
    <div class="card-head"><h2>Next 30 days</h2><span class="sub">${ev.length} item${ev.length === 1 ? '' : 's'}</span></div>
    <div class="scroll">
    ${ev.length ? ev.map(e => {
      const isNext = parse(e.item.next).getTime() === e.date.getTime();
      return `<div class="ev">
        <div class="date">${e.date.toLocaleDateString(undefined, { month: 'short' })}<b>${e.date.getDate()}</b></div>
        <div>
          <div class="name">${esc(e.item.name)} ${e.overdue ? `<span class="pill over">${e.kind === 'bill' ? 'Overdue' : 'Confirm'}</span>` : ''}</div>
          <div class="bal num">Balance after: ${money(e.after)}</div>
        </div>
        <div class="amt num ${e.amount > 0 ? 'in' : ''}">${e.amount > 0 ? '+' : '−'}${money(Math.abs(e.amount), true)}
          ${isNext ? `<div class="rowbtns">
            <button class="small" data-action="settle" data-kind="${e.kind}" data-id="${esc(e.item.id)}">${e.kind === 'bill' ? 'Paid' : 'Received'}</button>
            <button class="small ghost" data-action="skip" data-kind="${e.kind}" data-id="${esc(e.item.id)}" title="Move to the next date without changing balances">Skip</button>
          </div>` : ''}
        </div>
      </div>`;
    }).join('') : '<div class="empty">Nothing due in the next 30 days.</div>'}
    </div>
  </section>`;
}

function plannerHTML() {
  const tm = S.settings.targetMonths, t0 = today();
  const gapAll = C.gapFor(S, tm, false, t0), gapEss = C.gapFor(S, tm, true, t0);
  let ans;
  if (gapAll === Infinity) ans = `<div class="answer" style="color:var(--critical-text)">Below cushion now</div><p>Your cash is already under your ${money(S.settings.cushion)} cushion, so no monthly amount fixes today. Lower the cushion in Settings, or add money to an account.</p>`;
  else if (gapAll <= 0.5) ans = `<div class="answer" style="color:var(--good-text)">You're covered</div><p>Your cash lasts at least ${tm} months at your current bills and income.</p>`;
  else ans = `<div class="answer">${money(Math.ceil(gapAll))}<span class="sub" style="font-weight:500"> / month</span></div>
       <p>Extra income or spending cuts needed to keep cash above ${money(S.settings.cushion)} for ${tm} months.</p>
       <p>${gapEss <= 0.5 ? `Or cut to <b>essentials only</b>: that alone gets you to ${tm} months.` : `Even on essentials only, you'd still need <b>${money(Math.ceil(gapEss))}/mo</b>.`}</p>`;
  return `<section class="card planner">
    <div class="card-head"><h2>Runway goal</h2></div>
    <label for="targetMonths">How many months do you want to be covered?</label>
    <input type="number" id="targetMonths" min="1" max="60" step="1" value="${tm}" data-setting="targetMonths">
    ${ans}
    <p class="muted" style="font-size:12px">Tip: plan for a job search of 6–9 months, plus about a month before the first paycheck arrives.</p>
  </section>`;
}

function dataTabsHTML() {
  const tabs = [['bills', `Bills & expenses (${S.bills.length})`], ['income', `Money coming in (${S.income.length})`], ['accounts', `Accounts (${S.accounts.length})`], ['history', 'History'], ['settings', 'Settings & backups']];
  const body = { bills: billsTable, income: incomeTable, accounts: accountsTable, history: historyHTML, settings: settingsHTML }[ui.tab]();
  return `<section class="card" style="margin-bottom:14px">
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${ui.tab === k}" data-action="tab" data-tab="${k}">${l}</button>`).join('')}</div>
    ${body}
  </section>`;
}

const freqCell = i => `${FREQ[i.freq].label}${i.freq !== 'once' && i.freq !== 'monthly' ? `<div class="muted" style="font-size:12px">${money(i.amount * FREQ[i.freq].perMonth)}/mo</div>` : ''}`;
const nextCell = (i, kind) => {
  const over = parse(i.next) < today();
  return `${safeDate(i.next, { month: 'short', day: 'numeric' })}${over ? ` <span class="pill over">${kind === 'income' ? 'Confirm' : 'Overdue'}</span>` : ''}`;
};
const rowBtns = (kind, id) => `<div class="rowbtns"><button class="small ghost" data-action="edit" data-kind="${kind}" data-id="${esc(id)}">Edit</button><button class="small ghost danger" data-action="del" data-kind="${kind}" data-id="${esc(id)}">Delete</button></div>`;

function billsTable() {
  const rows = [...S.bills].sort((a, b) => a.next.localeCompare(b.next));
  return `<div class="card-head"><span class="sub">Every recurring bill and regular expense (groceries, gas, subscriptions). Mark essentials to see your bare-bones runway.</span><button class="primary" data-action="add" data-kind="bill">Add bill</button></div>
  ${rows.length ? `<div class="tablewrap"><table>
    <thead><tr><th>Name</th><th class="hide-sm">Category</th><th class="r">Amount</th><th>How often</th><th>Next due</th><th></th></tr></thead>
    <tbody>${rows.map(b => `<tr>
      <td>${esc(b.name)} ${b.essential ? '<span class="pill ess">Essential</span>' : ''}${b.end ? `<div class="muted" style="font-size:12px">until ${safeDate(b.end)}</div>` : ''}</td>
      <td class="hide-sm"><span class="pill">${esc(b.category)}</span></td>
      <td class="r num">${money(b.amount, true)}</td>
      <td>${freqCell(b)}</td>
      <td>${nextCell(b, 'bill')}</td>
      <td>${rowBtns('bill', b.id)}</td>
    </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No bills yet. Add rent, insurance, phone, loans, groceries…</div>'}`;
}

function incomeTable() {
  const rows = [...S.income].sort((a, b) => a.next.localeCompare(b.next));
  return `<div class="card-head"><span class="sub">Unemployment benefits, severance, freelance work, side gigs, a partner's contribution. Set an end date when it stops.</span><button class="primary" data-action="add" data-kind="income">Add income</button></div>
  ${rows.length ? `<div class="tablewrap"><table>
    <thead><tr><th>Source</th><th class="r">Amount</th><th>How often</th><th>Next</th><th class="hide-sm">Ends</th><th></th></tr></thead>
    <tbody>${rows.map(i => `<tr>
      <td>${esc(i.name)}${!isActive(i) ? ' <span class="pill">Ended</span>' : ''}</td>
      <td class="r num in">+${money(i.amount, true)}</td>
      <td>${freqCell(i)}</td>
      <td>${nextCell(i, 'income')}</td>
      <td class="hide-sm">${i.end ? safeDate(i.end) : '<span class="muted">Ongoing</span>'}</td>
      <td>${rowBtns('income', i.id)}</td>
    </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No income yet. Add benefits, severance or freelance work.</div>'}`;
}

function accountsTable() {
  return `<div class="card-head"><span class="sub">Cash you can actually spend: checking, savings, money market. Leave out retirement accounts unless you plan to tap them.</span><button class="primary" data-action="add" data-kind="account">Add account</button></div>
  ${S.accounts.length ? `<div class="tablewrap"><table>
    <thead><tr><th>Account</th><th class="r">Balance</th><th>Counts toward runway</th><th class="hide-sm">Updated</th><th></th></tr></thead>
    <tbody>${S.accounts.map(a => `<tr>
      <td>${esc(a.name)}</td>
      <td class="r num">${money(a.balance, true)}</td>
      <td>${a.include === false ? '<span class="muted">No</span>' : 'Yes'}</td>
      <td class="hide-sm muted">${safeDate(a.updated)}</td>
      <td>${rowBtns('account', a.id)}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Total counted</b></td><td class="r num"><b>${money(cashTotal(), true)}</b></td><td colspan="3"></td></tr></tfoot></table></div>` : '<div class="empty">Add your checking and savings accounts.</div>'}`;
}

function historyHTML() {
  const ck = [...S.checkins].reverse();
  const act = [...S.activity].reverse().slice(0, 50);
  return `<div class="grid2" style="margin:0">
    <div>
      <div class="card-head"><h2>Balance check-ins</h2><button class="small" data-action="checkin">Log check-in</button></div>
      ${ck.length ? `<table><thead><tr><th>Date</th><th class="r">Total cash</th><th class="r">Change</th><th></th></tr></thead><tbody>
        ${ck.map((c, idx) => { const prev = ck[idx + 1], ch = prev ? c.total - prev.total : null;
          return `<tr><td>${safeDate(c.date)}</td><td class="r num">${money(c.total)}</td>
          <td class="r num" style="color:${ch == null ? 'inherit' : ch >= 0 ? 'var(--good-text)' : 'var(--critical-text)'}">${ch == null ? '—' : (ch >= 0 ? '+' : '−') + money(Math.abs(ch))}</td>
          <td><div class="rowbtns"><button class="small ghost danger" data-action="delck" data-date="${esc(c.date)}">Delete</button></div></td></tr>`; }).join('')}
      </tbody></table>` : '<div class="empty">Check-ins record your real total cash over time, so you can compare it with the plan.</div>'}
    </div>
    <div>
      <div class="card-head"><h2>Recent activity</h2></div>
      ${act.length ? `<table><thead><tr><th>Date</th><th>Item</th><th class="r">Amount</th></tr></thead><tbody>
        ${act.map(a => `<tr><td>${safeDate(a.date, { month: 'short', day: 'numeric' })}</td><td>${esc(a.name)}${a.account ? `<div class="muted" style="font-size:12px">${esc(a.account)}</div>` : ''}</td>
        <td class="r num ${a.amount > 0 ? 'in' : ''}">${a.amount > 0 ? '+' : '−'}${money(Math.abs(a.amount), true)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty">Bills you mark paid and income you mark received show up here.</div>'}
    </div>
  </div>`;
}

function settingsHTML() {
  const snaps = readSnapshots().reverse();
  const le = S.settings.lastExport;
  return `<div class="settings-row">
    <div class="field"><label for="setCushion">Safety cushion</label><input type="number" id="setCushion" min="0" step="100" value="${S.settings.cushion}" data-setting="cushion"><div class="hint">Runway ends when cash falls below this, not at $0.</div></div>
    <div class="field"><label for="setHorizon">Projection length</label><select id="setHorizon" data-setting="horizon">${[12, 24, 36].map(m => `<option value="${m}" ${S.settings.horizon === m ? 'selected' : ''}>${m} months</option>`).join('')}</select></div>
  </div>

  <h2 style="margin:24px 0 6px">Backups</h2>
  <p class="sub" style="margin:0 0 10px">Last exported: <b>${le ? safeDate(le) : 'never'}</b>. Exported files are the only copy that survives clearing your browser, so keep one in cloud storage or email it to yourself.</p>
  <div class="actions"><button class="primary" data-action="export">Export backup</button><button data-action="import">Import backup</button></div>

  <h2 style="margin:24px 0 6px">Snapshots in this browser</h2>
  <p class="sub" style="margin:0 0 10px">One copy is saved automatically each day you open the app (the last ${MAX_AUTO_SNAPSHOTS} are kept), plus one before any erase, import or restore.</p>
  ${snaps.length ? `<div class="tablewrap"><table><thead><tr><th>Saved</th><th>Why</th><th class="hide-sm">Contents</th><th></th></tr></thead><tbody>
    ${snaps.map(s => { const d = s.data || {}; const n = k => (Array.isArray(d[k]) ? d[k].length : 0);
      return `<tr><td>${esc(new Date(s.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td><td>${esc(s.label)}</td>
      <td class="hide-sm muted">${n('accounts')} accounts, ${n('bills')} bills, ${n('income')} income</td>
      <td><div class="rowbtns"><button class="small" data-action="restore" data-ts="${s.ts}">Restore</button></div></td></tr>`; }).join('')}
  </tbody></table></div>` : '<div class="empty">No snapshots yet.</div>'}

  <h2 style="margin:24px 0 6px">Start over</h2>
  <div class="actions">
    <button data-action="sample">Load sample data</button>
    <button class="danger" data-action="reset">Erase all data</button>
  </div>`;
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
  return `<section class="card bars">
    <div class="card-head"><h2>Where the money goes</h2><span class="sub">Monthly equivalent, ${money(total)} total</span></div>
    ${rows.map(([k, v]) => `<div class="bar" title="${esc(k)}: ${money(v)}/mo (${Math.round(v / total * 100)}%)">
      <div class="lbl">${esc(k)}</div>
      <div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%"></div></div>
      <div class="num" style="text-align:right">${money(v)}</div>
    </div>`).join('')}
  </section>`;
}

function monthTableHTML(all, ess, range) {
  const rows = [], t0 = today();
  for (let m = 1; m <= range; m++) {
    const d = Math.min(all.bal.length - 1, Math.round(m * MONTH));
    rows.push(`<tr><td>${fmtDate(addDays(t0, d), { month: 'short', year: 'numeric' })}</td><td class="r num">${money(all.bal[d])}</td><td class="r num">${money(ess.bal[d])}</td></tr>`);
  }
  return `<details class="tableview"><summary>Show as table</summary><div class="tablewrap"><table><thead><tr><th>Month</th><th class="r">All bills</th><th class="r">Essentials only</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></details>`;
}

function welcomeHTML() {
  return `<section class="card welcome">
    <h2>Know exactly how long your money lasts</h2>
    <p>Add your accounts, your bills, and any money still coming in (unemployment, severance, freelance). The tracker projects your balance day by day and shows your runway.</p>
    <div class="actions" style="justify-content:center">
      <button class="primary" data-action="add" data-kind="account">Add your first account</button>
      <button data-action="sample">Explore with sample data</button>
      <button data-action="import">Import a backup</button>
    </div>
    ${readSnapshots().length ? '<p class="sub" style="margin-top:16px">Looking for earlier data? <button class="small" data-action="restore-latest">Restore latest snapshot</button></p>' : ''}
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
  const W = Math.max(300, box.clientWidth || 300), Hh = W < 560 ? 240 : 300;
  const M = { l: 56, r: W < 560 ? 12 : 96, t: 14, b: 28 };
  const t0 = today();
  const days = Math.max(1, Math.min(all.bal.length - 1, Math.round(range * MONTH)));
  const cks = S.checkins.map(c => ({ d: daysBetween(t0, parse(c.date)), v: c.total })).filter(c => c.d >= -183 && c.d <= 0);
  const dMin = cks.length ? Math.min(0, ...cks.map(c => c.d)) : 0;

  let lo = Math.min(S.settings.cushion, 0), hi = Math.max(S.settings.cushion, 0);
  for (let d = 0; d <= days; d++) { lo = Math.min(lo, all.bal[d], ess.bal[d]); hi = Math.max(hi, all.bal[d], ess.bal[d]); }
  cks.forEach(c => { lo = Math.min(lo, c.v); hi = Math.max(hi, c.v); });
  if (hi - lo < 1) hi = lo + 1000;
  const step = niceStep(hi - lo, 5);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;

  const x = d => M.l + (d - dMin) / (days - dMin) * (W - M.l - M.r);
  const y = v => M.t + (hi - v) / (hi - lo) * (Hh - M.t - M.b);
  const path = bal => { let p = ''; for (let d = 0; d <= days; d++) p += (d ? 'L' : 'M') + x(d).toFixed(1) + ' ' + y(bal[d]).toFixed(1); return p; };

  let g = '';
  for (let v = lo; v <= hi + step / 2; v += step) {
    g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>
          <text x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${compact(v)}</text>`;
  }
  const totalMonths = Math.ceil((days - dMin) / MONTH);
  const every = W < 560 ? (totalMonths > 12 ? 6 : 3) : (totalMonths > 18 ? 3 : totalMonths > 9 ? 2 : 1);
  const startD = addDays(t0, dMin);
  let mt = new Date(startD.getFullYear(), startD.getMonth() + 1, 1), idx = 0;
  while (daysBetween(t0, mt) <= days && idx < 600) {
    if (idx % every === 0) {
      const xd = x(daysBetween(t0, mt));
      const lab = mt.getMonth() === 0 || idx === 0 ? mt.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : mt.toLocaleDateString(undefined, { month: 'short' });
      g += `<line x1="${xd}" x2="${xd}" y1="${Hh - M.b}" y2="${Hh - M.b + 4}" stroke="var(--axis)"/><text x="${xd}" y="${Hh - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${lab}</text>`;
    }
    mt = new Date(mt.getFullYear(), mt.getMonth() + 1, 1); idx++;
  }
  if (lo <= 0 && hi >= 0) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--axis)" stroke-width="1.5"/>`;
  if (S.settings.cushion) g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y(S.settings.cushion)}" y2="${y(S.settings.cushion)}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/>`;
  if (dMin < 0) g += `<line x1="${x(0)}" x2="${x(0)}" y1="${M.t}" y2="${Hh - M.b}" stroke="var(--axis)" stroke-dasharray="2 3"/><text x="${x(0) + 4}" y="${M.t + 10}" font-size="11" fill="var(--muted)">Today</text>`;

  g += `<path d="${path(ess.bal)}" fill="none" stroke="var(--s2)" stroke-width="2" stroke-linejoin="round"/>`;
  g += `<path d="${path(all.bal)}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round"/>`;
  if (cks.length) {
    const pts = [...cks].sort((a, b) => a.d - b.d);
    if (pts.length > 1) g += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + x(p.d) + ' ' + y(p.v)).join('')}" fill="none" stroke="var(--s3)" stroke-width="2"/>`;
    pts.forEach(p => { g += `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="4.5" fill="var(--s3)" stroke="var(--surface)" stroke-width="2"/>`; });
  }
  const mark = (sim, col, below) => {
    if (sim.out < 0 || sim.out > days) return '';
    const cx = x(sim.out), cy = y(sim.bal[sim.out]);
    const anchor = cx > W - M.r - 70 ? 'end' : cx < M.l + 70 ? 'start' : 'middle';
    return `<circle cx="${cx}" cy="${cy}" r="5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>
      <text x="${cx}" y="${below ? cy + 20 : cy - 10}" text-anchor="${anchor}" font-size="11" font-weight="600" fill="var(--ink-2)">Out ${fmtDate(addDays(t0, sim.out), { month: 'short', day: 'numeric' })}</text>`;
  };
  g += mark(all, 'var(--s1)', false);
  if (ess.out !== all.out) g += mark(ess, 'var(--s2)', true);
  if (M.r > 40) {
    let ya = y(all.bal[days]), ye = y(ess.bal[days]);
    if (Math.abs(ya - ye) < 26) { const mid = (ya + ye) / 2, s = ya <= ye ? -1 : 1; ya = mid + s * 13; ye = mid - s * 13; }
    g += `<text x="${W - M.r + 8}" y="${ya - 2}" font-size="11" fill="var(--ink-2)">All bills</text><text x="${W - M.r + 8}" y="${ya + 11}" font-size="11" font-weight="600" fill="var(--ink)">${compact(all.bal[days])}</text>`;
    g += `<text x="${W - M.r + 8}" y="${ye - 2}" font-size="11" fill="var(--ink-2)">Essentials</text><text x="${W - M.r + 8}" y="${ye + 11}" font-size="11" font-weight="600" fill="var(--ink)">${compact(ess.bal[days])}</text>`;
  }
  g += `<g id="hover" style="display:none"><line id="hx" y1="${M.t}" y2="${Hh - M.b}" stroke="var(--ink-2)" stroke-width="1"/>
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
    tip.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${fmtDate(addDays(t0, d))}</div>${rows}`;
    tip.style.display = 'block';
    const bx = box.getBoundingClientRect(), tx = ev.clientX - bx.left;
    tip.style.top = '8px';
    tip.style.left = (tx + 14 + tip.offsetWidth > bx.width ? Math.max(0, tx - tip.offsetWidth - 14) : tx + 14) + 'px';
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
function openDialog(title, fieldsHTML, submitLabel, handler) {
  form.innerHTML = `<h3>${title}</h3>${fieldsHTML}<div class="form-error" role="alert" hidden></div><div class="dlg-actions"><button type="button" data-close>Cancel</button><button class="primary" value="ok">${submitLabel}</button></div>`;
  onSubmit = handler;
  if (dlg.open) dlg.close();
  dlg.showModal();
  const first = form.querySelector('input,select');
  if (first) first.focus();
}
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!onSubmit) return;
  const fd = Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll('input[type=checkbox]').forEach(c => { fd[c.name] = c.checked; });
  const before = JSON.stringify(S);
  let res;
  try { res = onSubmit(fd) || {}; } catch (err) { console.error(err); res = { error: 'Something went wrong saving that. Nothing was changed.' }; S = JSON.parse(before); }
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
    case 'tab': ui.tab = el.dataset.tab; render(); break;
    case 'range': ui.range = +el.dataset.m; render(); break;
    case 'sample':
      if (hasData(S) && !confirm('Replace your current data with sample data? A snapshot of your data is saved first.')) return;
      snapshot('Before sample data', S);
      commit(hasData(S) ? 'Sample data loaded.' : '', () => { S = sampleState(); });
      break;
    case 'reset':
      if (!confirm('Erase all accounts, bills, income and history? A snapshot is saved first, so you can restore it from Settings.')) return;
      snapshot('Before erase', S);
      commit('All data erased.', () => { S = C.blank(); });
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
    renderApp(); renderBanners();
    toast('Updated with changes from another tab.');
  } catch (err) {}
});

/* Roll over at midnight, or when returning to a tab left open for days. */
const checkDay = () => { if (iso(today()) !== renderedDay && !dlg.open) render(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
setInterval(checkDay, 60000);

let rz;
window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { try { renderApp(); } catch (err) {} }, 150); });
window.addEventListener('error', ev => { console.error(ev.error || ev.message); toast('Something went wrong. Your data is saved; try reloading if things look off.'); });
window.addEventListener('unhandledrejection', ev => { console.error(ev.reason); });

try { const th = ls.get(THEME_KEY); if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th; } catch (e) {}
snapshot('Daily auto-save', S, { daily: true });
render();
})();
