# Runway Tracker

A personal finance tracker for when you're between jobs. It shows your bills, the money still coming in, and your **runway**: how long your cash lasts.

## Open it

**On any device:** open the private claude.ai page at https://claude.ai/artifact/WAduFqicBoRPJeEwuvM7ci while signed in to claude.ai. Only you can open it.

- **Sync:** your data is stored privately under your Claude account and syncs to every device where you open the page. Nobody else who has the link can see your data.
- **Home screen:** on iPhone or iPad, open the page in Safari, tap Share, then Add to Home Screen. On Android, use Chrome's menu, then Add to Home screen.
- **Status:** the sidebar (and the date line at the top) shows Synced, Syncing…, or Offline · saved here. Changes made offline sync when the connection returns.
- **Conflicts:** the most recent change wins. If this device had unsynced changes when a newer copy arrived, they are kept as a snapshot you can restore from Settings.

**As a local file:** open `runway/index.html` in a browser, with `core.js` and `app.js` in the same folder. Data then stays in that browser only.

## What it does

The app is dark-only, designed in the style of Apple's own apps, with the system font (San Francisco on Apple devices) and Apple's dark color palette. A sidebar holds six pages: **Summary** (runway with a progress ring toward your goal, key numbers, what needs attention, the projection chart, the next 30 days, your goal and spending by category), **Bills**, **Income**, **Accounts** (shown as Wallet-style cards), **History** and **Settings**. On a phone the sidebar becomes a bottom tab bar, and add/edit forms open as sheets.


- **Runway**: projects your balance day by day from your actual bill due dates and income dates, and tells you when cash drops below your safety cushion.
- **Essentials-only runway**: mark bills as essential to see how long you'd last on a bare-bones budget.
- **Income that ends**: give unemployment benefits, severance or a short freelance contract an end date. The projection stops counting it after that date and warns you 60 days ahead.
- **Next 30 days**: everything due, with your balance after each item. Click **Paid** or **Received** to update the account balance and move the item to its next date, or **Skip** to move it without touching balances.
- **Credit backstop**: add credit cards (amount owed, limit, APR) and mark the bills a card can pay. Runway shows a second runway with credit: card-eligible bills go on the cheapest card with room, starting as late as possible while still reaching the longest runway, so interest stays low. Interest and minimum payments (1% of the balance plus interest, at least $25) are charged monthly and come out of cash. Only part of each limit is counted (80% by default, set in Settings), since card companies can cut limits without notice. Cards never count as cash.
- **Runway goal**: pick a target (say 12 months) and see how much extra income or spending cuts per month you'd need to get there.
- **Balance check-ins**: once a week, enter what your accounts show. The chart plots your real balance next to the projection.
- **Where the money goes**: monthly spending by category.

## Keeping your data safe

Data lives only in the browser you use, so the app protects it in layers:

- **Daily snapshots.** Each day you open the app, a copy is saved in the browser (the last 14 are kept). One is also saved before any erase, import, sample-data load or restore. Restore any of them from **Settings & backups**.
- **Undo.** Deleting, skipping, marking paid, importing and erasing all show an **Undo** button for 10 seconds.
- **Exported backups.** **Export backup** downloads a JSON file, the only copy that survives clearing your browser. The app reminds you if your last export is more than 14 days old. **Import** restores it on any computer.
- **Recovery.** If saved data gets corrupted, the app restores the newest readable snapshot and sets the bad data aside instead of deleting it. If the browser blocks storage (a private window, or a full disk), a red banner says changes aren't being saved.
- **Validation.** Forms reject bad amounts and dates. Imported or old-format files are checked and repaired, and the app lists what it fixed.
- **Multiple tabs.** A change in one tab shows up in the others, so an old tab can't overwrite newer data.

## Development

- `core.js`: all date and projection math, with no browser code, so it can be tested.
- `app.js`: the interface, storage and backups.
- `npm test` runs the unit tests in `test/core.test.js`: date edge cases (month ends, leap years, daylight saving), runway math, data repair.
- `npm run test:e2e` runs the browser tests in `test/e2e.js`. These need Playwright and Chromium.
- `npm run test:sync` runs the sync tests in `test/sync.js`: several simulated devices share a stand-in for claude.ai's storage.
- `python3 tools/build-artifact.py` builds `dist/index.html`, the version published to claude.ai (it carries no doctype or `<head>`, because claude.ai adds its own). Publish it with `core.js` and `app.js` alongside.
