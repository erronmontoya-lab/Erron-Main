/*
 * Browser tests for the robustness features. Needs Playwright with Chromium:
 *   npm run test:e2e
 */
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const KEY = 'runway-tracker.v1';
const results = [];

async function run(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log('ok -', name); }
  catch (e) { results.push(['FAIL', name]); console.log('FAIL -', name, '\n ', e.message); }
}

(async () => {
  const browser = await chromium.launch();
  const newCtx = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    ctx.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('dialog', d => d.accept());
    });
    return { ctx, errors };
  };

  await run('sample data renders with no errors and the runway headline', async () => {
    const { ctx, errors } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    assert.match(await p.locator('.hero-main .big').innerText(), /\d/);
    assert.equal(await p.locator('#chartBox svg').count(), 1);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('form validation keeps the dialog open and changes nothing', async () => {
    const { ctx, errors } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    const before = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).bills.length, KEY);
    await p.click('[data-tab=bills]');
    await p.click('button[data-action=add][data-kind=bill]');
    await p.fill('input[name=name]', 'Storage unit');
    await p.fill('input[name=amount]', 'abc');
    await p.click('dialog button.primary');
    assert.ok(await p.locator('dialog[open]').isVisible());
    assert.match(await p.locator('.form-error').innerText(), /amount/i);
    await p.fill('input[name=amount]', '$1,250.50');
    await p.fill('input[name=next]', '2027-03-10');
    await p.fill('input[name=end]', '2027-01-01');
    await p.click('dialog button.primary');
    assert.match(await p.locator('.form-error').innerText(), /before/i);
    await p.fill('input[name=end]', '');
    await p.click('dialog button.primary');
    assert.equal(await p.locator('dialog[open]').count(), 0);
    const saved = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).bills, KEY);
    assert.equal(saved.length, before + 1);
    assert.equal(saved.find(b => b.name === 'Storage unit').amount, 1250.5);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('delete can be undone', async () => {
    const { ctx } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    await p.click('[data-tab=bills]');
    const n = await p.locator('#app [data-action=edit][data-kind=bill]').count();
    assert.ok(n > 0);
    await p.locator('#app [data-action=edit][data-kind=bill]').first().click(); await p.click('dialog [data-action=del]');
    assert.equal(await p.locator('#app [data-action=edit][data-kind=bill]').count(), n - 1);
    await p.click('#toast [data-undo]');
    assert.equal(await p.locator('#app [data-action=edit][data-kind=bill]').count(), n);
    await ctx.close();
  });

  await run('corrupted storage falls back to the latest snapshot', async () => {
    const { ctx, errors } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    await p.reload();                                     // takes today's daily snapshot of sample data
    await p.evaluate(k => localStorage.setItem(k, '{"accounts": [oops'), KEY);
    await p.reload();
    assert.match(await p.locator('#banners').innerText(), /could not be read/i);
    assert.ok(await p.locator('.hero-main').isVisible());
    const kept = await p.evaluate(k => Object.keys(localStorage).some(x => x.startsWith(k + '.corrupt-')), KEY);
    assert.ok(kept, 'unreadable data is set aside');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('blocked storage shows a "not being saved" warning', async () => {
    const { ctx, errors } = await newCtx();
    await ctx.addInitScript(() => {
      Storage.prototype.setItem = function () { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
    });
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    assert.match(await p.locator('#banners').innerText(), /not being saved/i);
    assert.ok(await p.locator('.hero-main').isVisible());
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('old version-1 data loads and migrates', async () => {
    const { ctx, errors } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.evaluate(k => localStorage.setItem(k, JSON.stringify({
      version: 1,
      accounts: [{ id: 'a1', name: 'Checking', balance: 5000, include: true }],
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, freq: 'monthly', next: '2030-01-31', category: 'Housing', essential: true }],
      income: [], checkins: [], activity: [], settings: { cushion: 0, targetMonths: 12, horizon: 24 }
    })), KEY);
    await p.reload();
    const s = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    assert.equal(s.version, 2);
    assert.equal(s.bills[0].anchorDay, 31);
    assert.match(await p.locator('.hero-main .sub').innerText(), /runs out|beyond/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('import rejects junk and repairs a damaged backup', async () => {
    const { ctx, errors } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    const alertText = async () => { await p.waitForSelector('#alertDlg[open]'); const t = await p.locator('#alertDlg').innerText(); await p.click('#alertDlg [data-ok]'); return t; };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runway-'));
    const junk = path.join(dir, 'junk.json'); fs.writeFileSync(junk, 'not json at all');
    await p.setInputFiles('#importFile', junk);
    assert.match(await alertText(), /not a valid/i);
    const damaged = path.join(dir, 'damaged.json');
    fs.writeFileSync(damaged, JSON.stringify({
      accounts: [{ name: 'Savings', balance: '9000' }],
      bills: [{ name: 'Phone', amount: 80, freq: 'monthly', next: '2030-02-05' }, { name: 'Broken', amount: 10, next: 'never' }]
    }));
    await p.setInputFiles('#importFile', damaged);
    assert.match(await alertText(), /repaired/i);
    await p.waitForTimeout(100);
    const s = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    assert.equal(s.accounts[0].balance, 9000);
    assert.deepEqual(s.bills.map(b => b.name), ['Phone']);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('erase saves a snapshot that can be restored', async () => {
    const { ctx } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    await p.click('[data-tab=settings]');
    await p.click('[data-action=reset]');
    await p.click('#alertDlg [data-ok]');
    assert.ok(await p.locator('.welcome').isVisible());
    await p.click('[data-action=restore-latest]');
    assert.ok(await p.locator('.hero-main').isVisible());
    await ctx.close();
  });

  await run('a change in one tab shows up in another', async () => {
    const { ctx } = await newCtx();
    const a = await ctx.newPage(), b = await ctx.newPage();
    await a.goto(URL);
    await a.click('text=Explore with sample data');
    await a.click('[data-tab=bills]');
    await b.goto(URL);
    const n = await b.locator('#app [data-action=edit][data-kind=bill]').count();
    await a.locator('#app [data-action=edit][data-kind=bill]').first().click(); await a.click('dialog [data-action=del]');
    await b.waitForFunction(m => document.querySelectorAll('#app [data-action=edit][data-kind=bill]').length === m, n - 1, { timeout: 3000 });
    await ctx.close();
  });

  await run('every page renders without errors', async () => {
    const { ctx, errors } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    for (const v of ['bills', 'income', 'accounts', 'history', 'settings', 'overview']) {
      await p.click(`[data-tab=${v}]`);
      assert.equal(await p.locator(`[data-tab=${v}][aria-current=page]`).count(), 1, v);
    }
    await p.click('[data-tab=bills]');
    await p.click('[data-action=billfilter][data-f=extras]');
    assert.ok(await p.locator('#app [data-action=edit][data-kind=bill]').count() > 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('credit cards: add one, see the credit runway, pay a bill by card', async () => {
    const { ctx, errors } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    assert.match(await p.locator('.planner').first().innerText(), /\+\d+(\.\d)? months/);
    await p.click('[data-tab=accounts]');
    await p.click('button.wadd[data-type=credit]');
    assert.equal(await p.locator('dialog [name=type]').inputValue(), 'credit');
    await p.fill('dialog [name=name]', 'Store Card');
    await p.fill('dialog [name=balance]', '0');
    await p.click('dialog button.primary');
    assert.match(await p.locator('.form-error').innerText(), /credit limit/i);
    await p.fill('dialog [name=limit]', '2,000');
    await p.fill('dialog [name=apr]', '29.99%');
    await p.click('dialog button.primary');
    const card = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).accounts.find(a => a.name === 'Store Card'), 'runway-tracker.v1');
    assert.deepEqual([card.type, card.limit, card.apr], ['credit', 2000, 29.99]);
    const cash = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).accounts.filter(a => a.type !== 'credit').reduce((t, a) => t + (a.include === false ? 0 : a.balance), 0), 'runway-tracker.v1');
    await p.click('[data-tab=overview]');
    await p.locator('[data-action=settle][data-kind=bill]').first().click();
    await p.selectOption('dialog [name=acc]', { label: 'Store Card (card)' });
    const charge = Number(await p.locator('dialog [name=amount]').inputValue());
    await p.click('dialog button.primary');
    const after = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), 'runway-tracker.v1');
    assert.equal(after.accounts.find(a => a.name === 'Store Card').balance, charge, 'charge adds to what is owed');
    assert.equal(after.accounts.filter(a => a.type !== 'credit').reduce((t, a) => t + (a.include === false ? 0 : a.balance), 0), cash, 'cash untouched');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('check-in marks what already happened as done, except what you switch off', async () => {
    const { ctx, errors } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    const day = n => { const t = new Date(); t.setDate(t.getDate() + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'runway-')), 'state.json');
    fs.writeFileSync(f, JSON.stringify({
      accounts: [{ id: 'a', name: 'Checking', balance: 5000 }],
      bills: [{ id: 'g', name: 'Groceries', amount: 400, freq: 'weekly', next: day(-10) }, { id: 'w', name: 'Water', amount: 35, freq: 'monthly', next: day(-1) }],
      income: [{ id: 'u', name: 'Unemployment', amount: 425, freq: 'weekly', next: day(-3), remaining: 1416, gross: 472 }]
    }));
    await p.setInputFiles('#importFile', f);
    await p.waitForSelector('#alertDlg[open]'); await p.click('#alertDlg [data-ok]');
    await p.waitForSelector('.hero-main');
    await p.click('[data-action=checkin] >> nth=0');
    assert.match(await p.locator('#dlg').innerText(), /Already Happened/i);
    assert.match(await p.locator('#dlg').innerText(), /2 times since/);
    await p.locator('dialog [name=done_bill_w]').uncheck();               // water hasn't gone through yet
    await p.click('dialog button.primary');
    const st = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), 'runway-tracker.v1');
    const g = st.bills.find(b => b.id === 'g'), w = st.bills.find(b => b.id === 'w'), u = st.income.find(i => i.id === 'u');
    assert.equal(g.next, day(4), 'groceries moved past both missed weeks');
    assert.equal(w.next, day(-1), 'water left as is');
    assert.equal(u.next, day(4));
    assert.equal(u.remaining, 944, 'benefit balance counted down');
    assert.equal(st.activity.filter(a => a.account === 'Settled at check-in').length, 3);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('benefit balance sets the end date in the income sheet', async () => {
    const { ctx, errors } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    await p.click('[data-tab=income]');
    await p.locator('#app .list-row[data-kind=income]').first().click();
    await p.fill('dialog [name=end]', '');
    await p.fill('dialog [name=remaining]', '1200');
    await p.fill('dialog [name=gross]', '100');
    await p.click('dialog button.primary');
    assert.match(await p.locator('.form-error').innerText(), /can’t be less/);
    await p.fill('dialog [name=gross]', '600');
    await p.click('dialog button.primary');
    assert.match(await p.locator('#app').innerText(), /2 payments left of \$1,200/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('Add to Home Screen opens steps for the device and copies the link', async () => {
    const ctx = await browser.newContext({ ...require('playwright').devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    await p.click('[data-tab=settings]');
    await p.click('[data-action=homescreen]');
    const text = await p.locator('#dlg').innerText();
    assert.match(text, /IPHONE OR IPAD/i);
    assert.match(text, /Add to Home Screen/);
    assert.match(text, /claude\.ai\/artifact\//);
    await p.click('#dlg [data-action=copylink]');
    await p.waitForFunction(() => /Copied|Link selected/.test(document.querySelector('#dlg [data-action=copylink]').textContent), null, { timeout: 3000 });
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('bills can be marked paid from the Bills page and from the edit sheet', async () => {
    const { ctx, errors } = await newCtx();
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    await p.click('[data-tab=bills]');
    const before = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), 'runway-tracker.v1');
    const first = await p.locator('#app .row-pay').first().getAttribute('data-id');
    const bill = before.bills.find(b => b.id === first);
    const checking = before.accounts.find(a => a.name === 'Checking');
    await p.locator('#app .row-pay').first().click();
    assert.match(await p.locator('#dlg h3').innerText(), /Mark Paid/);
    await p.selectOption('#dlg [name=acc]', checking.id);
    await p.click('#dlg button.primary');
    const after = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), 'runway-tracker.v1');
    const moved = after.bills.find(b => b.id === first);
    assert.ok(!moved || moved.next > bill.next, 'next date moved on (or a one-time bill was removed)');
    assert.equal(after.accounts.find(a => a.id === checking.id).balance, Math.round((checking.balance - bill.amount) * 100) / 100);
    assert.ok(after.activity.some(a => a.name === bill.name && a.amount === -bill.amount));
    // from the edit sheet
    await p.locator('#app [data-action=edit][data-kind=bill]').first().click();
    await p.click('#dlg [data-action=settle]');
    assert.match(await p.locator('#dlg h3').innerText(), /Mark Paid/);
    await p.click('#dlg [data-close] >> nth=0');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  await run('phone width has no sideways scroll', async () => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.click('text=Explore with sample data');
    for (const v of ['overview', 'bills', 'income', 'accounts', 'history', 'settings']) {
      await p.click(`[data-tab=${v}]`);
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, v);
    }
    await ctx.close();
  });

  await browser.close();
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
