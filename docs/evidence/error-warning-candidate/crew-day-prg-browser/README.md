# Crew filter refresh: independent Chromium rerun

Candidate commit: `0c3934c`. Date: 2026-09-27. This run used a disposable SQLite database and local SvelteKit preview on port 4175. The Owner granted and revoked the sole Crew delegation through the browser UI in each test. No production records were changed.

Three focused tests passed: Chief at 390 px with JavaScript, Chief at 1440 px with JavaScript, and Chief at 390 px with JavaScript disabled. The no-JavaScript browser reused a Chief session created through the normal login UI; its Crew form was submitted without client JavaScript. The Chief had a valid Crew page open when the Owner revoked the delegation. An unchanged **Show project** submission then produced document POST 303 followed by document GET 200 in all three cases. The resulting page showed `CREW_DAY_PROJECT_UNAVAILABLE_CHIEF`, a translated Portuguese contact-owner remedy, the selected project as a disabled unavailable option, the retained date, and no Crew rows or controls. The disposable database confirmed the only Chief/project grant was `revoked`. Blocked filter requests added no audit events; page and console exception lists were empty.

With JavaScript enabled, the notice gained keyboard focus and stayed visible below the sticky header: top/bottom 246/436 px in the 390 × 844 viewport and 256/365 px in the 1440 × 900 viewport. The form submitted `viewportScrollY=300`; the page adjusted scroll to 34 px on phone and 0 px on desktop to reveal the focused notice. With JavaScript disabled, the server-rendered notice was visible at 280–470 px, but focus remained on the browser body and scroll returned to 0. The response shape and remedy were the same. This no-JavaScript focus limitation is recorded for accessibility follow-up.

The JSON results redact email addresses and record UUIDs. Screenshots contain only disposable demo fixture names. The Playwright spec reproduces the full Owner grant → Chief open → Owner revoke → unchanged Chief submit path. The config builds and starts an isolated preview; for the second and third runs, the same already-built preview was reused to avoid extra builds.

```sh
pnpm exec playwright test -c docs/evidence/error-warning-candidate/crew-day-prg-browser/playwright.config.ts -g 'Chief'
```
