# Help PDF error and warning browser audit

Date: 2026-09-27. Candidate product commit: `09eff62` (includes Help contract `32975d5` and reactive focus fix). The candidate was run in a disposable SQLite fixture with actual Chromium through Playwright at 390 × 844 and 1440 × 900. Browser contexts were isolated from the deployed site's shared QA session. No production records were changed.

## Deployed baseline

The deployed portal was checked read only with existing test accounts in isolated Chromium contexts. Worker EN/390, Manager PT/390, Finance ES/1440, and Auditor EN/390 each saw only the guides allowed for the role. A valid guide PDF returned HTTP 200 with `application/pdf`. Requesting a guide outside the role returned HTTP 404 with only a localized `error` string; an invalid language returned HTTP 400 with the same one-field shape. The Finance Spanish page accurately warned that its PDF download would be in English. No horizontal overflow or page exceptions were observed in these route checks.

In the Manager PT/390 page, browser-intercepted failures produced these visible states on the deployed build:

| Response | Visible guidance and remedy | Requests | Keyboard focus |
| --- | --- | ---: | --- |
| 401 | Session ended; sign in again; **Entrar** | 1 | Stayed on download link |
| 404 | Guide unavailable for account; ask administrator; **Contatar suporte** | 1 | Stayed on download link |
| 503 | PDF unavailable after attempts; retry or support; **Tentar baixar novamente**, **Contatar suporte** | 3 | Stayed on download link |

These intercepted responses test the real browser UI, but they are not evidence that the server naturally reached a missing-PDF 503. Further Finance and Auditor interception immediately after `DOMContentLoaded` was affected by hydration timing and is not counted as a result.

## Candidate verification

Three focused tests passed across two invocations (Worker EN/390, Finance ES/1440, Manager PT/390). The initial invocation had temporary assertion mistakes in the QA test's expected 404 code and English 503 phrase; after correcting those expectations, all three role cases passed. The temporary test/config and generated build were removed after verification.

| Role and viewport | Real server responses | Browser-intercepted UI checks |
| --- | --- | --- |
| Worker EN/390 | Unauthenticated 401 `HELP_MANUAL_SIGN_IN_REQUIRED`; disallowed 404 `HELP_MANUAL_UNAVAILABLE`; permitted PDF 200 | 401, 404, and 503 each showed the localized cause and remedy; the `role=alert` node received focus. The 503 path made exactly three GETs. No horizontal overflow. |
| Finance ES/1440 | Invalid language 400 `HELP_MANUAL_LANGUAGE_UNSUPPORTED`; disallowed 404 `HELP_MANUAL_UNAVAILABLE` | English PDF fallback warning remained visible; intercepted 404 explained the account limitation, provided support contact, and focused the alert. |
| Manager PT/390 | Disallowed 404 `HELP_MANUAL_UNAVAILABLE` | Intercepted 503 explained failed retries, offered a retry button and support contact, focused the alert, and made exactly three GETs. No horizontal overflow. |

Each real 401/400/404 problem body had `code`, `messageKey`, empty `params` and `fieldErrors`, a remedies array, a nonempty correlation ID, and the legacy localized `error` field. The same 404 code is used for unknown and role-disallowed guide IDs to avoid revealing restricted guide existence. The 503 checks intercepted the download GET, so they verify client behavior and retry count only. An actual missing-PDF server response and Owner browser session were outside this packet.

The screenshots show only synthetic account initials and no email, token, document ID, or credential. Successful Playwright traces were not retained because the sign-in flow would include disposable credentials.

| Screenshot | SHA-256 |
| --- | --- |
| `worker-en-390-404.png` | `1525b93e7795ad86099a9e740568f829b460e6521eaa53ad47bba0b43e7132f6` |
| `manager-pt-390-503.png` | `4e5e67a377896d6c2a0d30d856bd3183a3568f1dd8b77be1d82d9ca8a7e4dc39` |
