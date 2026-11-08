# Runway Tracker

A personal finance tracker for when you're between jobs. It shows your bills, the money still coming in, and your **runway**: how long your cash lasts.

## Run it

Open `runway/index.html` in any browser. There's nothing to install and no server. Keep `index.html`, `core.js` and `app.js` in the same folder. All data stays in that browser's local storage.

Click **Explore with sample data** to try it out, then **Settings → Erase all data** when you're ready to enter your own numbers.

## What it does

The app has a sidebar with six pages: **Overview** (runway, key numbers, what needs attention, the projection chart, the next 30 days, your runway goal), **Bills & expenses**, **Income**, **Accounts**, **History** and **Settings**. It follows your system's light or dark mode, and the moon/sun button switches it.


- **Runway**: projects your balance day by day from your actual bill due dates and income dates, and tells you when cash drops below your safety cushion.
- **Essentials-only runway**: mark bills as essential to see how long you'd last on a bare-bones budget.
- **Income that ends**: give unemployment benefits, severance or a short freelance contract an end date. The projection stops counting it after that date and warns you 60 days ahead.
- **Next 30 days**: everything due, with your balance after each item. Click **Paid** or **Received** to update the account balance and move the item to its next date, or **Skip** to move it without touching balances.
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
