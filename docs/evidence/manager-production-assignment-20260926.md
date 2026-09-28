# Deployed Manager assignment browser audit — 2026-09-26

Target: deployed portal at `https://j-aautomation.com/j-aautomation/app/projects`. Role: Project Manager test account from the private test-account manual. Only the existing `QA ERROR AUDIT 20260926` project and its QA worker were selected. No credentials, session data, worker IDs, or raw network bodies are stored here.

## Safe preflight

- The Manager could open Projects (HTTP 200) and see one authorized active QA project.
- The **Assign worker** details panel contains a project picker, expertise filter, worker picker, start date, optional end date, and **Assign** action at `?/assignWorker`.
- `QA Worker 1` already has an active assignment from 2026-09-26 with no end date. Selecting this same worker and overlapping dates can test the conflict without creating another assignment.
- The form is initially collapsed; browser automation opened it through its visible summary before interacting with controls.

## Browser result

Several setup logins in short succession triggered the deployed sign-in rate limit. After waiting more than five minutes, one controlled retry still received HTTP 429 from POST `/app/api/auth/sign-in/email`. The visible text was: “Too many sign-in attempts. Wait a few minutes before trying again.” The sign-in page remained open. The retry stopped there; no more login attempts were made.

| Check                                              | 390 px                                  | 1440 px                           |
| -------------------------------------------------- | --------------------------------------- | --------------------------------- |
| Authenticated Projects page                        | HTTP 200 during preflight               | Not reached after the rate limit  |
| Existing QA assignment overlap preflight           | Confirmed start 2026-09-26, no end date | Not reached                       |
| Assignment POST status and problem code            | Not submitted                           | Not submitted                     |
| Visible assignment wording and remedy              | Not observed                            | Not observed                      |
| Retained entries, open details, focus, tab, scroll | Not observed after a submission         | Not observed                      |
| Save occurred                                      | No assignment submission occurred       | No assignment submission occurred |

The 429 response is an authentication warning with a next step, but “a few minutes” is imprecise: the current server uses a 15-minute rate-limit window and sends a dynamic `Retry-After` value ([hooks.server.ts](../../apps/portal/src/hooks.server.ts)); the sign-in page ignores that header and renders a fixed message ([+page.svelte](../../apps/portal/src/routes/app/login/+page.svelte)). Showing the server-provided remaining wait in English, Spanish, and Portuguese would explain why a retry after five minutes can still fail. This is a source finding supported by the observed 429, not a measured `Retry-After` header from this browser run.

This browser run does not establish whether deployed duplicate-assignment handling is clear. A later QA run should use one authenticated session, confirm the QA assignment is still active, submit an overlapping assignment at both widths, inspect the response and console, and verify that the existing assignment count stays unchanged.

The sign-in warning was subsequently updated in the candidate source to use the server's `Retry-After` value when valid, with localized minute guidance and a safe fallback. The focused synthetic browser check is [error-warning-login-rate-limit.spec.ts](../../tests/e2e/error-warning-login-rate-limit.spec.ts). This source change has not been observed on the deployed portal in this audit.
