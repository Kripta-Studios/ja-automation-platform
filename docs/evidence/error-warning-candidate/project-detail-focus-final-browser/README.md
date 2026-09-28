# Project Detail enhanced period correction recheck

- Frozen product commit: `8676c831fa0347c16d2873324bf2bbc3e7c9a56c` (focus fix `07883ec`).
- Actual Chromium, Owner English, 390 px, disposable E2E database at local port 4174, 2026-09-27. No production writes.
- Run: `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test --config docs/evidence/error-warning-candidate/project-detail-focus-final-browser/playwright.config.ts`.

The Owner opened a reversed Project Detail finance period on the Commercial tab, changed the end date to another reversed date, and submitted the rendered correction form from scrollY 300. The URL, tab, locale, entered dates, typed `PROJECT_DETAIL_PERIOD_RANGE_REVERSED` problem, adjacent field error, and hidden finance projection were retained. The resulting scrollY was 324; the notice top/bottom were 394/523 px, clear of the 70 px sticky header and fully inside the 844 px phone viewport. Focus was transiently elsewhere at the immediate sample, then on the notice by +50 ms and stayed there through +1000 ms. Correcting the date cleared the problem and restored the finance projection. Audit count stayed 331; there were no page exceptions or unexpected console errors.

`owner-enhanced-fixed.png` shows the redacted viewport. `results.json` contains the focus/scroll timeline and network status categories, without credentials or finance amounts.
