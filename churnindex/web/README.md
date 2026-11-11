# ChurnIndex marketing site (Phase 1)

The homepage, built from the design mock in React, TypeScript, Vite and
Tailwind (the stack in brief section 6). Lovable can open and edit it.

## Run it

```bash
npm install
npm run dev     # opens a local preview, usually http://localhost:5173
npm test        # calculator math tests
npm run build   # production build into dist/
```

## Where to change things

| To change | Edit |
|---|---|
| Brand name, prices, calculator assumptions, guarantee on or off | `src/config.ts` |
| Colors and fonts | `tailwind.config.ts` |
| Hero, nav, compatibility strip | `src/sections/Hero.tsx` |
| Leaks, calculator, how it works, the index, share card | `src/sections/Product.tsx` |
| Autopilot, comparison table, report signup, pricing | `src/sections/Plans.tsx` |
| Founder, security, FAQ, final CTA, footer | `src/sections/Company.tsx` |

## Differences from the mock (on purpose)

1. **SMS marked "coming soon".** The mock lists SMS under Autopilot and in the
   comparison table. Per the brief, SMS is a Phase 4 Growth feature, so
   Autopilot copy says email, and Growth's Phase 4 features carry a
   "Coming soon" tag.
2. **Win-back sequences** carry a "Coming soon" tag on the Autopilot feature
   card for the same reason.
3. **Nav** hides the four section links on phones to keep the header to two rows.

## Not connected yet

- **Sign-up.** Every "Get my free scorecard" button points to `#connect`
  (the final CTA). Change `SIGNUP_HREF` in `src/config.ts` once Supabase
  Auth exists.
- **Report signup form.** It stores nothing and tells the visitor so. It gets
  wired to beehiiv later.
- **Analytics.** `src/lib/analytics.ts` fires `homepage_viewed`,
  `calculator_used` and `signup_started` with the CTA location, but only
  prints them in the browser console until PostHog is set up.
- **Privacy and Terms** links are placeholders.

## Needs Erron before launch

- Founder photo (brief section 14, item 5).
- Keep or drop the 60-day guarantee (`SHOW_GUARANTEE` in `src/config.ts`).
- Verify the comparison-table claims about competitors (section 14, item 6).
