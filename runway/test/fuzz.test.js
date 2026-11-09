'use strict';
/* Property tests: random financial situations, checking rules that must always hold. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const TODAY = C.parse('2026-11-09');
const date = (lo, hi) => C.iso(C.addDays(TODAY, Math.floor(lo + rnd() * (hi - lo))));
const FREQS = Object.keys(C.FREQ);

function randomState() {
  const accounts = [];
  for (let i = 0, n = Math.floor(rnd() * 4); i < n; i++) accounts.push({ name: 'Cash' + i, balance: Math.round(rnd() * 40000 - 2000), include: rnd() > 0.15 });
  for (let i = 0, n = Math.floor(rnd() * 4); i < n; i++) accounts.push({ name: 'Card' + i, type: 'credit', balance: Math.round(rnd() * 6000), limit: Math.round(1000 + rnd() * 20000), apr: pick([0, 0, 12.5, 19.99, 24.99, 29.99]), include: rnd() > 0.2 });
  const bills = [];
  for (let i = 0, n = Math.floor(rnd() * 25); i < n; i++) bills.push({ name: 'Bill' + i, amount: Math.round(rnd() * 2000 * 100) / 100, freq: pick(FREQS), next: date(-40, 200), end: rnd() > 0.8 ? date(30, 600) : '', essential: rnd() > 0.3, card: rnd() > 0.4 });
  const income = [];
  for (let i = 0, n = Math.floor(rnd() * 4); i < n; i++) income.push({ name: 'Inc' + i, amount: Math.round(rnd() * 3000), freq: pick(FREQS), next: date(-10, 90), end: rnd() > 0.5 ? date(30, 400) : '' });
  return C.normalizeState({ accounts, bills, income, settings: { cushion: pick([0, 0, 500, 2000]), creditCap: pick([30, 80, 100]), targetMonths: pick([3, 12, 24]) } }).state;
}

const N = 400;
const states = Array.from({ length: N }, randomState);
const score = r => (r.out < 0 ? Infinity : r.out);

test('normalizeState is idempotent and survives a JSON round trip', () => {
  for (const s of states) {
    const again = C.normalizeState(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(again.state, s);
    assert.equal(again.warnings.length, 0);
  }
});

test('projections never produce NaN or Infinity', () => {
  for (const s of states) {
    for (const opts of [{}, { essentialOnly: true }, { useCredit: true }]) {
      const r = C.simulate(s, { ...opts, days: 730 }, TODAY);
      assert.ok([...r.bal].every(Number.isFinite), 'balance finite');
      assert.ok([...r.owed].every(v => Number.isFinite(v) && v >= -0.01), 'card debt finite, non-negative');
      assert.ok(Number.isFinite(r.interest) && r.interest >= 0);
      assert.ok(r.out >= -1 && r.out <= 730);
    }
  }
});

test('cutting to essentials never shortens the runway', () => {
  for (const s of states) {
    assert.ok(score(C.simulate(s, { essentialOnly: true, days: 730 }, TODAY)) >= score(C.simulate(s, { days: 730 }, TODAY)));
  }
});

test('the credit plan never shortens the runway', () => {
  let failures = 0, example = null;
  for (const s of states) {
    const cash = C.simulate(s, { days: 730 }, TODAY), plan = C.planCredit(s, { days: 730 }, TODAY);
    if (score(plan) < score(cash)) { failures++; example = example || { cash: cash.out, plan: plan.out }; }
  }
  assert.equal(failures, 0, `credit shortened the runway in ${failures} cases, e.g. ${JSON.stringify(example)}`);
});

test('card balances stay within the cap plus interest, and never go negative', () => {
  for (const s of states) {
    const r = C.simulate(s, { useCredit: true, days: 730 }, TODAY);
    const cards = s.accounts.filter(a => a.type === 'credit');
    const ceiling = cards.reduce((t, a) => t + Math.max(a.balance, a.limit * s.settings.creditCap / 100), 0);
    assert.ok(Math.max(...r.owed) <= ceiling * 1.6 + 1, `owed ${Math.max(...r.owed)} vs ceiling ${ceiling}`);
  }
});

test('gapFor really reaches the goal', () => {
  for (const s of states.slice(0, 120)) {
    const m = s.settings.targetMonths, gap = C.gapFor(s, m, false, TODAY);
    if (!Number.isFinite(gap) || gap === 0) continue;
    const r = C.simulate(s, { extraMonthly: gap, days: Math.round(m * C.MONTH) }, TODAY);
    assert.equal(r.out, -1, `gap ${gap} should cover ${m} months`);
    const less = C.simulate(s, { extraMonthly: Math.max(0, gap - 5), days: Math.round(m * C.MONTH) }, TODAY);
    assert.notEqual(less.out, -1, 'and is close to the minimum');
  }
});

test('more cash never shortens any runway', () => {
  for (const s of states.slice(0, 150)) {
    const rich = JSON.parse(JSON.stringify(s));
    rich.accounts.push({ id: 'extra', name: 'Windfall', type: 'cash', balance: 5000, include: true, updated: '' });
    for (const opts of [{}, { essentialOnly: true }]) {
      assert.ok(score(C.simulate(rich, { ...opts, days: 730 }, TODAY)) >= score(C.simulate(s, { ...opts, days: 730 }, TODAY)));
    }
    assert.ok(score(C.planCredit(rich, { days: 730 }, TODAY)) >= score(C.planCredit(s, { days: 730 }, TODAY)));
  }
});
