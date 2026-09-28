# Worker correction withdrawal dependency: browser baseline

Candidate product commit: `3599b9812ea0172f7e97658020026354e2ba7e7c`. Playwright Chromium used a fresh disposable database on the local Portal preview. Owner created and assigned a QA project through the interface; Worker saved and submitted time, Owner approved it, Worker created a correction draft and saved a related expense through the interface. The correction and linked expense were read from SQLite only for assertions. Production was not changed.

Command: `pnpm exec playwright test --config docs/evidence/error-warning-candidate/time-correction-withdraw-dependency-baseline-browser/playwright.config.ts --reporter=line` with Node 24 on `PATH`. Result: **2 passed, 2 intentionally skipped** (one matching test per viewport). The tested views were Worker at 390 px in English and Worker at 1440 px in Spanish.

| Check                                         | Phone 390, English                                                                               | Desktop 1440, Spanish                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Native POST                                   | HTTP 409, generic `ACTION_ERROR_CONFLICT`                                                        | HTTP 409, generic `ACTION_ERROR_CONFLICT`                         |
| Visible explanation                           | “This action conflicts with the current record state.”                                           | “La acción entra en conflicto con el estado actual del registro.” |
| Permitted remedy                              | None                                                                                             | None                                                              |
| Entered withdrawal reason after native reload | Cleared                                                                                          | Cleared                                                           |
| Focus and position                            | Notice focused at 495–600 px, scrollY 0                                                          | Notice focused at 462–567 px, scrollY 0                           |
| JSON action transport probe                   | HTTP 200 envelope, failure status 409, same generic code, reason present in returned `values`    | Same                                                              |
| Database boundary                             | Correction stayed Draft/version 1; linked expense still pointed to it; no additional audit event | Same                                                              |
| Browser errors                                | No page or console exceptions                                                                    | No page or console exceptions                                     |

The JSON probe used browser `fetch` with SvelteKit action headers to verify response shape. The form itself is native, so the probe does **not** establish enhanced UI behavior. The expected local offline-identity API returned 503 because this fixture disables offline mode; it did not interrupt the form flow. Server logs emitted `Unmapped form business failure` for the known `Correction draft has dependent records` exception.

Redacted records: [phone results](results-phone-390.json), [desktop results](results-desktop.json), [phone notice](worker-phone-390-en-notice.png), and [desktop notice](worker-desktop-1440-es-notice.png). The screenshots crop to the notice and contain no account credentials or record identifiers. Browser tracing was disabled to avoid retaining login secrets.
