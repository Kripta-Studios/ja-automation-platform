# Draft invoice PDF preview: independent browser QA

Frozen product commit: `d9c212ba93625ff9fe37802c771291a1ecfb42de`. Actual Chromium ran against a disposable E2E database on local port 4174 on 2026-09-27. The candidate was never deployed. Seeded Billing rows were selected from the rendered app. One draft was approved and issued through the rendered Billing UI solely to test the two-tab race; all other cases were read only. Evidence files omit account credentials and record IDs.

## Results

| Scenario | Browser result |
| --- | --- |
| Owner, 390 px, English and Portuguese; Finance, 1440 px, Spanish | Rendered preview click routed to an unavailable invoice returned HTTP 404 `application/problem+json` with `INVOICE_DRAFT_PREVIEW_INVOICE_UNAVAILABLE`. The translated notice and Billing remedy remained on the invoice page, focused and below the sticky header. No download, invoice write, or audit write occurred. |
| Same roles and viewports | Routed issued invoice returned HTTP 409 `application/problem+json` with `INVOICE_DRAFT_PREVIEW_STATE_UNAVAILABLE`, current Issued status, translated Review invoice details remedy, retained page and scroll, and no download or write. |
| Same roles and viewports | A real valid preview returned HTTP 200 `application/pdf`; Chromium downloaded a file with the requested locale suffix and `%PDF-` magic bytes. No error notice remained. |
| Owner, 390 px, English, two tabs | First tab stayed on a draft detail. The second tab used Billing UI to Approve and Issue that same disposable invoice. First-tab preview then returned typed 409 `STATE_UNAVAILABLE`, showed a focused current-state notice and remedy, and produced no download. Invoice/audit counts did not change on the failed preview. |
| Owner, 390 px, English, request aborted once | One failed request showed `INVOICE_DRAFT_PREVIEW_NETWORK_UNAVAILABLE`, confirmed nothing changed, and offered Retry preview. No automatic second request or download occurred. Clicking the remedy made the explicit retry and downloaded the valid PDF. |
| Owner and Finance, issuer setup problem | Seeded drafts produced HTTP 409 `INVOICE_DRAFT_PREVIEW_ISSUER_MISSING`. Owner received Review legal entities; clicking it opened the selected project's visible issuing-authority section in Finance. Finance received contact-owner text and no restricted setup link. |
| Manager and signed-out browser contexts | Direct API GET returned typed 403 `ACCESS_DENIED` with `contact_owner`, and typed 401 `SIGN_IN_REQUIRED` with `sign_in_again`, respectively. |
| Owner, 390 px, JavaScript disabled | The rendered native anchor downloaded a valid PDF with correct locale filename and `%PDF-` bytes. A direct invalid native GET returned HTTP 404 `application/problem+json` with the typed code visible in the browser. |

Observed notice focus was the `aside[data-ui="problem-notice"]`; notice top stayed about 98 px at scrollY 260 on enhanced failures, below the 70–72 px sticky header. The real stale notice was visible at about 358 px on the phone. The role cases recorded zero uncaught page errors and zero unexpected console errors. Failed cases recorded zero downloads; only explicit successful preview and retry created browser downloads.

The browser did not force a server 503, expired live session, currency mismatch, or subtotal mismatch. Those cases need separate fixture setup or route-level tests. The Manager role was tested at the API boundary because it cannot access the invoice detail page.

Replay: `pnpm exec playwright test --config docs/evidence/error-warning-candidate/invoice-draft-preview-candidate-browser/playwright.config.ts`. The main role matrix passed 6/6; focused issuer navigation and native fallback runs each passed 1/1. JSON observations and cropped, redacted notice screenshots are in this folder.
