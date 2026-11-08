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
  assert.deepEqual(s.settings, { cushion: 0, targetMonths: 60, horizon: 24, lastExport: '' });
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
