/*
 * Runway Tracker core: pure date, validation and projection logic.
 * No DOM access, so it runs in the browser (window.RunwayCore) and in Node (require) for tests.
 * Every function that depends on "today" takes it as an argument.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RunwayCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = 2;
  const DAY = 86400000;
  const MONTH = 30.4375;            // average days per month
  const MAX_DAYS = 3660;            // hard cap on projection length (~10 years)
  const MAX_OCCURRENCES = 5000;     // per item, guards against runaway loops
  const MAX_ACTIVITY = 500;
  const MAX_CHECKINS = 1000;      // ~3 years daily, ~19 years weekly; keeps the synced copy small
  const MAX_ITEMS = 500;          // per list (accounts, bills, income)
  const MAX_AMOUNT = 1e9;

  /* ---------- dates (local calendar days, never UTC) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  /** True only for a real calendar date in YYYY-MM-DD form between 1900 and 2200. */
  function isISODate(s) {
    if (typeof s !== 'string') return false;
    const m = ISO_RE.exec(s);
    if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
    return d <= new Date(y, mo, 0).getDate();
  }
  function parse(s) {
    if (!isISODate(s)) throw new RangeError(`Invalid date: ${s}`);
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  /** Calendar-day difference; rounding absorbs DST hour shifts. */
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
  const lastDayOfMonth = (y, m) => new Date(y, m + 1, 0).getDate();

  /**
   * Add n months, landing on `anchorDay` (or the month's last day if shorter).
   * Using a fixed anchor prevents drift: Jan 31 -> Feb 28 -> Mar 31, not Mar 28.
   */
  function addMonths(d, n, anchorDay) {
    const day = anchorDay || d.getDate();
    const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
    t.setDate(Math.min(day, lastDayOfMonth(t.getFullYear(), t.getMonth())));
    return t;
  }

  /* ---------- frequencies ---------- */
  const FREQ = {
    weekly:    { label: 'Weekly',        perMonth: 52 / 12 },
    biweekly:  { label: 'Every 2 weeks', perMonth: 26 / 12 },
    monthly:   { label: 'Monthly',       perMonth: 1 },
    quarterly: { label: 'Quarterly',     perMonth: 1 / 3 },
    semiannual: { label: 'Every 6 months', perMonth: 1 / 6 },
    annual:    { label: 'Yearly',        perMonth: 1 / 12 },
    once:      { label: 'One time',      perMonth: 0 }
  };
  const MONTH_BASED = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

  function nthOccurrence(base, freq, k, anchorDay) {
    if (freq === 'weekly') return addDays(base, 7 * k);
    if (freq === 'biweekly') return addDays(base, 14 * k);
    if (MONTH_BASED[freq]) return addMonths(base, MONTH_BASED[freq] * k, anchorDay);
    return k === 0 ? base : null;
  }

  /** All dates of an item from its `next` date up to and including `to`, stopping at `end`. */
  function occurrences(item, to) {
    const out = [];
    if (!item || !isISODate(item.next)) return out;
    const base = parse(item.next);
    const end = isISODate(item.end) ? parse(item.end) : null;
    for (let k = 0; k < MAX_OCCURRENCES; k++) {
      const d = nthOccurrence(base, item.freq, k, item.anchorDay);
      if (!d || d > to) break;
      if (end && d > end) break;
      out.push(d);
    }
    return out;
  }

  /** The date after item.next, or null when the item is finished (one-time or past its end). */
  function nextAfter(item) {
    if (!item || item.freq === 'once' || !isISODate(item.next)) return null;
    const n = nthOccurrence(parse(item.next), item.freq, 1, item.anchorDay);
    if (!n) return null;
    if (isISODate(item.end) && n > parse(item.end)) return null;
    return iso(n);
  }

  const isActive = (item, today) => !isISODate(item.end) || parse(item.end) >= startOfDay(today);

  /* ---------- money ---------- */
  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const finite = (v, fallback = 0) => {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  };

  /* ---------- state ---------- */
  function uid() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 13); } catch (e) {}
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function blank() {
    return {
      version: SCHEMA_VERSION,
      accounts: [],
      bills: [],
      income: [],
      checkins: [],
      activity: [],
      settings: { cushion: 0, targetMonths: 12, horizon: 24, lastExport: '', creditCap: 80 }
    };
  }

  const str = (v, max = 120) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  const clampInt = (v, lo, hi, dflt) => { const n = Math.round(finite(v, NaN)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };

  /**
   * Turn anything (old versions, hand-edited JSON, partial imports) into a valid state.
   * Never throws for a plain object; throws only when the input is not an object at all.
   * Returns { state, warnings } where warnings describe anything dropped or repaired.
   */
  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Data is not a Runway Tracker object');
    const warnings = [];
    const s = blank();
    const seen = new Set();
    const id = v => {
      let x = str(v, 40);
      if (!x || seen.has(x)) x = uid();
      seen.add(x);
      return x;
    };
    const arr = (v, name) => {
      if (v == null) return [];
      if (!Array.isArray(v)) { warnings.push(`"${name}" was not a list and was ignored.`); return []; }
      const items = v.filter(x => x && typeof x === 'object');
      if (name !== 'checkins' && name !== 'activity' && items.length > MAX_ITEMS) {
        warnings.push(`Only the first ${MAX_ITEMS} ${name} were kept.`);
        return items.slice(0, MAX_ITEMS);
      }
      return items;
    };

    for (const a of arr(raw.accounts, 'accounts')) {
      const bal = finite(a.balance, NaN);
      if (!Number.isFinite(bal)) warnings.push(`Account "${str(a.name) || '?'}" had an invalid balance; set to $0.`);
      const isCredit = a.type === 'credit';
      const rec = {
        id: id(a.id),
        name: str(a.name) || (isCredit ? 'Credit card' : 'Account'),
        type: isCredit ? 'credit' : 'cash',
        // For a credit card, balance is the amount owed (never negative).
        balance: round2(Math.max(isCredit ? 0 : -MAX_AMOUNT, Math.min(MAX_AMOUNT, Number.isFinite(bal) ? bal : 0))),
        include: a.include !== false,
        updated: isISODate(a.updated) ? a.updated : ''
      };
      if (isCredit) {
        rec.limit = round2(Math.max(0, Math.min(MAX_AMOUNT, finite(a.limit, 0))));
        rec.apr = Math.round(Math.max(0, Math.min(100, finite(a.apr, 0))) * 100) / 100;
      }
      s.accounts.push(rec);
    }

    const flow = (list, name, isBill) => {
      const out = [];
      for (const it of arr(list, name)) {
        const label = str(it.name) || (isBill ? 'Bill' : 'Income');
        if (!isISODate(it.next)) { warnings.push(`"${label}" had no valid next date and was removed.`); continue; }
        let amount = finite(it.amount, NaN);
        if (!Number.isFinite(amount) || amount < 0) { warnings.push(`"${label}" had an invalid amount; set to $0.`); amount = 0; }
        const freq = Object.prototype.hasOwnProperty.call(FREQ, it.freq) ? it.freq : 'monthly';
        if (freq !== it.freq) warnings.push(`"${label}" had an unknown frequency; set to monthly.`);
        let end = isISODate(it.end) ? it.end : '';
        if (end && end < it.next) { warnings.push(`"${label}" ended before its next date; end date cleared.`); end = ''; }
        const rec = {
          id: id(it.id),
          name: label,
          amount: round2(Math.min(MAX_AMOUNT, amount)),
          freq,
          next: it.next,
          end,
          anchorDay: MONTH_BASED[freq] ? clampInt(it.anchorDay, 1, 31, parse(it.next).getDate()) : undefined
        };
        if (rec.anchorDay === undefined) delete rec.anchorDay;
        if (isBill) { rec.category = str(it.category, 40) || 'Other'; rec.essential = it.essential !== false; rec.card = it.card === true; }
        out.push(rec);
      }
      return out;
    };
    s.bills = flow(raw.bills, 'bills', true);
    s.income = flow(raw.income, 'income', false);

    const byDate = new Map();
    for (const c of arr(raw.checkins, 'checkins')) {
      if (!isISODate(c.date) || !Number.isFinite(finite(c.total, NaN))) continue;
      byDate.set(c.date, round2(finite(c.total)));
    }
    s.checkins = [...byDate].sort((a, b) => a[0].localeCompare(b[0])).map(([date, total]) => ({ date, total })).slice(-MAX_CHECKINS);

    s.activity = arr(raw.activity, 'activity')
      .filter(a => isISODate(a.date) && Number.isFinite(finite(a.amount, NaN)))
      .map(a => ({ date: a.date, name: str(a.name) || 'Item', amount: round2(finite(a.amount)), account: str(a.account) }))
      .slice(-MAX_ACTIVITY);

    const st = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    s.settings.cushion = round2(Math.max(0, Math.min(MAX_AMOUNT, finite(st.cushion, 0))));
    s.settings.targetMonths = clampInt(st.targetMonths, 1, 60, 12);
    s.settings.horizon = [12, 24, 36].includes(+st.horizon) ? +st.horizon : 24;
    s.settings.lastExport = isISODate(st.lastExport) ? st.lastExport : '';
    s.settings.creditCap = clampInt(st.creditCap, 10, 100, 80);

    return { state: s, warnings };
  }

  /* ---------- projections ---------- */
  const isCash = a => a.type !== 'credit';
  const cashTotal = s => round2(s.accounts.reduce((t, a) => t + (a.include === false || !isCash(a) ? 0 : finite(a.balance)), 0));
  /** Credit cards counted toward runway, with what is still usable under the cap. */
  function creditSummary(s) {
    const cap = finite(s.settings && s.settings.creditCap, 80) / 100;
    const cards = s.accounts.filter(a => a.type === 'credit' && a.include !== false);
    const limit = cards.reduce((t, a) => t + finite(a.limit), 0);
    const owed = cards.reduce((t, a) => t + finite(a.balance), 0);
    const usable = cards.reduce((t, a) => t + Math.max(0, finite(a.limit) * cap - finite(a.balance)), 0);
    const owedAll = s.accounts.filter(a => a.type === 'credit').reduce((t, a) => t + finite(a.balance), 0);
    return { cards: cards.length, limit: round2(limit), owed: round2(owed), owedAll: round2(owedAll), usable: round2(usable), cap };
  }
  /** This month's minimum payments on every card that carries a balance. */
  const monthlyMinimums = s => round2(s.accounts.filter(a => a.type === 'credit' && finite(a.balance) > 0)
    .reduce((t, a) => { const owed = finite(a.balance), int = owed * finite(a.apr) / 1200; return t + minimumPayment(owed + int, int); }, 0));
  /** A typical card minimum: 1% of the balance plus that month's interest, at least $25. */
  const MIN_PAYMENT_FLOOR = 25;
  const minimumPayment = (owed, interest) => Math.min(owed, Math.max(MIN_PAYMENT_FLOOR, owed * 0.01 + interest));
  const monthlyOf = (list, filter = () => true) =>
    round2(list.filter(filter).reduce((t, i) => t + finite(i.amount) * (FREQ[i.freq] ? FREQ[i.freq].perMonth : 0), 0));

  /**
   * Day-by-day balance from today. Anything dated before today (an overdue bill or
   * unconfirmed income) is applied on day 0. `out` is the first day the balance is
   * below the cushion, or -1 if it never is within `days`.
   */
  function simulate(s, { essentialOnly = false, extraMonthly = 0, days = 730, useCredit = false, creditFrom = 0 } = {}, today = new Date()) {
    days = Math.max(0, Math.min(MAX_DAYS, Math.round(finite(days, 730))));
    const t0 = startOfDay(today);
    const end = addDays(t0, days);
    const cashOut = new Float64Array(days + 1);   // bills that must be paid from cash
    const cardOut = new Float64Array(days + 1);   // bills that a card can pay
    const cashIn = new Float64Array(days + 1);
    for (const b of s.bills) {
      if (essentialOnly && !b.essential) continue;
      const target = b.card ? cardOut : cashOut;
      for (const d of occurrences(b, end)) target[Math.max(0, daysBetween(t0, d))] += finite(b.amount);
    }
    for (const i of s.income) {
      for (const d of occurrences(i, end)) cashIn[Math.max(0, daysBetween(t0, d))] += finite(i.amount);
    }
    extraMonthly = finite(extraMonthly);
    if (extraMonthly) for (let k = 1; Math.round(k * MONTH) <= days; k++) cashIn[Math.round(k * MONTH)] += extraMonthly;

    /* Cards: existing balances always accrue interest and need minimum
       payments. With useCredit, from day `creditFrom` on, bills a card can
       pay go on the cheapest card with room, so cash is kept for bills that
       must be paid in cash. planCredit() picks the latest such start. */
    const capPct = finite(s.settings && s.settings.creditCap, 80) / 100;
    // Every card's existing debt costs interest and minimums; only cards
    // used for runway take new charges.
    const cards = s.accounts.filter(a => a.type === 'credit')
      .map(a => ({ owed: Math.max(0, finite(a.balance)), cap: a.include === false ? 0 : finite(a.limit) * capPct, apr: finite(a.apr) / 100 }))
      .sort((x, y) => x.apr - y.apr);
    const payDays = new Set();
    for (let k = 1; Math.round(k * MONTH) <= days; k++) payDays.add(Math.round(k * MONTH));

    const bal = new Float64Array(days + 1);
    const owedByDay = new Float64Array(days + 1);
    const cushion = finite(s.settings && s.settings.cushion);
    let b = cashTotal(s), out = -1, interest = 0, charged = 0, minimums = 0;
    for (let d = 0; d <= days; d++) {
      b += cashIn[d] - cashOut[d];
      let due = cardOut[d];
      if (due && useCredit && cards.length && d >= creditFrom) {
        for (const c of cards) {
          if (due <= 0) break;
          const put = Math.max(0, Math.min(due, c.cap - c.owed));
          c.owed += put; due -= put; charged += put;
        }
      }
      b -= due;                                      // whatever no card could take
      if (payDays.has(d)) {
        for (const c of cards) {
          if (c.owed <= 0.005) continue;
          const int = c.owed * c.apr / 12;
          c.owed += int; interest += int;
          const pay = minimumPayment(c.owed, int);
          c.owed -= pay; b -= pay; minimums += pay;
        }
      }
      bal[d] = b;
      owedByDay[d] = cards.reduce((t, c) => t + c.owed, 0);
      if (out < 0 && b < cushion - 0.005) out = d;
    }
    return { bal, out, days, owed: owedByDay, interest: round2(interest), charged: round2(charged), minimums: round2(minimums), creditFrom: useCredit ? creditFrom : null };
  }

  /**
   * The credit plan that lasts longest, starting card use as late as
   * possible to keep interest down: binary-search the latest start day whose
   * runway still matches the best runway (charging from day 0).
   */
  function planCredit(s, opts = {}, today = new Date()) {
    const run = from => simulate(s, { ...opts, useCredit: true, creditFrom: from }, today);
    const best = run(0);
    const score = r => (r.out < 0 ? Infinity : r.out);
    const target = score(best);
    let lo = 0, hi = best.out < 0 ? best.days : best.out;
    if (score(run(hi)) >= target) return run(hi);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (score(run(mid)) >= target) lo = mid; else hi = mid;
    }
    return run(lo);
  }

  /** Smallest extra monthly amount (income or cuts) that keeps cash above the cushion for `months`. */
  function gapFor(s, months, essentialOnly, today = new Date()) {
    const days = Math.round(Math.max(1, finite(months, 12)) * MONTH);
    const run = extra => simulate(s, { essentialOnly, extraMonthly: extra, days }, today).out;
    if (run(0) < 0) return 0;
    let lo = 0, hi = 1000;
    while (run(hi) >= 0 && hi < 1e10) hi *= 2;
    if (run(hi) >= 0) return Infinity; // e.g. already below cushion on day 0: no monthly amount fixes it
    for (let n = 0; n < 50 && hi - lo > 0.5; n++) {
      const mid = (lo + hi) / 2;
      if (run(mid) >= 0) lo = mid; else hi = mid;
    }
    return hi;
  }

  /** Events from today through `daysAhead`, including overdue ones, with the running balance after each. */
  function upcoming(s, daysAhead, today = new Date()) {
    const t0 = startOfDay(today), end = addDays(t0, daysAhead), ev = [];
    for (const b of s.bills) for (const d of occurrences(b, end)) ev.push({ kind: 'bill', item: b, date: d, amount: -finite(b.amount) });
    for (const i of s.income) for (const d of occurrences(i, end)) ev.push({ kind: 'income', item: i, date: d, amount: finite(i.amount) });
    ev.sort((a, b) => a.date - b.date || a.amount - b.amount);
    let bal = cashTotal(s);
    for (const e of ev) { bal += e.amount; e.after = round2(bal); e.overdue = e.date < t0; }
    return ev;
  }

  return {
    SCHEMA_VERSION, DAY, MONTH, MAX_DAYS, MAX_ACTIVITY, FREQ,
    pad, iso, isISODate, parse, startOfDay, addDays, addMonths, daysBetween,
    nthOccurrence, occurrences, nextAfter, isActive,
    round2, finite, uid, blank, normalizeState,
    MAX_CHECKINS, cashTotal, creditSummary, minimumPayment, monthlyMinimums, monthlyOf, simulate, planCredit, gapFor, upcoming
  };
});
