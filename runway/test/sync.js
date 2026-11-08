/*
 * Sync tests: several browser contexts ("devices") share one fake copy of the
 * claude.ai document store, so we can check upload, download, live updates,
 * conflict snapshots and offline handling without the real platform.
 *   npm run test:sync
 */
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const results = [];
async function run(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log('ok -', name); }
  catch (e) { results.push(['FAIL', name]); console.log('FAIL -', name, '\n ', e.message); }
}

/* The fake platform, injected before the app loads. */
const MOCK = () => {
  const subs = [];
  window.__cloudNotify = json => { const body = json ? JSON.parse(json) : null; subs.forEach(fn => fn(body)); };
  const snap = body => ({ id: 'runway', exists: !!body, data: () => body || undefined, metadata: { fromCache: false, hasPendingWrites: false } });
  const ref = {
    async set(body) {
      if (window.__failWrites) { const e = new Error('down'); e.code = 'unavailable'; throw e; }
      await window.__cloudSet(JSON.stringify(body));
    },
    onSnapshot(next) {
      subs.push(b => next(snap(b)));
      window.__cloudGet().then(json => next(snap(json ? JSON.parse(json) : null)));
      return () => {};
    }
  };
  const db = { doc: p => { if (p !== 'data/users/u_test/runway') throw new TypeError('bad path ' + p); return ref; } };
  const user = { id: async () => 'u_test' };
  window.claude = { use: name => Promise.resolve(name === 'db' ? db : name === 'user' ? user : null) };
};

(async () => {
  const browser = await chromium.launch();
  let cloud = null;                     // the shared store: one JSON body
  const pages = new Set();
  const device = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    await ctx.exposeFunction('__cloudGet', () => cloud);
    await ctx.exposeFunction('__cloudSet', async json => {
      cloud = json;
      await Promise.all([...pages].map(p => p.evaluate(j => window.__cloudNotify(j), json).catch(() => {})));
    });
    await ctx.addInitScript(MOCK);
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    pages.add(p);
    p.on('close', () => pages.delete(p));
    return { ctx, p, errors };
  };
  const stored = () => JSON.parse(cloud);
  const waitStatus = (p, text) => p.waitForFunction(t => (document.getElementById('syncNote') || {}).textContent === t, text, { timeout: 5000 });

  let A, B;
  await run('first device uploads its data', async () => {
    A = await device();
    await A.p.goto(URL);
    await waitStatus(A.p, 'Synced');
    assert.equal(cloud, null, 'nothing uploaded for an empty app');
    await A.p.click('text=Explore with sample data');
    await A.p.waitForFunction(() => document.getElementById('syncNote').textContent === 'Synced');
    await A.p.waitForTimeout(900);
    assert.equal(stored().state.bills.length, 14);
    assert.equal(stored().v, 1);
    assert.deepEqual(A.errors, []);
  });

  await run('a new device downloads the synced data', async () => {
    B = await device();
    await B.p.goto(URL);
    await B.p.waitForSelector('.hero-main', { timeout: 5000 });
    await waitStatus(B.p, 'Synced');
    assert.equal(await B.p.evaluate(k => JSON.parse(localStorage.getItem(k)).bills.length, 'runway-tracker.v1'), 14);
  });

  await run('a change on one device shows up on the other', async () => {
    await B.p.click('[data-tab=bills]');
    await B.p.locator('button[data-action=del][data-kind=bill]').first().click();
    await B.p.waitForTimeout(1200);
    assert.equal(stored().state.bills.length, 13);
    await A.p.waitForFunction(() => document.querySelector('#toast') && /other device/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
    assert.equal(await A.p.evaluate(k => JSON.parse(localStorage.getItem(k)).bills.length, 'runway-tracker.v1'), 13);
  });

  await run('editing with a sheet open waits, then applies the newer copy', async () => {
    await A.p.click('[data-tab=bills]');
    await A.p.locator('.list-row[data-kind=bill]').first().click();       // sheet open on A
    await B.p.locator('button[data-action=del][data-kind=bill]').first().click();
    await B.p.waitForTimeout(1200);
    assert.equal(stored().state.bills.length, 12);
    assert.equal(await A.p.evaluate(k => JSON.parse(localStorage.getItem(k)).bills.length, 'runway-tracker.v1'), 13, 'not applied while editing');
    await A.p.click('dialog [data-close] >> nth=0');
    await A.p.waitForFunction(k => JSON.parse(localStorage.getItem(k)).bills.length === 12, 'runway-tracker.v1', { timeout: 5000 });
  });

  await run('older local data is snapshotted before the synced copy replaces it', async () => {
    const C = await device();
    await C.ctx.addInitScript(() => {
      if (localStorage.getItem('runway-tracker.v1')) return;
      localStorage.setItem('runway-tracker.v1', JSON.stringify({ accounts: [{ id: 'x', name: 'Old laptop account', balance: 5 }], bills: [], income: [] }));
    });
    await C.p.goto(URL);
    await waitStatus(C.p, 'Synced');
    const local = await C.p.evaluate(k => JSON.parse(localStorage.getItem(k)), 'runway-tracker.v1');
    assert.equal(local.bills.length, 12, 'synced copy adopted');
    const snaps = await C.p.evaluate(() => JSON.parse(localStorage.getItem('runway-tracker.v1.snapshots') || '[]'));
    assert.ok(snaps.some(s => s.label === 'Before sync' && s.data.accounts[0].name === 'Old laptop account'), 'old data kept as a snapshot');
    assert.deepEqual(C.errors, []);
    await C.ctx.close();
  });

  await run('a failed write shows offline, then syncs when it can', async () => {
    await B.p.evaluate(() => { window.__failWrites = true; });
    await B.p.locator('button[data-action=del][data-kind=bill]').first().click();
    await waitStatus(B.p, 'Offline · saved here');
    assert.equal(stored().state.bills.length, 12, 'cloud unchanged while offline');
    await B.p.evaluate(() => { window.__failWrites = false; window.dispatchEvent(new Event('online')); });
    await waitStatus(B.p, 'Synced');
    assert.equal(stored().state.bills.length, 11);
  });

  await run('erase asks first, in an in-app alert', async () => {
    await B.p.click('[data-tab=settings]');
    await B.p.click('[data-action=reset]');
    assert.match(await B.p.locator('#alertDlg').innerText(), /every synced device/);
    await B.p.click('#alertDlg [data-r="0"]');                            // Cancel
    await B.p.waitForTimeout(900);
    assert.equal(stored().state.bills.length, 11, 'cancel changed nothing');
  });

  await browser.close();
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
