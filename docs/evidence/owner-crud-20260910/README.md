# Owner management and searchable selectors — 2026-09-10

## Scope and behavior

The Owner can manage operational records regardless of whether they originated as demo data or were entered by another worker. `/app/manage` provides an Owner-only management entry point and links to the existing domain screens. This release does not erase production records automatically.

| Domain                         | Interface and lifecycle                                                                                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expenses                       | Create for an assigned worker; reopen approved/submitted records as draft; edit another worker’s draft; submit; delete unlinked records with reason and audit snapshot.                                                                          |
| Time                           | Create for an assigned worker; edit/submit another worker’s draft; reopen and delete unlinked records. Actor and worker remain distinct.                                                                                                         |
| Daily/technical reports        | Create for another assigned worker; existing draft editor and submission; Owner reopen/delete. Committed attachments and finalized history use the existing correction lifecycle.                                                                |
| Planning / availability        | Owner create, edit, delete; optimistic row tokens, effective assignments, overlap and availability validation.                                                                                                                                   |
| Milestones / technical changes | Owner create, edit, delete; exact decimal money conversion; invoice references and safety validation retained.                                                                                                                                   |
| Documents                      | Existing private upload/download; Owner description editing, archive and restore. Archived documents leave ordinary listings while linked receipts and historical bytes remain retrievable under existing authorization.                         |
| Invoices                       | Owner may discard draft or approved unissued invoices including draft lines and reservations; releases billing locks and returns periods to ready. Issued invoices, payments and adjustments retain their established correction/void lifecycle. |
| Clients / contacts / projects  | Existing creation, editing, contact removal, project assignment/schedule management and client/project lifecycle screens linked from management.                                                                                                 |
| Workers / suppliers            | Existing user access, assignment, supplier and technician editing/removal/restoration screens retained; supplier regression exercised.                                                                                                           |
| Commercial / cash / accounting | Existing effective-dated rules, replacement versions, payments, settlements and accounting revisions linked from management. Financial history remains versioned.                                                                                |

Audit, session, migration and durable-job tables remain system-managed. Full Owner administration does not turn historical financial snapshots into mutable raw SQL records. The UI explains references that require the relevant correction flow. No special protection or permission difference depends on a DEMO/Mock label.

## Search and access

Entity dropdowns (projects, clients, workers/users, suppliers/technicians, contacts, recipients, email/mailboxes) gain a labelled search input. Other long dropdowns also gain search. Matching ignores case and accents and includes both displayed text and option values. The native dropdown, selected value, keyboard behavior and submitted field remain intact. Newly opened dialogs are enhanced automatically. Labels and result counts support EN/ES/PT.

Owner mutations validate the persisted active Owner role and live session, enforce optimistic concurrency, require a reason and confirmation, and write before/after audit data within an immediate transaction. Worker/Finance cannot acquire these permissions by changing form fields. Private receipt access stays limited to its actual worker/project and classification.

## Executed evidence

- Security, invariants, relevant finance/classification/supplier integration and continuity backup/restore: **296 tests / 43 files passed**.
- Final Owner CRUD/document integration and frozen migration contract: **25 tests / 2 files passed**.
- Final artifact jobs, finance hardening and representative migration tests: **24 tests / 5 files passed**.
- Workspace typechecks and ESLint passed. Final Svelte check: 0 errors, 7 pre-existing unused-CSS warnings in BillingSection. Final combined browser rerun: **24/24 passed**; locale regression: **2/2 passed**.
- Browser expense reopen/edit/delete, Worker denial and case/accent-insensitive search: **12 passed**, across 360/390/768/1440 widths.
- Browser domain navigation, milestone and technical-change CRUD: **12 passed**, across the same widths. Existing supplier editing/removal/restoration regression: **8 passed**.
- Fresh schema and populated schema-43 upgrade verified. Migration 44 preserves prior metadata, audit manifest guards and financial cutover configuration.
- Read-only online backup of the production database was upgraded and exercised in an isolated private file: **3 draft invoices discarded, all 11 expenses reopened and deleted**, SQLite integrity `ok`, no foreign-key violations. The real production records were not changed by this test.
- Responsive screenshots in this directory use only disposable test fixtures.

## Review

Reviewed locally without subagents, as explicitly requested. Existing historical fiscal/external acceptance items in the Essential checklist are unaffected by this implementation scope. Production activation and cache cleanup are recorded separately after deployment.
