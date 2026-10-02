# Project worker terms: production browser evidence

Date: 2026-10-02. All agents used for this continuation run GPT 6.1 Sol. Functional checks use the live browser UI only. Source review, TypeScript, lint and production builds are supporting evidence.

## Candidate and fixture

Wave44 archive SHA256: `f5cdcfc6af3ea51d8706b63afe0a9b1e3169e88c5179594b007c6948ea6ee315`.
Source commit: `3832c54`.
Deployment completed with backup, retained rollback images, local/public health and jobs checks.

Owner created synthetic QA project `01a0fbfa-5221-7328-ba7e-9c93e6e6ffd0`, number `C-0048-P-261044`, **QA PERSON TERMS W44 20261002**. EUR, Europe/Madrid, October1–5. No invoice, settlement or payment was issued.

## Observed Owner results

| Browser action                                                         | Observed result                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create with optional defaults and two individual assignment rows       | Project and both worker agreements saved successfully.                                                                                                                                             |
| Enter invalid markup, submit, correct and retry                        | HTTP400 retained project fields, defaults and both assignments. Corrected retry created one project. Error copy exposed technical validation text; a separate follow-up fix awaits browser retest. |
| Choose an already selected worker in another row                       | The duplicate worker option was disabled after DOM updates.                                                                                                                                        |
| Inspect creation table at390,768,1440 pixels                           | No document overflow. Phone fields and labels visually inspected.                                                                                                                                  |
| Change defaults from Oct1 rates to an Oct3 revision                    | Existing Worker5 and Worker6 agreements remained unchanged.                                                                                                                                        |
| Change general project settings                                        | Existing rates, pay and expense terms remained unchanged after reload.                                                                                                                             |
| Save Worker5 terms from Oct3                                           | Current Oct2 values remained; future-terms reminder showed Oct3. Commercial review selected the new rules on Oct3. Worker6 remained unchanged.                                                     |
| Assign Worker7 starting Oct3 using project defaults                    | The new assignment selected revision2. Manual finance fields were disabled and the alternate existing-rule checkbox cleared.                                                                       |
| Set project reimbursement default to none from Oct3                    | Worker6's explicit at-cost override remained. Worker5's earlier at-cost revision remained historical; Oct3 used none.                                                                              |
| Revise bounded Worker5 expense policy from Oct4 with the same Oct5 end | Save succeeded and both old and new dated policies remained visible.                                                                                                                               |

Independent Owner rule review:

| Worker/date    | Customer EUR/h | Internal EUR/h | Worker EUR/h |
| -------------- | -------------: | -------------: | -----------: |
| Worker5 Oct1/2 |           0.05 |           0.03 |         0.02 |
| Worker5 Oct3–5 |           0.07 |           0.04 |         0.03 |
| Worker6 Oct1–5 |           0.10 |           0.06 |         0.04 |
| Worker7 Oct3–5 |           0.15 |           0.12 |         0.09 |

Expense expectations: Worker5 worker-paid EUR1 on Oct2 reimburses EUR1 and charges customer EUR0; Oct3 reimburses/charges EUR0; Oct4 reimburses EUR0 and charges EUR1. Worker6 reimburses EUR1 and charges EUR1.10. These are independent rule expectations; source approval/classification and downstream totals still require observation.

## Supporting checks

Database and portal TypeScript passed. Scoped ESLint, formatting and production portal build passed. The aggregate Svelte check retains58 errors and8 warnings in15 pre-existing files; affected new components and the PM expense page have no reported diagnostics. Production deployment succeeded.

Fresh Worker/Crew, PM privacy, Finance and Auditor outcomes will be appended as their browser checks finish. No existing56 UX /46 bug claim is considered fully reverified from this document or source presence alone. The external `/home/kripta/ja-audit-20261002/reverification/COVERAGE.md` tracks all102 accepted IDs and role-specific pending branches.

Evidence screenshots and detailed oracle are retained under `/home/kripta/ja-audit-20261002/reverification/owner-pm` and `owner-oracle`. Credentials remain in the excluded private account manual.
