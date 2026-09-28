# Time correction final browser check

Candidate: `d7abf93` (built once). Disposable local database and portal preview; no production data or traffic. All actions below were real browser submissions through the app, with no intercepted responses. The fixture seeded only prerequisite QA project and Worker assignment; the Worker created and submitted the original time entry through the UI, and Owner approved it through the UI. Run: `3 passed` in 34.8 seconds.

| Browser | Roles | Native form checks | Result |
| --- | --- | --- | --- |
| 390 × 844, English | Worker, Owner | Empty activity summary + reason; whitespace reason; corrected date outside assignment; valid correction; open correction link | Passed, with Worker mapping defect below |
| 1440 × 900, Spanish | Worker, Owner | Same | Passed, with Worker mapping defect below |
| 430 × 932, Portuguese | Worker, Owner | Same | Passed, with Worker mapping defect below |

## What the browser showed

- Two empty required fields were blocked by native form validation before any POST. The form displayed two inline errors and a summary with two keyboard-accessible field links in each language.
- A three-space correction reason reached the server. The native POST returned **400**; the notice code was `TIME_CORRECTION_REASON_INVALID`, with a localized inline reason error and remedy. The entered activity summary and exact reason remained. The problem notice received focus and remained between the fixed header and phone navigation; there was no horizontal overflow.
- An Owner's corrected date outside the Worker's active assignment returned **409** and `TIME_CORRECTION_DATE_ASSIGNMENT_REQUIRED`. The date field had `aria-invalid=true` and a localized inline error. The submitted date, summary and reason remained; the notice had focus and was visible at all three widths.
- A Worker's same corrected date returned **403** and `REPORT_ASSIGNMENT_REQUIRED`. The entered date, summary and reason remained and the notice had visible focus. The text described a *report date*, although this was a time correction; the date field had no inline error. This is a confirmed, reachable correction-specific mapping gap for the Worker role. A suitable code is `TIME_CORRECTION_ASSIGNMENT_ACCESS_CHANGED` with wording that the Worker lacks project assignment access for the corrected date and a role-safe contact-owner remedy. Because it is an access denial, the form should not suggest the date itself is malformed.
- After an Owner created a permitted correction through the UI (**303**), Worker and Owner each saw exactly one localized **Open existing correction** link on the approved original. Both links opened the correction detail with `lang` preserved. The correction detail showed Draft. No browser page errors or console exceptions were recorded.

Single-field server errors produced summary text and inline errors; the shared validator only creates linked summary items when multiple fields fail. This matches the requested multiple-field link rule.

The network statuses above are from actual POST responses. Problem codes are the rendered `data-problem-code` values after native submission; the test does not parse raw HTML response bodies. Focus and viewport bounds, retained values, localized wording, route, and console results are in the redacted files under `baseline-d7abf93/`. Cropped images show only the notices. Generated fixture identifiers were replaced with `[qa-id]` in the JSON evidence.

To rerun this candidate spec with the disposable harness: `pnpm exec playwright test --config docs/evidence/error-warning-candidate/time-correction-final-browser/playwright.config.ts`. The portal build is required before the preview server starts.

## Corrected candidate retest

Candidate: `3bd5ecf` (one portal rebuild). The same disposable UI workflow passed at 390 × 844 English, 1440 × 900 Spanish, and 430 × 932 Portuguese: **3 passed** in 35.2 seconds. Each run again used actual Worker and Owner native form submissions, with no request interception.

The Worker corrected-date POST now returns **403** with `TIME_CORRECTION_CORRECTED_DATE_ACCESS_REQUIRED`. In each language, the notice names the corrected work date and offers a role-safe contact-owner remedy. The `workDate` control has `aria-invalid=true` and a localized inline explanation; the submitted date, activity summary and reason remain. The notice receives focus within the safe visible area, and the form has no horizontal overflow. The previous report-date wording is absent. Owner still receives **409** `TIME_CORRECTION_DATE_ASSIGNMENT_REQUIRED` with its inline date guidance. The reason-invalid **400**, permitted correction **303**, and unique locale-preserving correction links for both roles also passed. No page errors or console exceptions were recorded.

The fixed-candidate redacted `*results.json` files and cropped notice images are in this directory. The earlier `d7abf93` artifacts remain in `baseline-d7abf93/` for before/after comparison. The test spec now asserts the Worker code, wording, inline field error, retention, focus and viewport safety.
