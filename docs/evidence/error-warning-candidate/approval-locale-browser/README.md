# Approval access and validation locale browser QA

Candidate product and browser spec commit: `0b450ae` (2026-09-27). The checks ran in actual headless Chromium against the candidate web app using a disposable SQLite browser fixture. Both Playwright cases passed. The evidence files contain cropped UI screenshots and redacted request paths/statuses; no passwords, tokens, or raw traces are retained.

| Check | Browser result |
| --- | --- |
| Read-only auditor opens `/app/approvals` | HTTP 403; focused `Access restricted` H1; the explanation names roles permitted by the route gate; `Open my workspace` opens the auditor's Finance Overview. At 390 px and 1440 px, document width equals viewport width. No page errors or unexpected console errors. |
| Project manager leaves a required change reason blank | Native validation shows a field error and a linked summary without an approval POST. The summary and inline message follow EN → ES → PT-BR. The same summary node, empty required field, unsent rejection note, selected Time tab, open Review actions disclosure, closed unrelated disclosure, keyboard focus, and scroll position survive both language changes at 390 px. No horizontal overflow, page errors, or console errors. |

The fixture signs in once per case. The auditor response is an expected 403. See [auditor-results.json](auditor-results.json) and [locale-results.json](locale-results.json) for response status, request paths, viewport geometry, focus, and retention flags. The four cropped screenshots show the access explanation and validation summary in each tested language.

An earlier diagnostic run with the disposable fixture's offline identity endpoint disabled produced a 503 for `GET /app/api/offline/identity`; [diagnostic-first-pass/auditor-offline-disabled.json](diagnostic-first-pass/auditor-offline-disabled.json) records that setup error. The final fixture enables this endpoint, and the final pass has no unexpected console errors.

Scope: these checks exercised a denied route and a client-side validation failure. They did not submit an approval, mutate production records, or cover every role and approval decision.
