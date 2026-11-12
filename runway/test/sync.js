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
  const me = window.__who || { id: 'u_test', editor: true };
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
  const privateRef = { get: async () => { const j = await window.__privateGet(me.id); return { exists: !!j, data: () => (j ? JSON.parse(j) : undefined), metadata: { fromCache: false, hasPendingWrites: false } }; } };
  const db = { doc: p => {
    if (p === 'household/runway') { if (!me.editor) throw new Error('page must not touch the household record without edit access'); return ref; }
    if (p === `data/users/${me.id}/runway`) return privateRef;
    throw new TypeError('bad path ' + p);
  } };
  const names = { u_test: 'Erron', u_wife: 'Jordan' };
  const user = { id: async () => me.id, canEdit: async () => me.editor, profiles: async ids => Object.fromEntries(ids.map(i => [i, { id: i, name: names[i] || '' }])) };
  window.claude = { use: name => Promise.resolve(name === 'db' ? db : name === 'user' ? user : null) };
};

(async () => {
  const browser = await chromium.launch();
  let cloud = null;                     // the shared store: one JSON body
  const pages = new Set();
  const privateDocs = {};
  const device = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    if (who) await ctx.addInitScript(w => { window.__who = w; }, who);
    await ctx.exposeFunction('__privateGet', id => privateDocs[id] || null);
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
    await B.p.locator('#app [data-action=edit][data-kind=bill]').first().click(); await B.p.click('dialog [data-action=del]');
    await B.p.waitForTimeout(1200);
    assert.equal(stored().state.bills.length, 13);
    await A.p.waitForFunction(() => document.querySelector('#toast') && /other device/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
    assert.equal(await A.p.evaluate(k => JSON.parse(localStorage.getItem(k)).bills.length, 'runway-tracker.v1'), 13);
  });

  await run('editing with a sheet open waits, then applies the newer copy', async () => {
    await A.p.click('[data-tab=bills]');
    await A.p.locator('#app [data-action=edit][data-kind=bill]').first().click();       // sheet open on A
    await B.p.locator('#app [data-action=edit][data-kind=bill]').first().click(); await B.p.click('dialog [data-action=del]');
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
    await B.p.locator('#app [data-action=edit][data-kind=bill]').first().click(); await B.p.click('dialog [data-action=del]');
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

  await run('a change by your wife shows who made it', async () => {
    const W = await device({ id: 'u_wife', editor: true });
    await W.p.goto(URL);
    await waitStatus(W.p, 'Synced');
    await W.p.click('[data-tab=bills]');
    await W.p.locator('#app [data-action=edit][data-kind=bill]').first().click(); await W.p.click('dialog [data-action=del]');
    await W.p.waitForTimeout(1200);
    assert.equal(stored().by, 'u_wife');
    await A.p.waitForFunction(() => /Updated by Jordan/.test(document.querySelector('#toast').textContent), null, { timeout: 5000 });
    await W.ctx.close();
  });

  await run('someone without edit access never sees the household data', async () => {
    const V = await device({ id: 'u_viewer', editor: false });
    await V.p.goto(URL);
    await waitStatus(V.p, 'Not shared with you');
    assert.match(await V.p.locator('#banners').innerText(), /isn’t shared with you/);
    assert.ok(await V.p.locator('.welcome').isVisible(), 'empty local tracker, no household data');
    assert.deepEqual(V.errors, []);
    await V.ctx.close();
  });

  await run('data saved privately before sharing moves into the household record', async () => {
    await A.ctx.close(); await B.ctx.close();             // other household devices hold newer data and would rightly win
    cloud = null;
    privateDocs.u_new = JSON.stringify({ v: 1, updatedAt: 1000, device: 'old', state: { accounts: [{ name: 'Old savings', balance: 777 }], bills: [], income: [] } });
    const N = await device({ id: 'u_new', editor: true });
    await N.p.goto(URL);
    await N.p.waitForSelector('.hero-main', { timeout: 5000 });
    await N.p.waitForTimeout(1200);
    assert.equal(stored().state.accounts[0].name, 'Old savings');
    await N.ctx.close();
  });

  await browser.close();
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
