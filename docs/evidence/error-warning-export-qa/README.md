# Export and artifact browser QA — 2026-09-26

This pass used real Chromium against a disposable local portal database and document root. It made no production financial writes and retained no private artifact bytes. The checked-out base was `8669fa3` with concurrent uncommitted candidate changes; this is a pre-freeze diagnostic, not release sign-off. The Accounting Pack component and My Pay shell source fingerprints at inspection were `8fa710af` and `4f8b77f8` (SHA-256 prefixes).

## Browser run

`PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/accounting-pack-export-browser.spec.ts tests/e2e/worker-statement-export-browser.spec.ts --project=phone-390 --project=desktop --reporter=line`

Result: **4/4 passed**, including a screenshot rerun, at 390×844 and 1440×900. The existing `artifact-lifecycle.spec.ts` queued, processed, and terminal-failure cases were also rerun at those widths: **6/6 passed**. The latter confirms the durable worker can produce five independent formats, that pending/failed API downloads avoid HTTP 500, and that a failed PDF can coexist with other formats. These are actual Chromium browser tests, although the ready-format bytes are inspected through the browser's authenticated request context rather than by clicking the ready link.

| Case                            | Browser observation                                                                                                                                           | Outcome     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Finance creates Accounting Pack | Form POST 200; PDF queued; pending download 409                                                                                                               | Pass        |
| Accounting Pack PDF fails       | Disposable renderer-failure object projected as `PDF · Failed`; download 409; **no safe explanation or remedy link in the row**; response has no typed `code` | Product gap |
| Accounting Pack roles           | Owner and Finance page 200; Auditor page 200 with no create form; Auditor failed download 409; Worker private download 404                                    | Pass        |
| Worker requests My Pay PDF/CSV  | Actual Generate report button POST 202; both formats queued; visible automatic-processing guidance                                                            | Pass        |
| Premature My Pay retry          | Authenticated retry POST 409 while queued; response has no typed `code`, correlation ID, or remedy                                                            | Product gap |
| Invalid My Pay export period    | Authenticated request POST 400; response has no typed `code`, field error, or remedy                                                                          | Product gap |
| My Pay role boundary            | Another Worker receives 404 for private download; Owner and Finance list API receive 403                                                                      | Pass        |

The Accounting Pack failed state was injected only into the disposable database using the repository's `_artifactFailures.pdf` shape, then observed through the real page loader and download route. Its internal renderer detail must not be shown verbatim; the UI should show a translated safe cause and a permitted next step. Worker statement failed rendering and a retry after terminal failure were not produced in this pass. The artifact table has service-provenance triggers, so direct status mutation would not be a faithful fixture. The My Pay UI currently has no visible failed-artifact retry control; that needs a deterministic service-worker failure scenario after the API/UI fix.

The ready Accounting Pack API path is covered by the 6/6 lifecycle suite. A browser click on the ready link, a transient failed fetch, and a failed My Pay artifact retry still need a focused post-fix run. Focus and scroll restoration are not applicable to the direct download API requests; the create form succeeded. Both tested page widths had no document-level horizontal overflow.

## Console and evidence limits

There were **zero uncaught page exceptions**. The My Pay multi-role run captured **14 console error entries** at each width, including inline-style CSP violations and HTTP 503 resource failures. A `Sync failed — retry when the connection is stable` toast appeared and overlaps the lower edge of cropped component screenshots. The script did not retain the 503 response URLs, so the endpoint and cause remain unattributed. This console finding is unresolved candidate QA; the screenshots are useful for status wording but not evidence of a clean console. No raw browser trace was retained because it would include session material.

The JSON summaries contain status codes, response-shape booleans, visible copy, and sanitized console examples only. Cropped screenshots use synthetic fixture records and contain no credentials or private artifact bytes:

- Accounting Pack: [phone failed](phone-390-accounting-failed.png), [desktop failed](desktop-1440-accounting-failed.png), [phone network summary](phone-390-accounting-pack.json), [desktop network summary](desktop-1440-accounting-pack.json).
- My Pay: [phone queued](phone-390-worker-queued.png), [desktop queued](desktop-1440-worker-queued.png), [phone network summary](phone-390-worker-statement.json), [desktop network summary](desktop-1440-worker-statement.json).

Source locations for follow-up: `apps/portal/src/lib/portal/ui/localized-pdf/AccountingPackArtifactStatus.svelte` status and click handling; `apps/portal/src/lib/PortalShell.svelte` My Pay request/poll and badges; Accounting Pack private download route; worker statement request, retry, and download API routes. Keep non-enumerating private-artifact 404 responses during any typed-contract change.
