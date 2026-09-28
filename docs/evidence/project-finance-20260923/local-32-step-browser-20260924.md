# Isolated 32-step browser journey — 2026-09-24

**Verdict: 29 PASS, 3 BLOCKED; overall Playwright exit 1.** The desktop Chromium run of `tests/e2e/client-essential-32-step.spec.ts` completed against its disposable local fixture, not the deployed app. Command: `pnpm exec playwright test --config=playwright.config.ts tests/e2e/client-essential-32-step.spec.ts --project=desktop --reporter=line` using pinned Node. The working tree included uncommitted changes on base revision `056c1e4`; this is not a production-release certification.

| Step(s) | Result | Evidence or limit |
|---|---|---|
| 1–29 | PASS | The browser created a UAT client/project, assigned and configured a worker, recorded time and two expenses, applied person expense policies, approved records, closed the labor period, generated/rendered/approved the customer report, recorded its verified signed copy, created/approved/issued the invoice, recorded a partial payment, and generated a new Accounting Pack. The isolated database reached `all_in` and `reimbursable_at_cost` expense classifications and the UAT invoice state `partially_paid`. Every assertion in these steps completed. |
| 30–31 | BLOCKED — external evidence | The gate requires current operator evidence for automatic jobs and continuity; `JA_E2E_OPERATIONS_EVIDENCE` was not supplied. Local queue processing and historical evidence do not establish the production result. |
| 32 | BLOCKED — external evidence | `JA_E2E_CADDY_BASE_URL` was not supplied; local preview cannot prove the deployed Caddy boundary. |

Earlier runs exposed stale test controls and an incorrect invoice sequence. The test now uses visible currency/hour budget fields, selects interval mode for timed work, chooses the project issuing-authority task, configures bounded per-person expense policies, and verifies the policy-derived expense treatment. It closes the period and prepares the customer report **before** creating the invoice draft; closing after draft approval had correctly made that draft stale. With the corrected sequence, the previous step-22 `stale_billing_configuration` and step-26 Accounting Pack HTTP 400 did not recur.

The test file passes Prettier and `git diff --check`. No production database or mail service was touched by this test lane. Existing separate isolated browser tests cover invoice-email queueing and payment reversal; this 32-step run proves invoice issue and partial payment, not SMTP delivery or reversal.
