# Final browser validation

The final compiled portal passed both complete-journey browser tests on 2026-10-09 in
3.6 minutes. After the advanced disclosure fix, the final rebuilt portal passed the meaningful SPA
delayed-readiness case in 6.3 seconds.
The tests used disposable E2E users, client, database and document root. Project creation,
assignments, customer/internal/pay terms, time and expense drafts/submissions, approval,
issuer setup, expense classification and invoice commands used actual visible forms.
SQL reads verified final persistence; no business journey was injected through SQL or APIs.

| Coverage                                       | Result                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard creation at 360, 390, 768 and 1440px | Direct project workspace after save; optional budget/end fields remained optional                                                                |
| Two Worker assignments and distinct terms      | Customer $50/$75 hourly, internal $20/$30, pay $18/$25                                                                                           |
| Actual work per width                          | Two hours and one $24.50 expense from each Worker; one Worker daily report                                                                       |
| Source selection                               | No default selection; selected visible records; pending approval and expense conditions applied through UI                                       |
| Invoice totals                                 | Exact $299 preview, persisted draft and issued invoice at each width                                                                             |
| Separate drafts at 360px                       | Additional one-hour sources produced distinct $50/$75 drafts in the same period, with no duplicate source links                                  |
| Actual artifact worker                         | Real jobs succeeded; invoice-specific PDF job succeeded once; authenticated download returned HTTP200 application/pdf and %PDF bytes             |
| Issuer assignment                              | Optional effective end was blank before save                                                                                                     |
| Role boundaries                                | Worker and PM had no invoice composer; Finance saw reserved records disabled; PM saw the Worker report                                           |
| Layout checks                                  | Required creation fields and representative composer filters/actions had visible accessible labels, 44px touch height and no horizontal clipping |
| Errors                                         | Zero asserted unexpected console/page errors, UI401/500 responses or failed artifact jobs                                                        |

Only one browser instance ran at any time. The UI browser closed before the real PDF
renderer launched; artifact rendering completed before a single UI browser reopened.
The four widths and roles were exercised sequentially with one test worker.

Current screenshots are final-project-workspace-_.png, final-calculated-selection-_.png
and final-issued-invoice-\*.png. They show disposable fixture views. The concise
final-browser-summary.json contains test outcomes and amounts without sessions or
credentials. Raw Playwright results, HTML, traces and original snapshots remain private
under /tmp/journey-audit; historical harness failures are described in browser-findings.md
and are not current application defects.

The existing five-file acceptance suite has 72 unique viewport cases: 50 passed and 22
were skipped by their existing viewport rules. Latest outcomes are green after explicit
focused reruns of corrected cases; these totals are deduplicated by project and test title.

| Viewport project | Passed | Existing skips |
| ---------------- | -----: | -------------: |
| phone-360        |     11 |              7 |
| phone-390        |     10 |              8 |
| tablet-768       |     11 |              7 |
| desktop          |     18 |              0 |

This preserves the old currency, site/contact, calendar, cost-center, budget-unit,
assignment-date rejection, no-write, bulk-copy and saved person-rate/expense assertions.
The three optional checkboxes remain checked after rejected creation. Saved billing
setup is explicitly reopened for editing and locale checks. Focus checks assert the
actual guided repair field while retaining underlying field errors and values.

A real navigation defect was reproduced: browser Back from an unassigned project's
Log time surface left the global repair dialog blocking Reports. The final rebuild
closes obsolete guided recovery on navigation and guards delayed callers. A dedicated
regression now creates a project through UI, opens its no-Worker repair, presses Back
without Cancel, verifies the dialog is hidden, clicks Reports and asserts no time entry
was saved. It passed at all four widths. The final focused navigation/recovery run
passed 27 cases with 9 existing viewport skips, including the 20 guided recovery cases
and three remaining desktop cases. See final-acceptance-summary.json for the exact
latest outcomes.

Older focused acceptance cases retain their existing setup helpers, unlike the complete
journey above. The old 32-step artifact-rendering test was not executed because its
browser/renderer overlap would violate the one-instance requirement. Two interrupted
multi-project runner attempts exited143; their raw diagnostics remain private. Splitting
acceptance into sequential viewport runs completed normally. Historical selector/setup
failures were corrected and rerun; they are not current unresolved defects.

At 360px, the delayed-readiness case now uses the real Team and conditions → Open
Billing SPA link. A random window marker survives both that link and browser Back to
the project billing tab, proving the document remained alive; no beforeunload prompt
occurred. The manually expanded whole-period section retains its open state through
three actionable Next steps. The test holds the actual Check selected period GET,
presses Back, then releases a controlled incomplete readiness response. It asserts no
obsolete repair dialog, usable Reports navigation, zero POST requests, unchanged invoice
count and no pageerror. This focused test passed in 6.3 seconds on the final disclosure
build; the previous full-page scheduling limitation has been replaced by these explicit
SPA checks.

That refinement exposed a real disclosure defect: a URL-derived open=false was reapplied
after Next, collapsing the manually opened section. The fix retains the user's expanded
state across wizard steps, and the focused passing test exercises that progression.
The money/PDF and acceptance evidence above was retained without unrelated reruns.
Latest outcomes for all three main cases remain explicit in final-browser-summary.json.
