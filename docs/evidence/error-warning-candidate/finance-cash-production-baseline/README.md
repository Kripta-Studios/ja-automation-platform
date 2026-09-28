# Finance Cash deployed browser baseline

- Captured: 2026-09-27, deployed `https://j-aautomation.com/j-aautomation/app`.
- Method: actual headless Chromium, rendered sign-in and GET navigation only. No Cash or other business record action was submitted. Role credentials were read at runtime from the private test-account file and are absent from this evidence.
- Reproduce with `node docs/evidence/error-warning-candidate/finance-cash-production-baseline/production-readonly.mjs` from the portal repository root. The script writes redacted `production-results.json`.

## Findings

| Role and viewport | Case | Browser result |
| --- | --- | --- |
| Finance, English, 390 px | Invalid `filter`, impossible `from`, or `from > to` by direct link | Each returns HTTP 400 with a generic full-page “The action could not be completed. Try again shortly.” The Cash form and entered filters disappear; focus is on `body`. No field guidance or remedy is present. |
| Finance, English, 390 px | `from > to` through rendered GET form | SvelteKit navigation fetches `__data.json`, then displays the same generic full-page error. Form, values, and focus are lost. |
| Finance, English, 390 px | Unsupported `currency=ZZZ&group=quarter` | HTTP 200, but the currency picker is blank and grouping silently resets to week while unsupported values remain in the URL. No warning is shown. |
| Auditor, Spanish, 1440 px | Valid Cash link | HTTP 403 permission page. |
| Auditor, Spanish, 1440 px | Invalid `filter`, impossible or reversed date | HTTP 400 generic error precedes permission denial. This is a role precedence error. |

Manager and Worker test sign-ins did not reach the workspace in this run, so their Cash behavior was not assessed. No page exceptions occurred. Browser console resource errors matched the intentional 400/403 responses. The detailed redacted network statuses and DOM snapshots are in `production-results.json`.

## Candidate requirements suggested by the baseline

Check Finance/Owner authorization before parsing Cash filters. Return a stable, translated field problem for malformed or reversed dates and unsupported filter/group/currency; keep the Cash form, attempted values, and focus on actionable guidance. Show a clear next step to correct or reset the filter and allow a successful retry after correction.
