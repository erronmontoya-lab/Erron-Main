# Runway Tracker

A personal finance tracker for when you're between jobs. It shows your bills, the money still coming in, and your **runway**: how long your cash lasts.

## Run it

Open `runway/index.html` in any browser. There's nothing to install and no server. All data stays in that browser's local storage.

Click **Explore with sample data** to try it out, then **Settings → Erase all data** when you're ready to enter your own numbers.

## What it does

- **Runway**: projects your balance day by day from your actual bill due dates and income dates, and tells you when cash drops below your safety cushion.
- **Essentials-only runway**: mark bills as essential to see how long you'd last on a bare-bones budget.
- **Income that ends**: give unemployment benefits, severance or a short freelance contract an end date. The projection stops counting it after that date and warns you 60 days ahead.
- **Next 30 days**: everything due, with your balance after each item. Click **Paid** or **Received** to update the account balance and move the item to its next date, or **Skip** to move it without touching balances.
- **Runway goal**: pick a target (say 12 months) and see how much extra income or spending cuts per month you'd need to get there.
- **Balance check-ins**: once a week, enter what your accounts show. The chart plots your real balance next to the projection.
- **Where the money goes**: monthly spending by category.

## Back up your data

Data lives only in the browser you use. Click **Export backup** now and then to download a JSON file. **Import** restores it, for example on another computer.
