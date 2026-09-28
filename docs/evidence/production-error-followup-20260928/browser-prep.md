# Production Finance browser preparation — 2026-09-28

Read-only Playwright inspection used a fresh Finance Administrator browser context against the current production site. It signed in through the normal portal UI, opened the exact Finance project and task views, and did **not** submit either rule form. No production finance data changed during this inspection. The browser recorded HTTP 200 for all three inspected views and zero uncaught page errors.

## Verified project and worker choices

| Finance project view                                | Task                 | Verified worker choices                                                |
| --------------------------------------------------- | -------------------- | ---------------------------------------------------------------------- |
| Junkers OHIO (`C-0020-P-004`)                       | Internal loaded cost | Anesio Barreto                                                         |
| QA ERROR AUDIT 20260926 Project (`C-0043-P-260926`) | Internal loaded cost | QA Worker 1; QA Worker 2                                               |
| QA ERROR AUDIT 20260926 Project (`C-0043-P-260926`) | Worker compensation  | QA Worker 1; QA Worker 2; project scope already selects the QA project |

The task query parameter selects the proper form: `/j-aautomation/app/finance?view=commercial&project=<project-id>&task=Internal%20loaded%20cost` or `task=Worker%20compensation`.

## Exact browser fields

- Task selector: `#finance-configuration-task`.
- Internal loaded cost form: `form:has(#finance-internal-worker)`. Required worker `#finance-internal-worker`, currency `#finance-internal-currency`, visible decimal hourly cost `#finance-internal-cost`, cost method `#finance-internal-method`, overtime method `#finance-internal-overtime`, and start date `#finance-internal-effective`. The visible decimal cost updates the hidden `hourlyRateMinor` input. Select `None` for overtime on these regular-only source rows; the default is `Base rate multiplier`.
- Worker compensation form: `form:has(#finance-comp-worker)`. Worker `#finance-comp-worker`, project `#finance-comp-project`, currency `#finance-comp-currency`, rule type `#finance-comp-ruletype`, visible decimal rate `#finance-comp-rate`, rate basis `#finance-comp-ratebasis`, settlement trigger `#finance-comp-trigger`, overtime method `#finance-comp-overtime-method`, start date `#finance-comp-effective`. The visible decimal rate updates hidden `rateMinor`. The verified defaults are Hourly rule, Hourly basis, Approved billable labor trigger, and None overtime.
- **Current production has no visible Effective to or Notes controls in either creation form.** The candidate source has `#finance-internal-effective-to`, `#finance-internal-notes`, `#finance-comp-effective-to`, and `#finance-comp-notes`. Wait for deployment and verify these four controls before submitting the provisional rates. Their absence would leave the estimates open-ended and unlabeled.

## Five owner-authorized provisional entries after deployment

Each new rule must be explicitly scoped to the named project and worker, and `Notes` must begin exactly `Owner-requested provisional estimate; confirm actual rate before final finance review.` Use the end dates to avoid open-ended provisional rules. These amounts are owner-authorized estimates, not verified payroll facts.

| Project                         | Worker         | Rule                 | Currency | Hourly amount | Effective from | Effective to | Additional fields                                                                   |
| ------------------------------- | -------------- | -------------------- | -------- | ------------: | -------------- | ------------ | ----------------------------------------------------------------------------------- |
| Junkers OHIO                    | Anesio Barreto | Internal loaded cost | USD      |         35.00 | 2026-09-17     | 2026-09-26   | Cost method `loaded_cost`, overtime `NONE`                                          |
| QA ERROR AUDIT 20260926 Project | QA Worker 1    | Internal loaded cost | EUR      |         28.00 | 2026-09-26     | 2026-09-26   | Cost method `loaded_cost`, overtime `NONE`                                          |
| QA ERROR AUDIT 20260926 Project | QA Worker 2    | Internal loaded cost | EUR      |         30.00 | 2026-09-26     | 2026-09-26   | Cost method `loaded_cost`, overtime `NONE`                                          |
| QA ERROR AUDIT 20260926 Project | QA Worker 1    | Worker compensation  | EUR      |         20.00 | 2026-09-26     | 2026-09-26   | Rule type Hourly, rate basis hourly, trigger Approved billable labor, overtime None |
| QA ERROR AUDIT 20260926 Project | QA Worker 2    | Worker compensation  | EUR      |         22.00 | 2026-09-26     | 2026-09-26   | Rule type Hourly, rate basis hourly, trigger Approved billable labor, overtime None |

The existing Junkers USD 25/hour worker compensation rule stays in place. Before each save, confirm the selected project and worker by visible name, visible decimal amount, matching hidden minor-unit amount, currency, start/end dates, and provisional Note. After each save, check the success message and rule list, then read the Finance projection and audit trail. Check for existing matching rules to avoid overlap before any retry. If the network result is uncertain, reload and inspect the list rather than blindly resubmitting.
