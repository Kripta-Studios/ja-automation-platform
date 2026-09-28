# Semi-monthly billing split: Finance and Owner browser baseline

Product candidate: `7e17795c4e763b950d8c8c5a494638262b492140`.

This run used actual Playwright Chromium and a fresh disposable SQLite fixture. Owner created a synthetic project through the rendered Projects form. Finance and Owner then used the rendered Billing → Configure billing → Stream form, with an existing disposable client and active invoice issuer matching the project's USD currency. Both selected **Semi-monthly** cadence and entered `1_14_15_end` as the split. No production account, database, or deployment was used. The fixture was removed when Playwright exited.

## Observed failure

The form accepts the unsupported split as free text. The repository rejects it with `ValidationError('Semi-monthly split is invalid')`, but the action returns `ACTION_ERROR_INVALID` / `action.error.invalid`, no field errors, and no remedy. The response gives no supported split choices. The repository accepts `1_15_16_end`, `1_15`, and `16_end`.

| Role and viewport                                  | Network response                                                                                 | Visible result and retention                                                                                                                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finance, 390 × 844, English, enhanced form         | HTTP **200** JSON action envelope `type: failure`, action status **400**, `ACTION_ERROR_INVALID` | “Check the submitted values and try again.” No remedy or field error. The stream form stays open, with project, issuer, cadence, invalid split, date, and payment terms retained. The notice receives keyboard focus at y=381. Scroll changes from 1815 to 940, bringing the notice into view. |
| Owner, 1440 × 900, Spanish, native form submission | HTTP **400** HTML, `ACTION_ERROR_INVALID`                                                        | “Los datos no son válidos.” No remedy or field error. The stream form stays open with the same entries retained, and the notice receives focus at y=218. Scroll remains 650. The native POST URL no longer has `view=setup`, but the failed form is still shown.                               |

The synthetic project has **zero** billing rules after each attempt. Both browser pages had no page exceptions or console errors. Server logs confirmed the unmapped `Semi-monthly split is invalid` validation exception. The test stored no credentials or raw request payloads; screenshots are cropped to the notice.

## Evidence

- [`results.json`](results.json) contains sanitized status, code, wording, remedy, retained values, focus/scroll, no-save check, and console diagnostics.
- [`finance-phone-390-en-notice.png`](finance-phone-390-en-notice.png) and [`owner-desktop-1440-es-notice.png`](owner-desktop-1440-es-notice.png) show cropped, redacted notices.
- [`baseline.spec.ts`](baseline.spec.ts) and [`playwright.config.ts`](playwright.config.ts) reproduce the run with a fresh disposable fixture. Run from this worktree with `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test --config docs/evidence/error-warning-candidate/billing-semi-monthly-rule-baseline-browser/playwright.config.ts --workers=1`.

The candidate browser run passed **1/1**. Port 4174 and the disposable fixture pointer/lock were clear after Playwright exited.
