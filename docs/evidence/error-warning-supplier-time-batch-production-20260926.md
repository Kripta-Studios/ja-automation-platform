# Supplier time-batch production browser check — 2026-09-26

This check used the deployed portal through Playwright browser MCP at a 390 × 844 viewport. It used the Supplier Coordinator test login and existing, clearly named QA supplier/project/technician records. No new draft was saved by the failing action. Names and identifiers are omitted here.

| Check                    | Observed production result                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route                    | `/j-aautomation/app/supplier`, Record team hours workspace                                                                                                                                             |
| Trigger                  | Selected one QA technician with an existing 7.5-hour draft for the same day; entered 18 hours and a QA summary; selected Save selected drafts.                                                         |
| Network                  | Native `POST ?/createTimeBatch` returned HTTP 400. Response contained stable code `SUPPLIER_DAILY_LIMIT`.                                                                                              |
| Visible message          | “This worker already has time on the selected day. Total time cannot exceed 24 hours.” It also stated “No time entry was saved” and offered “Review time drafts.”                                      |
| Recovery                 | Technician selection, date, category, and summary remained. **Actual hours reset from 18 to blank.** The Record team hours workspace remained selected.                                                |
| Phone position and focus | Main notice was visible near the top of the viewport after return (top about 80 px; scrollY about 303). Keyboard focus was on `BODY`, not the notice or error field, even after waiting for hydration. |
| Console                  | One resource-load error corresponding to the expected HTTP 400; no separate client exception or warning.                                                                                               |

The candidate source already contains restoration for `durationHours` and focused browser assertions in `tests/e2e/supplier-recovery.spec.ts`; the deployed result is older than that candidate. Candidate QA should verify the restored 18 hours and a visible, focused notice at 390 px before release. The daily-limit wording and remedy are clear; the value and focus recovery are the remaining production gaps in this case.
