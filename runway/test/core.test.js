'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const D = s => C.parse(s);
const TODAY = D('2026-11-08');
const state = (over = {}) => C.normalizeState({
  accounts: [{ id: 'a', name: 'Checking', balance: 10000 }],
  bills: [], income: [], settings: { cushion: 0 }, ...over
}).state;

test('isISODate rejects impossible and malformed dates', () => {
  assert.ok(C.isISODate('2028-02-29'));
  for (const bad of ['2027-02-29', '2026-13-01', '2026-00-10', '2026-1-5', '', null, 42, '1800-01-01', '2026-04-31', '2026-11-08T00:00']) {
    assert.equal(C.isISODate(bad), false, String(bad));
  }
  assert.throws(() => C.parse('nope'), RangeError);
});

test('monthly dates keep their anchor day instead of drifting', () => {
  const bill = { next: '2027-01-31', freq: 'monthly', anchorDay: 31 };
  const got = C.occurrences(bill, D('2027-05-31')).map(C.iso);
  assert.deepEqual(got, ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
});

test('nextAfter advances with the anchor and stops at the end date', () => {
  assert.equal(C.nextAfter({ next: '2027-02-28', freq: 'monthly', anchorDay: 31 }), '2027-03-31');
  assert.equal(C.nextAfter({ next: '2027-03-01', freq: 'monthly', end: '2027-03-15' }), null);
  assert.equal(C.nextAfter({ next: '2027-03-01', freq: 'once' }), null);
  assert.equal(C.nextAfter({ next: '2027-03-01', freq: 'biweekly' }), '2027-03-15');
});

test('yearly leap-day bill lands on Feb 28 in non-leap years', () => {
  const got = C.occurrences({ next: '2028-02-29', freq: 'annual', anchorDay: 29 }, D('2032-12-31')).map(C.iso);
  assert.deepEqual(got, ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
});

test('weekly dates stay on calendar days across daylight-saving changes', () => {
  const got = C.occurrences({ next: '2026-10-29', freq: 'weekly' }, D('2026-11-19')).map(C.iso);
  assert.deepEqual(got, ['2026-10-29', '2026-11-05', '2026-11-12', '2026-11-19']);
  assert.equal(C.daysBetween(D('2026-03-07'), D('2026-03-09')), 2);
  assert.equal(C.daysBetween(D('2026-10-31'), D('2026-11-02')), 2);
});

test('occurrences respect end date, one-time items and bad input', () => {
  assert.equal(C.occurrences({ next: '2026-11-10', freq: 'weekly', end: '2026-11-30' }, D('2027-12-31')).length, 3);
  assert.equal(C.occurrences({ next: '2026-11-10', freq: 'once' }, D('2027-12-31')).length, 1);
  assert.equal(C.occurrences({ next: 'garbage', freq: 'weekly' }, D('2027-12-31')).length, 0);
  assert.equal(C.occurrences(null, D('2027-12-31')).length, 0);
});

test('simulate applies bills and income on the right days', () => {
  const s = state({
    bills: [{ name: 'Rent', amount: 2000, freq: 'monthly', next: '2026-12-01' }],
    income: [{ name: 'Benefits', amount: 500, freq: 'weekly', next: '2026-11-10', end: '2026-11-24' }]
  });
  const r = C.simulate(s, { days: 60 }, TODAY);
  assert.equal(r.bal[0], 10000);
  assert.equal(r.bal[2], 10500);                // Nov 10
  assert.equal(r.bal[16], 11500);               // Nov 24, last benefit
  assert.equal(r.bal[23], 9500);                // Dec 1 rent
  assert.equal(r.bal[60], 7500);                // Jan 1 rent, no more benefits
  assert.equal(r.out, -1);
});

test('overdue bills count today, and runway ends at the cushion', () => {
  const s = state({
    settings: { cushion: 1000 },
    bills: [{ name: 'Late', amount: 500, freq: 'once', next: '2026-11-01' },
            { name: 'Rent', amount: 3000, freq: 'monthly', next: '2026-12-01' }]
  });
  const r = C.simulate(s, { days: 120 }, TODAY);
  assert.equal(r.bal[0], 9500);
  // 9500 -3000 Dec 1 -> 6500, Jan 1 -> 3500, Feb 1 -> 500 < 1000
  assert.equal(C.iso(C.addDays(TODAY, r.out)), '2027-02-01');
});

test('essentials-only scenario skips non-essential bills', () => {
  const s = state({
    bills: [{ name: 'Rent', amount: 1000, freq: 'monthly', next: '2026-11-15', essential: true },
            { name: 'Gym', amount: 100, freq: 'monthly', next: '2026-11-15', essential: false }]
  });
  assert.equal(C.simulate(s, { days: 30 }, TODAY).bal[30], 8900);
  assert.equal(C.simulate(s, { essentialOnly: true, days: 30 }, TODAY).bal[30], 9000);
});

test('gapFor finds the monthly amount that reaches the goal', () => {
  const s = state({ bills: [{ name: 'Rent', amount: 2000, freq: 'monthly', next: '2026-11-09' }] });
  // 10000 lasts 5 payments; to cover 12 months we need roughly 2000 - 10000/12 per month.
  const gap = C.gapFor(s, 12, false, TODAY);
  assert.ok(gap > 1000 && gap < 2000, String(gap));
  const check = C.simulate(s, { extraMonthly: gap, days: Math.round(12 * C.MONTH) }, TODAY);
  assert.equal(check.out, -1);
  assert.equal(C.gapFor(state(), 12, false, TODAY), 0);
  // Already below the cushion today: no monthly amount can fix that.
  assert.equal(C.gapFor(state({ settings: { cushion: 50000 } }), 12, false, TODAY), Infinity);
});

test('simulate clamps silly projection lengths', () => {
  assert.equal(C.simulate(state(), { days: 1e9 }, TODAY).days, C.MAX_DAYS);
  assert.equal(C.simulate(state(), { days: -5 }, TODAY).days, 0);
  assert.equal(C.simulate(state(), { days: 'abc' }, TODAY).days, 730);
});

test('normalizeState repairs and reports bad data', () => {
  const { state: s, warnings } = C.normalizeState({
    accounts: [{ id: 'x', name: 'A', balance: 'abc' }, { id: 'x', name: 'B', balance: '12.345' }, 'junk'],
    bills: [
      { name: 'No date', amount: 5, freq: 'monthly', next: 'soon' },
      { name: 'Neg', amount: -5, freq: 'fortnightly', next: '2026-11-30', end: '2026-01-01' },
      { name: 'Ok', amount: '99.999', freq: 'monthly', next: '2026-11-30' }
    ],
    income: 'not a list',
    checkins: [{ date: '2026-11-01', total: 5 }, { date: '2026-11-01', total: 6 }, { date: 'bad', total: 1 }],
    settings: { cushion: -10, targetMonths: 900, horizon: 7 }
  });
  assert.equal(s.version, C.SCHEMA_VERSION);
  assert.equal(s.accounts.length, 2);
  assert.notEqual(s.accounts[0].id, s.accounts[1].id, 'duplicate ids are replaced');
  assert.equal(s.accounts[0].balance, 0);
  assert.equal(s.accounts[1].balance, 12.35);
  assert.deepEqual(s.bills.map(b => b.name), ['Neg', 'Ok']);
  assert.equal(s.bills[0].amount, 0);
  assert.equal(s.bills[0].freq, 'monthly');
  assert.equal(s.bills[0].end, '');
  assert.equal(s.bills[1].amount, 100);
  assert.equal(s.bills[1].anchorDay, 30);
  assert.deepEqual(s.income, []);
  assert.deepEqual(s.checkins, [{ date: '2026-11-01', total: 6 }]);
  assert.deepEqual(s.settings, { cushion: 0, targetMonths: 60, horizon: 24, lastExport: '', creditCap: 80, creditStrategy: 'late' });
  assert.ok(warnings.length >= 6, warnings.join('\n'));
});

test('normalizeState migrates version 1 data and rejects non-objects', () => {
  const v1 = { version: 1, accounts: [], bills: [{ id: 'r', name: 'Rent', amount: 100, freq: 'monthly', next: '2027-01-31', essential: true }], income: [] };
  assert.equal(C.normalizeState(v1).state.bills[0].anchorDay, 31);
  assert.equal(C.normalizeState(v1).state.bills[0].id, 'r');
  for (const bad of [null, 'x', 5, []]) assert.throws(() => C.normalizeState(bad), TypeError);
  assert.equal(C.normalizeState({}).warnings.length, 0);
});

test('normalizeState is idempotent', () => {
  const once = C.normalizeState({ accounts: [{ name: 'A', balance: 5 }], bills: [{ name: 'B', amount: 1, freq: 'weekly', next: '2026-11-09' }] }).state;
  const twice = C.normalizeState(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice.state, once);
  assert.equal(twice.warnings.length, 0);
});

test('upcoming lists overdue items and running balances in order', () => {
  const s = state({
    bills: [{ name: 'Phone', amount: 50, freq: 'monthly', next: '2026-11-05' }],
    income: [{ name: 'Gig', amount: 200, freq: 'once', next: '2026-11-20' }]
  });
  const ev = C.upcoming(s, 30, TODAY);
  assert.deepEqual(ev.map(e => [C.iso(e.date), e.amount, e.after, e.overdue]), [
    ['2026-11-05', -50, 9950, true],
    ['2026-11-20', 200, 10150, false],
    ['2026-12-05', -50, 10100, false]
  ]);
});

/* ---------- credit ---------- */
const withCard = (over = {}) => state({
  accounts: [
    { id: 'a', name: 'Checking', balance: 3000 },
    { id: 'c', name: 'Card', type: 'credit', balance: 0, limit: 10000, apr: 24 }
  ],
  ...over
});

test('credit cards are not cash, and carry limit and APR', () => {
  const s = withCard();
  assert.equal(C.cashTotal(s), 3000);
  const card = s.accounts.find(a => a.type === 'credit');
  assert.deepEqual([card.limit, card.apr, card.balance], [10000, 24, 0]);
  assert.deepEqual(C.creditSummary(s), { cards: 1, limit: 10000, owed: 0, owedAll: 0, usable: 8000, cap: 0.8 });
  const bad = C.normalizeState({ accounts: [{ type: 'credit', balance: -50, limit: 'x', apr: 400 }] }).state.accounts[0];
  assert.deepEqual([bad.balance, bad.limit, bad.apr], [0, 0, 100]);
});

test('without credit, card-eligible bills still come out of cash', () => {
  const s = withCard({ bills: [{ name: 'Phone', amount: 1000, freq: 'monthly', next: '2026-11-10', card: true }] });
  const r = C.simulate(s, { days: 120 }, TODAY);
  assert.equal(r.bal[2], 2000);
  assert.equal(r.charged, 0);
  assert.equal(C.iso(C.addDays(TODAY, r.out)), '2027-02-10');
});

test('with credit, card-eligible bills go on the card and cash is kept for the rest', () => {
  const s = withCard({ bills: [{ name: 'Phone', amount: 1000, freq: 'monthly', next: '2026-11-10', card: true }] });
  const r = C.simulate(s, { useCredit: true, days: 40 }, TODAY);
  assert.equal(r.bal[2], 3000, 'cash untouched on Nov 10');
  assert.equal(r.charged, 2000, 'Nov 10 and Dec 10 both charged');
  const later = C.simulate(s, { useCredit: true, creditFrom: 5, days: 40 }, TODAY);
  assert.equal(later.bal[2], 2000, 'before creditFrom, cash pays');
});

test('planCredit reaches the longest runway while starting card use as late as it can', () => {
  const s = withCard({
    accounts: [{ id: 'a', name: 'Checking', balance: 6000 }, { id: 'c', name: 'Card', type: 'credit', balance: 0, limit: 20000, apr: 24 }],
    bills: [
      { name: 'Rent', amount: 1000, freq: 'monthly', next: '2026-12-01' },
      { name: 'Groceries', amount: 600, freq: 'monthly', next: '2026-11-15', card: true }
    ]
  });
  const none = C.simulate(s, { days: 730 }, TODAY);
  const early = C.simulate(s, { useCredit: true, days: 730 }, TODAY);
  const plan = C.planCredit(s, { days: 730 }, TODAY);
  assert.ok(early.out > none.out, 'credit extends the runway');
  assert.equal(plan.out, early.out, 'plan keeps the longest runway');
  assert.ok(plan.creditFrom > 0, 'and starts card use later');
  assert.ok(plan.interest < early.interest, `with less interest (${plan.interest} < ${early.interest})`);
});

test('card balances accrue interest and require monthly minimums from cash', () => {
  const s = withCard({ accounts: [{ id: 'a', name: 'Checking', balance: 3000 }, { id: 'c', name: 'Card', type: 'credit', balance: 5000, limit: 10000, apr: 24 }] });
  const r = C.simulate(s, { days: 31 }, TODAY);
  // Day 30: interest 5000 * 2% = 100; minimum = 1% of 5100 + 100 = 151.
  assert.equal(r.interest, 100);
  assert.equal(Math.round(r.minimums), 151);
  assert.equal(Math.round(r.bal[31]), 3000 - 151);
  assert.equal(Math.round(r.owed[31]), 5100 - 151);
  assert.equal(C.minimumPayment(10, 0), 10);       // never more than owed
  assert.equal(C.minimumPayment(500, 0), 25);      // $25 floor
});

test('credit stops at the cap, and bills a card cannot pay end the runway', () => {
  const s = withCard({
    settings: { cushion: 0, creditCap: 50 },
    bills: [
      { name: 'Groceries', amount: 2000, freq: 'monthly', next: '2026-11-10', card: true },
      { name: 'Rent', amount: 1000, freq: 'monthly', next: '2026-11-15' }
    ]
  });
  const r = C.simulate(s, { useCredit: true, days: 730 }, TODAY);
  const max = Math.max(...r.owed);
  assert.ok(max <= 5000 + 1, `card balance stays near the 50% cap (max ${max})`);
  assert.ok(r.out > 0);
  const noCredit = C.simulate(s, { days: 730 }, TODAY);
  assert.ok(r.out > noCredit.out, 'credit extends the runway');
});

test('cheapest card is used first', () => {
  const s = state({
    accounts: [
      { id: 'a', name: 'Checking', balance: 0 },
      { id: 'hi', name: 'High', type: 'credit', balance: 0, limit: 5000, apr: 29 },
      { id: 'lo', name: 'Low', type: 'credit', balance: 0, limit: 5000, apr: 0 }
    ],
    settings: { creditCap: 100 },
    bills: [{ name: 'Phone', amount: 100, freq: 'once', next: '2026-11-10', card: true }]
  });
  const r = C.simulate(s, { useCredit: true, days: 40 }, TODAY);
  assert.equal(r.interest, 0, 'a 0% card accrues nothing');
});

test('no credit accounts: results identical with or without useCredit', () => {
  const s = state({ bills: [{ name: 'Rent', amount: 2000, freq: 'monthly', next: '2026-12-01', card: true }] });
  const a = C.simulate(s, { days: 400 }, TODAY), b = C.simulate(s, { useCredit: true, days: 400 }, TODAY);
  assert.deepEqual([...a.bal], [...b.bal]);
  assert.equal(a.out, b.out);
});

test('a card not used for runway still costs interest and minimums, but takes no new charges', () => {
  const s = state({
    accounts: [{ id: 'a', name: 'Checking', balance: 3000 }, { id: 'c', name: 'Old card', type: 'credit', balance: 4000, limit: 5000, apr: 24, include: false }],
    bills: [{ name: 'Phone', amount: 100, freq: 'monthly', next: '2026-11-10', card: true }]
  });
  const r = C.simulate(s, { useCredit: true, days: 31 }, TODAY);
  assert.equal(r.interest, 80);
  assert.equal(r.charged, 0);
  assert.ok(r.minimums > 0);
  assert.equal(C.creditSummary(s).cards, 0);
  assert.equal(C.creditSummary(s).owedAll, 4000);
  assert.equal(Math.round(C.monthlyMinimums(s)), 121);   // 1% of 4080 + 80 interest
});

test('long histories and huge lists are trimmed to keep the synced copy small', () => {
  const checkins = Array.from({ length: 1500 }, (_, i) => ({ date: C.iso(C.addDays(TODAY, -i)), total: i }));
  const bills = Array.from({ length: 700 }, (_, i) => ({ name: 'B' + i, amount: 1, freq: 'monthly', next: '2026-12-01' }));
  const { state: s, warnings } = C.normalizeState({ checkins, bills });
  assert.equal(s.checkins.length, C.MAX_CHECKINS);
  assert.equal(s.checkins[s.checkins.length - 1].date, C.iso(TODAY), 'the newest are kept');
  assert.equal(s.bills.length, 500);
  assert.ok(warnings.some(w => /first 500 bills/.test(w)));
});

test('every-6-months bills keep their day and skip leap-year traps', () => {
  const got = C.occurrences({ next: '2027-02-05', freq: 'semiannual', anchorDay: 5 }, C.parse('2028-08-31')).map(C.iso);
  assert.deepEqual(got, ['2027-02-05', '2027-08-05', '2028-02-05', '2028-08-05']);
  assert.equal(C.nextAfter({ next: '2027-08-31', freq: 'semiannual', anchorDay: 31 }), '2028-02-29');
});

test('benefits stop after the last full payment the remaining balance covers', () => {
  const ui = { name: 'UI', amount: 425, freq: 'weekly', next: '2026-11-11', remaining: 11472, gross: 472 };
  assert.equal(C.paymentsLeft(ui), 24);
  assert.equal(C.benefitEnd(ui), '2027-04-21');
  assert.equal(C.occurrences(ui, C.parse('2028-01-01')).length, 24);
  // after one payment is received the end date doesn't move
  assert.equal(C.benefitEnd({ ...ui, next: '2026-11-18', remaining: 11000 }), '2027-04-21');
  // an explicit earlier end date still wins
  assert.equal(C.endOf({ ...ui, end: '2027-01-06' }), '2027-01-06');
  // nothing left: no more payments, and the income counts as ended
  const done = { ...ui, remaining: 300 };
  assert.equal(C.occurrences(done, C.parse('2028-01-01')).length, 0);
  assert.equal(C.isActive(done, C.parse('2026-11-11')), false);
  // normalize keeps both fields only together
  const n = C.normalizeState({ income: [ui, { ...ui, gross: 0 }] }).state.income;
  assert.deepEqual([n[0].remaining, n[0].gross, n[1].remaining], [11472, 472, undefined]);
});

test('credit strategy: carrying from now reaches the same runway but costs more interest', () => {
  const base = {
    accounts: [{ id: 'a', name: 'Checking', balance: 6000 }, { id: 'c', name: 'Card', type: 'credit', balance: 0, limit: 20000, apr: 24 }],
    bills: [{ name: 'Rent', amount: 1000, freq: 'monthly', next: '2026-12-01' }, { name: 'Groceries', amount: 600, freq: 'monthly', next: '2026-11-15', card: true }]
  };
  const late = C.normalizeState({ ...base, settings: { creditStrategy: 'late' } }).state;
  const now = C.normalizeState({ ...base, settings: { creditStrategy: 'now' } }).state;
  const a = C.creditProjection(late, { days: 730 }, TODAY), b = C.creditProjection(now, { days: 730 }, TODAY);
  assert.equal(a.out, b.out);
  assert.equal(b.creditFrom, 0);
  assert.ok(b.interest > a.interest);
  assert.equal(C.normalizeState({ settings: { creditStrategy: 'weird' } }).state.settings.creditStrategy, 'late');
});

/* ---------- what-if scenarios ---------- */
const wiBase = () => C.normalizeState({
  accounts: [{ id: 'a', name: 'Savings', balance: 20000 }],
  bills: [
    { id: 'mort', name: 'Mortgage', amount: 5000, freq: 'monthly', next: '2026-12-01' },
    { id: 'car', name: 'Car', amount: 1000, freq: 'monthly', next: '2026-11-20' }
  ],
  income: [{ id: 'ui', name: 'Unemployment', amount: 400, freq: 'weekly', next: '2026-11-11' }]
}).state;
const sc = (type, p, extra = {}) => C.normalizeState({ scenarios: [{ id: 's1', name: 'Test', type, on: true, p, ...extra }] }).state.scenarios[0];
const runOut = s => C.simulate(s, { days: 1100 }, TODAY).out;

test('scenarios never change the real data', () => {
  const s = wiBase(), before = JSON.stringify(s);
  C.applyScenarios(s, [sc('bill', { billId: 'mort', mode: 'pause', from: '2026-12-01', months: 3 })]);
  assert.equal(JSON.stringify(s), before);
});

test('selling something adds cash on the date and can stop its payment', () => {
  const s = wiBase();
  const keep = C.applyScenarios(s, [sc('sell', { amount: 30000, date: '2027-01-15' })]);
  const stop = C.applyScenarios(s, [sc('sell', { amount: 30000, date: '2027-01-15', billId: 'car', payoff: 25000 })]);
  assert.ok(runOut(keep) > runOut(s));
  assert.equal(stop.bills.find(b => b.id === 'car').end, '2027-01-14');
  assert.ok(stop.bills.some(b => b.name.includes('loan payoff') && b.amount === 25000));
  assert.equal(C.occurrences(stop.bills.find(b => b.id === 'car'), C.parse('2028-01-01')).map(C.iso).pop(), '2026-12-20');
});

test('pausing a bill skips exactly that many months, then it resumes', () => {
  const s = C.applyScenarios(wiBase(), [sc('bill', { billId: 'mort', mode: 'pause', from: '2026-12-01', months: 3 })]);
  const dates = s.bills.filter(b => b.name === 'Mortgage').flatMap(b => C.occurrences(b, C.parse('2027-06-30'))).map(C.iso).sort();
  assert.deepEqual(dates, ['2027-03-01', '2027-04-01', '2027-05-01', '2027-06-01']);
});

test('changing a bill amount applies from the date; $0 cancels it', () => {
  const lower = C.applyScenarios(wiBase(), [sc('bill', { billId: 'car', mode: 'change', from: '2027-01-01', amount: 400 })]);
  const amounts = lower.bills.filter(b => b.name === 'Car').flatMap(b => C.occurrences(b, C.parse('2027-02-28')).map(d => [C.iso(d), b.amount])).sort();
  assert.deepEqual(amounts, [['2026-11-20', 1000], ['2026-12-20', 1000], ['2027-01-20', 400], ['2027-02-20', 400]]);
  const cancel = C.applyScenarios(wiBase(), [sc('bill', { billId: 'car', mode: 'change', from: '2027-01-01', amount: 0 })]);
  assert.equal(cancel.bills.filter(b => b.name === 'Car').length, 1);
});

test('a new job adds pay and stops the chosen income the day before it starts', () => {
  const s = C.applyScenarios(wiBase(), [sc('job', { amount: 3000, freq: 'biweekly', start: '2027-02-05', stopIncomeId: 'ui' })]);
  assert.equal(s.income.find(i => i.id === 'ui').end, '2027-02-04');
  assert.ok(s.income.some(i => i.amount === 3000 && i.next === '2027-02-05'));
  assert.equal(runOut(s), -1, 'a $3,000 biweekly job covers these bills');
});

test('extra income and new expenses move the runway in the right direction', () => {
  const s = wiBase();
  assert.ok(runOut(C.applyScenarios(s, [sc('income', { amount: 1500, freq: 'monthly', start: '2026-12-01' })])) > runOut(s));
  assert.ok(runOut(C.applyScenarios(s, [sc('expense', { amount: 3000, freq: 'once', start: '2026-12-01' })])) < runOut(s));
});

test('scenarios combine, and bad or unknown ones are dropped', () => {
  const s = wiBase();
  const a = sc('sell', { amount: 30000, date: '2027-01-15' }), b = { ...sc('bill', { billId: 'mort', mode: 'pause', from: '2026-12-01', months: 3 }), id: 's2' };
  const both = runOut(C.applyScenarios(s, [a, b]));
  assert.ok(both > runOut(C.applyScenarios(s, [a])) && both > runOut(C.applyScenarios(s, [b])));
  const n = C.normalizeState({ scenarios: [{ type: 'nope' }, { type: 'sell', p: { amount: 0, date: '2027-01-01' } }, { type: 'bill', p: { billId: 'x', from: 'bad' } }, a] }).state.scenarios;
  assert.equal(n.length, 1);
  assert.equal(C.normalizeState({ scenarios: [{ ...a, on: 'yes' }] }).state.scenarios[0].on, false, 'only true turns a scenario on');
});
