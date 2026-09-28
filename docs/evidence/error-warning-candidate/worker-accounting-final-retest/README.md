# My Pay and Accounting Pack recovery: final browser retest

Candidate `763be5b`, checked 2026-09-28 in a local portal preview with a fresh disposable database at 390 × 844. Worker and Finance signed in through the rendered login form. The executable [Playwright spec](candidate.spec.ts) drove the real controls. It retained no credentials, artifact bytes, record IDs, or raw traces. No production data was changed.

## My Pay: download conflict, then failed status refresh

The Worker generated a statement through My Pay (real POST **202**). The durable artifact worker produced a ready PDF in the disposable fixture. Playwright then intercepted the PDF download GET with a typed **409** render-failed problem and the following status-list GET with **503**. These two failures are **injected network responses**, so this run verifies the browser recovery behavior, not a naturally failing file or service.

The page hid the stale Ready download link, displayed a status-check badge and focused `WORKER_STATEMENT_DOWNLOAD_STATUS_UNKNOWN`. It showed a **Check statement status** button and no unavailable Retry action. Clicking the button sent a second status GET; with the injected 503 still active, the notice remained. The selected period and page URL stayed intact. No page-script exceptions or horizontal overflow occurred. Chromium resource-load errors corresponded to the injected responses.

At 390 px, the notice settled at top/bottom 615/756 px after the focus animation, with scrollY 240 and the fixed navigation safety boundary at about 756 px. The raw geometry put its bottom **0.422 CSS px** past that calculated margin; a 1 px rendering tolerance confirms it is visibly clear of the navigation. The cropped [notice screenshot](worker-390-en-status-unknown.png) and [redacted observations](worker-results.json) include immediate, two-frame, delayed, and after-screenshot positions.

## Accounting Pack: retry outcome certainty

Finance created a new pack through Accounting (real form POST **200**). The real disposable artifact worker produced a failed PDF while a retry remained available. Playwright intercepted the first explicit Retry PDF POST with typed **503** `ACCOUNTING_PACK_RETRY_SERVICE_UNAVAILABLE`. The focused, visible notice said the request **was not queued**, showed a safe reference, and offered **Check pack status**. No retry job was added. After that status check, a second explicit retry intercepted with unknown **500** produced distinct uncertain wording: the retry **may already be queued** and the user should check status. No retry job was added in this injected run, and no page-script exception or horizontal overflow occurred.

The 503 and 500 are **intercepted responses**. Their comparison verifies that the UI does not claim certainty for an unknown 500. It does not prove the server's pre-invocation exception path emitted 503 under a natural outage. [Redacted observations](accounting-results.json) and cropped [503](finance-390-en-retry-503.png) and [500](finance-390-en-retry-500.png) notices preserve the response distinction without pack IDs.

Both focused Playwright tests passed against `763be5b`. Desktop and other languages were covered in earlier packets; this retest targeted the two remaining recovery paths on a phone.
