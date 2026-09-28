# Report Review deployed filter baseline

- Captured 2026-09-27 in actual headless Chromium against deployed `https://j-aautomation.com/j-aautomation/app`.
- Finance English at 390 px and Auditor Spanish at 1440 px signed in through the rendered page. Finance selected a project from Report Review's rendered picker, used direct GET links and submitted the rendered GET period form. No report or follow-up record was changed. Credentials were read at runtime from the private test-account file and are absent from evidence.
- Reproduce with `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH node docs/evidence/error-warning-candidate/report-review-production-baseline/production-readonly.mjs`.

Finance could open a valid project period (HTTP 200). An impossible date and a reversed period returned HTTP 400 generic full-page “The action could not be completed. Try again shortly,” losing the picker, entered dates, focus, and review context. Submitting reversed dates through the rendered form reached the same generic error via enhanced navigation. A duplicate `from` parameter returned HTTP 200 while silently using the first value. An unavailable project ID also returned HTTP 200 with the picker blank and no warning.

Auditor received HTTP 403 for the base page and every valid or malformed period link, so production already checks this role before filter validation. No JavaScript page exceptions occurred. Redacted DOM/network statuses are in `production-results.json`; no report contents or financial figures were saved.
