# Error and warning browser accessibility audit

Date: 2026-09-26. Candidate: isolated source snapshot on `codex/error-warning-release-candidate-20260926` before commit. All interactions used the Playwright disposable SQLite fixture and local Chromium at 390 px and 1440 px. Production customer data was not changed.

## Focused error states

Command:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/error-warning-accessibility-browser.spec.ts --project=phone-390 --project=desktop --reporter=line
```

The initial combined run passed Owner changed-management notices at both widths. The Supplier Coordinator daily-limit notices exposed two defects: the field summary displayed a literal `{technicianName}` placeholder and its error text had 4.27:1 contrast (`#dc2626` on `#fceeee`), below the automated WCAG AA 4.5:1 check. The candidate was corrected in `form-validation.ts`, the Supplier route, and `primitives.css`.

The post-fix focused Supplier rerun used `--grep 'Supplier coordinator daily-limit'` and passed **2 tests**, with 2 expected viewport skips. It checked the 400 `SUPPLIER_BATCH_TECHNICIAN_DAILY_LIMIT` response, the visible notice and remedy, retained form values and selected tab, focus on `workDate`, the focused field inside the viewport, absence of the literal placeholder, and a full-page axe scan with **zero violations** at each width. The Owner cases had already passed the same axe scan, with the `ACTION_MANAGEMENT_CHANGED` 409 notice focused, its remedy visible, exactly one visible assertive problem alert, retained reason, and notice inside the viewport. No unexpected page or console errors occurred in these focused tests; the intentionally disabled offline identity endpoint can emit a resource-load 503 outside these assertions.

That `workDate` focus describes the earlier correction. The final Supplier
batch recovery now focuses the in-form problem notice and centers it within
the viewport. The final 390/1440 focused rerun below passed with that new
focus target; its paired JSON and masked notice crops were refreshed.

Each PNG is an isolated notice screenshot. The Supplier message paragraph is masked because it can contain a synthetic technician name. Sticky account chrome was removed only after focus, viewport, and axe checks, so the screenshot captures the complete notice without account details. Paired JSON records only code, viewport, response status, focus target, axe rule count, and screenshot name. No cookies, tokens, raw request bodies, customer records, or Playwright trace archives are in this directory.

## Five-role surface matrix

The existing `ui-multirole-accessibility-matrix.spec.ts` scanned Worker, Manager, Finance, Owner, and Auditor surfaces (23 routes per viewport, 46 route/viewport checks) for axe WCAG A/AA, horizontal overflow, interactive clipping, keyboard focus, touch targets on the phone, and reduced motion. Its first run reached the final runtime-diagnostics assertion in all 10 role/viewport cases without an axe or layout failure. Those assertions failed solely because this disposable Playwright server sets `JA_OFFLINE_ENABLED=false`, causing `/app/api/offline/identity` to return 503 and Chromium to log a resource-load error on navigation. The raw diagnostics remain in Playwright's local `test-results` directory, outside this sanitized evidence folder. A narrow fixture-only filter for that exact endpoint/status was added to the matrix; the filtered rerun result is recorded below.

Filtered rerun command:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/ui-multirole-accessibility-matrix.spec.ts --project=phone-390 --project=desktop --reporter=dot
```

Result: **10 passed, 0 failed in 3.0 minutes**. All 46 route/viewport scans passed axe, layout, focus, touch-target and reduced-motion checks. The filter applies only to the documented fixture response for `/app/api/offline/identity` and its paired Chromium resource-load console event; other response, console, page, and request failures still fail the matrix.

## Additional release widths: 360 and 768 px

On 2026-09-26, the isolated candidate was checked at the repository's other two required widths, `phone-360` and `tablet-768`. The first run passed all five tablet role cases but found the same header overflow in all five phone role cases: with mobile navigation open, the account button rounded to a 361 px right edge on a 360 px viewport. No other axe, route, or layout defect appeared in that diagnostic run.

The first source adjustment reduced the header gap from 2 px to 0 at widths up to 400 px. The matrix then passed 10/10, but a stricter bounding-rectangle probe found a residual account-button edge at 360.21875 px. A 3 px header padding adjustment alone still allowed the account wrapper to shrink below its 44 px child when header content varied: one probe read 360.890625 px. The final source correction gives `.account-menu-wrap` a 44 px non-shrinking flex basis and minimum width. On the rebuilt candidate, the strict probe measured the account button at **313–357 px, width 44 px**, and the header `scrollWidth` at **360 px** on a 360 px viewport. These probes were local diagnostics; their traces and temporary test file are excluded from release evidence.

Post-fix command:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/ui-multirole-accessibility-matrix.spec.ts --project=phone-360 --project=tablet-768 --reporter=dot
```

The final post-fix matrix passed **10/10 role/viewport cases in 3.1 minutes**, covering 46 route/viewport scans with open-navigation layout, axe, focus, 44 px phone touch targets, clipping, reduced motion, and runtime diagnostics. The strict 360 px account-edge probe also passed; the combined run reported 11 passes and one intentional tablet skip for that phone-only probe. The earlier five phone failures and intermediate tolerance passes are retained here as diagnostics and are not counted as final evidence. The Playwright fixture, local Chromium, and narrow offline-identity fixture filter were the same as in the 390/1440 matrix.

## Final 390 and 1440 px rerun after late source sync

The exact candidate after the Owner issuer, Supplier batch, and login guidance
changes passed the combined focused-notice and five-role matrix run on
2026-09-26: **14/14 active cases**, four intentional cross-project skips,
3.3 minutes, exit 0. The focused Owner and Supplier notice cases contributed
4 passes; Worker, Manager, Finance, Owner, and Auditor each contributed a
phone and desktop matrix pass (10 total). This run reused the disposable
fixture and the exact offline-identity filter described above.

```sh
pnpm exec playwright test tests/e2e/error-warning-accessibility-browser.spec.ts tests/e2e/ui-multirole-accessibility-matrix.spec.ts --project=phone-390 --project=desktop --reporter=line
```

The earlier 360/768 results remain valid for the unchanged header layout;
the final rerun certifies the two widths affected by the late Supplier and
billing form changes. No raw trace or full-page screenshot from this run is
staged.
