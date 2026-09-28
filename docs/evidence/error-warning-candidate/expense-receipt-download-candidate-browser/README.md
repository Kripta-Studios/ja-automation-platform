# Expense receipt preview: candidate Chromium QA

Baseline product build: `e89e7fa` on 2026-09-28. Actual headless Chromium used the shared disposable SQLite Portal preview at port 4174. The Owner created a uniquely named active project and Worker assignment through the app; the Worker saved a draft expense with a synthetic PDF receipt through the app. No production account, record, or private file was read or changed.

| Case | Result |
| --- | --- |
| Worker, English, 390 px, actual View | Receipt GET returned 200 `application/pdf` with inline filename disposition. **Defect:** Chromium emitted a download on the provisional popup; the popup remained empty `about:blank` after four seconds, with no inline confirmation or error. The expense page stayed open. |
| Worker, English, 390 px, intercepted file-missing 409 | Focused `DOCUMENT_DOWNLOAD_FILE_MISSING` explanation and contact-owner instruction. Provisional tab closed; no raw JSON tab or horizontal overflow. |
| Worker, Spanish, 390 px, intercepted session 401 | Translated `DOCUMENT_DOWNLOAD_SIGN_IN_REQUIRED`, focused explanation and Sign in again link to login. |
| Worker, Portuguese, 390 px, intercepted service 503 | Translated `DOCUMENT_DOWNLOAD_SERVICE_UNAVAILABLE`, safe no-change guidance, reference ID, and Try View again link. |
| Worker, English, 390 px, simulated blocked popup | Focused `DOCUMENT_PREVIEW_POPUP_BLOCKED`; zero receipt GETs; Try View again link. |
| Owner, Portuguese, 1440 px, intercepted unavailable 404 | Translated `DOCUMENT_DOWNLOAD_UNAVAILABLE`, focused explanation and Review current expense link. |
| Second Worker, 1440 px, actual cross-worker GET | HTTP 404 `DOCUMENT_DOWNLOAD_UNAVAILABLE`; no receipt bytes exposed. |
| Worker, English, 390 px, actual duplicate content | Enhanced transport HTTP 200 with action failure 409 `EXPENSE_RECEIPT_DUPLICATE_CONTENT`; clear no-save wording and `review_expenses` remedy. Vendor, amount, project, and selected file remained entered; no second expense was saved. Focus moved to the wrapper containing the notice. |

The receipt detail page has no `.bottom-nav` element; the fixed mobile navigation overlap check therefore does not apply to this route. At 390 px the notices had no horizontal overflow, and the notice element screenshots show the complete wording and remedy. No unexpected page or console errors were observed for the Worker and Owner cases. The 401/404/409/503 UI recovery responses were browser-intercepted and are labeled as such; the cross-worker 404, success 200, and duplicate-content 409 were actual server responses.

Product commit `1866755` added a useful provisional popup before PDF navigation. A fresh disposable build and fixture then passed a narrow actual-browser rerun: Worker at 390 px in **EN, ES, and PT**, each actual PDF GET returned 200 and Chromium emitted a native download; the popup now retained a localized verified-receipt heading, explanation, and safe blob download link instead of an empty tab. The expense page stayed in place; no inline problem, page error, or unexpected console error appeared. This result is in [postfix observations](postfix-observations.json), with a cropped [Spanish popup screenshot](postfix-worker-es-390-success.png). It verifies the corrected success branch without repeating the baseline's intercepted failure matrix on the new build.

The reusable [baseline observations](observations.json) and [focused baseline observations](baseline-focused-observations.json) contain route kinds, codes, statuses, viewport and focus checks, and visible public wording only. Screenshots crop just the problem notice or synthetic popup; they include no account, project, expense ID, receipt bytes, or credential. SHA-256 digests:

| Cropped screenshot | SHA-256 |
| --- | --- |
| `worker-en-390-409.png` | `004ea8e687c6f8f3537965b7b02a2d3e14c4ee23153ff77943cbc5ea8b21d3d9` |
| `worker-pt-390-503.png` | `57d976e4ecc9c5d46b93edc5c3521e0245ae9d5a89731e69a739f1919827ae2f` |
| `worker-en-390-duplicate-content.png` | `e8138f420d436ec5cc2aa410206e83163af01d3a21adcf725ac78829603dd1cf` |
| `postfix-worker-es-390-success.png` | `8ab03568c57004bd703ce622ee9888d781acfbc00b52e87a7bda136687bce567` |

To rerun, use `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test --config docs/evidence/error-warning-candidate/expense-receipt-download-candidate-browser/playwright.config.ts -g 'Postfix receipt preview'` against product build `1866755`. The two baseline tests require build `e89e7fa` and can be selected by their test names. The config deliberately starts no server and runs no global setup, so it requires an already running disposable preview and its fixture pointer and does not reset another QA lane's fixture.
