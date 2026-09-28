# Duplicate private upload browser QA

Candidate: `codex/error-warning-release-candidate-20260926` working tree, 26 September 2026. The release commit will identify the immutable candidate snapshot. Tests used a new disposable SQLite database and private document root; production was not changed.

Run with pinned Node 24:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/duplicate-private-upload-problem-browser.spec.ts --project=phone-390 --project=desktop --reporter=line
```

Result: **4 passed, 4 cross-project skips** (390 px phone and 1440 px desktop, Worker receipt and Owner private document). The final run used the real Chromium UI and form submissions, with a fresh file payload for each test and the same bytes under a second filename.

| Flow                                      | Browser result                                                                                                                                                                                                                                                                                              | Saved rows                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Worker expense receipt                    | First draft saved; renamed duplicate displayed `EXPENSE_RECEIPT_DUPLICATE_CONTENT`, explained that no new expense was saved, and linked to the expense list. Enhanced SvelteKit transport returned HTTP 200 with decoded action failure status 409, the expected message key, and `review_expenses` remedy. | One matching expense and one matching document. |
| Owner finance-classified private document | First upload saved; renamed duplicate returned native HTTP 409 `DOCUMENT_DUPLICATE_CONTENT`, explained the duplicate without revealing the original filename, and linked to the document list.                                                                                                              | One matching document.                          |

Both flows retained the chosen project and entered fields, focused the inline problem, and had no unexpected page or console errors. The Worker selected PDF link was clicked; Chromium downloaded byte-identical content under the original filename. The phone document notice was completely below the sticky header after an 86 px correction from its original scroll position (notice top 86 px, header bottom 69.6 px). The desktop scroll position remained unchanged.

The four JSON files record statuses, row counts, scroll positions, focus targets, and routes without account identities or content hashes. The four PNG files show only the problem notices. The Playwright spec is [duplicate-private-upload-problem-browser.spec.ts](../../../../tests/e2e/duplicate-private-upload-problem-browser.spec.ts). Tests inspected the disposable database only to verify that duplicate submissions created no extra rows.
