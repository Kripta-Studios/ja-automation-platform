# Finance assignment date race: independent browser QA

Candidate product commit: `61c9bce`. Environment: disposable local SQLite database and portal preview, real Chromium sessions, no production access. The portal was built once. Final result: **3/3 browser tests passed** in 29.2 seconds.

| Finance viewport and locale | Stale native POST                                   | Global notice bounds           | Review destination language |
| --------------------------- | --------------------------------------------------- | ------------------------------ | --------------------------- |
| 390 × 844, English          | 409 `FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED` | 85–363 px; safe area 78–756 px | English (`en-US`)           |
| 1440 × 900, Spanish         | Same                                                | 88–284 px; safe area 80–884 px | Spanish (`es-ES`)           |
| 430 × 932, Portuguese       | Same                                                | 85–363 px; safe area 78–844 px | Portuguese (`pt-BR`)        |

## Actual browser journey

Owner created one QA project and Worker assignment dated 2026-09-28 through the Projects form. Finance opened that assignment's Commercial editor for the same work date and selected a changed internal-cost fallback. While the Finance form stayed open, Owner used the rendered **Update assignment** workflow to move the assignment start to 2026-09-29. The assignment remained active but disappeared from Finance's selected-date summary. Finance then submitted the stale form natively; no requests were intercepted.

The native response was HTTP 409 with the stable version-changed code and no generic “Check the submitted values” copy. Because the assignment row was absent, a global alert explained that it was not shown for the selected work date, advised reviewing current dates, and offered the localized **Review assignment dates** link. The notice had keyboard focus and was fully visible clear of the sticky header and phone navigation; the Commercial view stayed selected, with no horizontal overflow. Clicking the remedy opened the QA project's `?tab=team#team-title` view, showed the new assignment start date, and kept the active language through the user's locale cookie. The failed submission and remedy click added no assignment or audit changes. Owner and Finance sessions had no page or console exceptions.

**Remaining product gap at this commit:** the original Finance editor is absent after the 409, and the global alert does not display Finance's attempted fallback value. The action response retains that value, but the person cannot review it on the page. This conflicts with the retained-values requirement and needs a separate UI fix and browser retest.

## Evidence and limits

Redacted `*results.json` files record network status/code, localized notice, remedy target, focus and viewport bounds, attempted value, unchanged assignment/audit, destination language, and diagnostics. Cropped `*notice.png` images show only the global alert. Fixture identifiers are replaced with `[qa-id]`; no credentials, cookies, or raw traces are retained. The first exploratory run used the manager-only assignment editor selector in an Owner session and stopped before reaching the race. The final run used Owner's actual `projects?action=update-assignment` workflow and passed at all three widths.

The reusable [browser spec](candidate.spec.ts) and [config](playwright.config.ts) use the standard disposable global setup and require a portal build before preview.

## Retest after attempted-choice recap

Candidate product commit **`85b696d`** passed **3/3** new actual-browser runs at 390 px English, 1440 px Spanish, and 430 px Portuguese. The same Owner date change and Finance native stale submit returned HTTP 409 with `FINANCE_ASSIGNMENT_COMMERCIAL_VERSION_CHANGED`. The global notice remained focused and clear of fixed navigation. A visible, localized recap showed the attempted global internal-cost fallback as **On / Activado / Ativado**. The entire notice and recap fit within the safe viewport at each width. Review assignment dates still opened the current Team tab in the chosen language, and no failed-save or review write occurred. Browser console and page exception arrays were empty.

The [retest spec](recap-retest.spec.ts), [config](recap-retest.config.ts), and redacted [results and cropped notice-plus-recap screenshots](retest-85b696d/) preserve the baseline above while demonstrating the fix. This run covered the fallback form's absent-row path; the separate stale rule-reference path was not repeated.
