# Post-cutover deployed operational views, 2026-09-24

Release: `zip-d215671b99323d6d8c4ce34b74b4f8e0`. Origin: `https://j-aautomation.com`.
Authenticated owner storage state; no business records were written by this check.

`tests/production/clean-slate-views.acceptance.spec.ts` passed **3/3** on desktop Chromium, iPhone-sized WebKit (390 px) and iPad-sized WebKit (768 px). Each browser loaded and reloaded Time, Expenses, Reports, Finance and Billing from the public origin. The expected empty-state text was visible, each response was HTTP 200, there was no horizontal overflow, and no page errors remained when navigation waited for network idle. Portal `/j-aautomation/app/api/health` returned HTTP 200; the portal container became healthy after restart.

The first WebKit run moved between pages while their requests were still in flight. It recorded `TypeError: Load failed` on navigation, although every view rendered and reloaded. The test now waits for the page to finish network activity before moving on; the complete rerun passed. This initial result is retained as a test-timing failure, not counted as a product pass.

The separate owner create/delete and role checks are recorded in `clean-slate-live-browser.md` and `clean-slate-live-roles.md`. This check did not test native Safari on a physical device or new finance writes after cleanup.
