# Login rate-limit browser evidence

**Candidate source:** `b075f28` (includes the login countdown change from `043c5c4`). **QA harness:** `0b6fd39`, with HTTP-date test correction `9c5a34e`. These tests used an isolated Portal build and disposable SQLite database on loopback. No production sign-in request was made. The test used only a synthetic `.test` address and an invalid synthetic password.

## Reproduced cause before the change

With the disposable auth limit set to two attempts, the real browser sent two POSTs that returned 401 and a third that returned 429. The 429 response contained JSON error `Too many authentication attempts` and a `Retry-After` header of 892 seconds on that request. At 390×844, the old message began at y=846 px, below the viewport; focus had moved to the document body. The submit button stayed enabled, and a fourth click made another 429 POST. Both form values stayed entered.

## Candidate result

Command: `playwright test --config=playwright.login-rate-limit.config.ts --project=phone-390 --project=desktop --reporter=line`, using the Portal build of candidate `b075f28` plus the test-only commits above. Final run: **18 passed, 18 intentional cross-project skips, 0 failed**, in 25.4 seconds. An initial test run had one assertion error that expected a 70-second HTTP-date to display 61 seconds; the assertion was corrected and the whole matrix rerun green.

The six real-hook cases covered English, Spanish and Portuguese at 390×844 and 1440×900. Each observed 401, 401, then 429 with the server's JSON body and a positive `Retry-After` no longer than 900 seconds. Each showed translated countdown wording within the viewport, focused the notice, retained the entered email and password, disabled submit, caused no fourth POST after a forced button click, had no horizontal overflow, and emitted no uncaught page error. Chromium logged expected HTTP failures for the 401/429 responses.

The remaining active cases covered translated 61-second countdowns, missing/zero/invalid/implausibly long headers using the safe generic wait wording, an HTTP-date header, and a three-second countdown that advanced, re-enabled submit after expiry, and sent a second request only after a manual click. No automatic retry occurs.

The isolated fixture and preview exited after the run; port 4174 was closed. The auth-form spec disables full-page traces and screenshots because they can contain entered credential values. This packet records redacted findings and assertions; it does not contain a screenshot or trace artifact.
