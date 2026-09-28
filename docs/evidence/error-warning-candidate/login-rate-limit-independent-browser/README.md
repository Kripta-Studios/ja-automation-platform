# Independent typed auth 429 browser QA

Tested candidate: `264b3c9`, which includes typed-hook product fix `340c68c`. All traffic went to an isolated loopback Portal build and disposable SQLite fixture on 2026-09-27. The form used a synthetic `.test` address and invalid synthetic password. No production authentication request was made.

The existing focused suite, `tests/e2e/error-warning-login-rate-limit.spec.ts`, passed **18 active tests**, with **18 intentional cross-project skips**, at 390×844 and 1440×900. It covered English, Spanish, and Portuguese real-hook limits, intercepted retry-header edge cases, countdown expiry, and manual retry behavior. The first two real-hook requests returned HTTP 401; the third returned HTTP 429.

An independent actual-Chromium capture in `candidate.spec.ts` then passed **six active cases**, with **six cross-project skips**. Its evidence files record only safe response metadata, rendered notice text, focus and viewport measurements, and error counts:

| Width   | EN                                    | ES                                         | PT                                         |
| ------- | ------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| 390 px  | 401 → 401 → 429; focused 15:00 notice | 401 → 401 → 429; focused translated notice | 401 → 401 → 429; focused translated notice |
| 1440 px | 401 → 401 → 429; focused 15:00 notice | 401 → 401 → 429; focused translated notice | 401 → 401 → 429; focused translated notice |

Every 429 body carried `AUTH_SIGN_IN_RATE_LIMITED`, `problem.auth.signInRateLimited`, empty field errors, and `wait_and_retry`. The body retry seconds matched the `Retry-After` header; its correlation ID matched `X-Correlation-ID`. The retry wait was 900 seconds in this disposable fixture. Each localized notice fit inside the viewport, keyboard focus moved to it, the language stayed selected, the entered values stayed in the form, and the submit button was disabled. A forced disabled-button click left the POST count at three. No page exceptions, unexpected console errors, or horizontal overflow occurred. The expected browser resource logs for HTTP 401/429 were excluded from the unexpected-console count.

`*-results.json` contains no credentials, request bodies, cookie values, or raw correlation IDs. Each `*-notice.png` crops to the rate-limit message only; it excludes both input fields. Playwright traces, video, and full-page screenshots were disabled for the independent capture. The fixture and generated build were removed after the run.

To run the existing suite after building the Portal in a disposable environment:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH \
JA_PLAYWRIGHT_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
./node_modules/.bin/playwright test \
  --config=playwright.login-rate-limit.config.ts \
  --project=phone-390 --project=desktop --reporter=line
```

The independent artifact uses `docs/evidence/error-warning-candidate/login-rate-limit-independent-browser/playwright.config.ts` with the same built Portal and disposable fixture setup.
