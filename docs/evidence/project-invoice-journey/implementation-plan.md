# Project to invoice journey

User-authorized simplification, 2026-10-09. Preserve optional configuration, actual
work, exact money, historical invoices, roles and private artifacts.

Dependency DAG: browser audit → UX advice → {creation/conditions, selected-source
domain} → shared composer/API/project workspace → independent finance/security
review → isolated browser journey at four widths → upgrade/build → deployment.
Only one browser instance holds the browser lease at a time.

| Packet                 | Requirements     | Risk | Owned paths                                                                                                     | Acceptance                                                                                                                                  |
| ---------------------- | ---------------- | ---- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser audit          | CORE-03/08/10/11 | B    | journey audit E2E/evidence only                                                                                 | Real UI creation, assignment, work approval, billing and PDF; reproduce errors without production writes                                    |
| UX advisor GPT 6 Astra | CORE-03/08/10/11 | C    | Read only                                                                                                       | Fewer screens, persistent context, explicit remedies preserving optionality and authority                                                   |
| Selection domain       | CORE-08/10/11    | C    | database repository/new composition domain/index/schema, migration 0076/contract, composition integration tests | Explicit source manifest, atomic approval, server preview, idempotent distinct drafts, no duplicate charges, immutable issue, real sessions |
| Creation/conditions UI | CORE-03/08       | B    | ProjectSection, creation helpers, ProjectSetupNextSteps, ProjectBillingSetup, dashboard creation links          | Success continues to project, working assignment links, concise primary controls, optional advanced configuration retained                  |
| Lead integration       | CORE-03/08/10/11 | C    | composer endpoint/component/text, project detail, BillingSection integration                                    | Select workers/hours/expenses, approve chosen sources, explain blockers, preview/save/issue/PDF in context                                  |
| Independent review     | CORE-08/10/11    | C    | Read only then failures to owner                                                                                | Money/grouping/history/RBAC/session/CSRF/source races and mobile flow verified                                                              |

Workers do not overlap writes or revert other changes. No production synthetic
records, approvals, invoice issue or PDF generation for testing. Upgrade and
rollout must preserve old table values and private files with verified backup.

Initial browser observations: dashboard creation URL did not open the sheet;
creation success assignment link left the cleared creation form visible; the old
invoice dialog suggested September although actual work was in October; its wizard
had no source selection. These observations motivated the implementation.

The initial draft HTTP500 is retained as a harness-constrained historical artifact,
not a confirmed production or application failure: the server survived an interrupted
runner and its exception log was unavailable. Fresh managed fixtures have returned no
HTTP500 during creation, approval, expense classification, draft or issue. The current
browser retest has reached issued $299 invoices and real PDF readiness. Final four-width
and acceptance results are recorded separately after completion.

Raw traces and snapshots, including synthetic authentication material, remain private
under /tmp/journey-audit. Repository evidence contains screenshots without authentication
secrets, findings and redacted result summaries.
