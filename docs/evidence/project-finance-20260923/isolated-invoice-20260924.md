# Isolated invoice lifecycle browser check — 2026-09-24

This records the first failing run. The later corrected isolated journey is documented in [local-32-step-browser-20260924.md](./local-32-step-browser-20260924.md): steps 1–29 passed, including invoice issue and partial payment; steps 30–32 remained blocked by external operations evidence.

Scope: disposable localhost Playwright fixture only. This run did not connect to the deployed portal database, production SMTP, or a live customer account. It does not establish live issuance, email delivery, payment, reversal, or the full post-clean-slate journey.

Command (pinned Node 24 runtime):

```sh
PATH=/opt/jaautomation/runtime/node/bin:$PATH pnpm exec playwright test --config=playwright.config.ts tests/e2e/client-essential-32-step.spec.ts tests/e2e/invoice-email.spec.ts --project=desktop --reporter=line
```

Result: **1 passed, 1 failed** in 3.5 minutes. `playwright.config.ts` started disposable site and portal previews on localhost:4173/4174; global setup seeded a separate E2E SQLite database and removed it after the run. The fixture lock was released. The failed test retained `test-results/client-essential-32-step-C-97fa0-d-fixture-covers-steps-1–32-desktop/trace.zip` and `error-context.md`.

| Check | Result | Evidence and limit |
|---|---|---|
| `invoice-email.spec.ts` | PASS | Finance selected “no” and no `invoice.email.requested` outbox event appeared; selecting “yes” caused exactly one event. The invoice state and `sent_at` stayed unchanged and the UI said “Email queued.” This proves browser queueing behavior, **not SMTP delivery or sent-state completion**. The recipient was `finance-desktop@example.test`. |
| 32-step browser journey | FAIL | The aggregate assertion found 15 failed/blocked steps; earlier controls changed and the journey did not reach actual invoice issue or payment. The test collects all step results before failing, so later rendered pages cannot be treated as a successful causal journey. |

Direct journey failures: step 4 attempted to fill a now-hidden `plannedMinutes` input ([test line 499](../../../tests/e2e/client-essential-32-step.spec.ts)); step 5 similarly filled hidden `revenueBudgetMinor` (line 525); step 7 could not find `form[action="?/assignProjectLegalEntity"]` (line 612); step 12 could not find a `startTime` input in the current time form (line 893); steps 20–21 could not find `expensePreset` selects in the classification UI (lines 1282 and 1321); step 26's Accounting Pack action returned HTTP 400 with a reconciliation/readiness message (line 1717). These are observed browser failures; some selectors appear stale after the new project/time/finance UI, but the test run alone does not prove that all corresponding product actions work through the new controls.

Causal blocks: steps 17–18 lacked the step-12 time-entry ID; step 22 lacked the labor billing scope from steps 10/12; step 23 could not issue without the step-22 signed customer report; step 24 could not record payment without an issued invoice. Steps 30–31 lacked an operator evidence JSON, and step 32 lacked `JA_E2E_CADDY_BASE_URL`; these are external prerequisites, not local browser pass/fail evidence for the deployed origin.

The intended issue assertion in step 23 requires an approved draft, signed customer report, successful `issueInvoice` POST, issued-state row, source linkage and snapshot hashes ([test line 1591](../../../tests/e2e/client-essential-32-step.spec.ts)). The intended payment assertion in step 24 submits `1.00` and checks a partially-paid or paid row (line 1653). **Neither assertion executed to completion in this run.** This pair of specs contains no actual reversal/credit action or production mail delivery assertion.

Follow-up: update the affected 32-step browser interactions to the current visible controls without weakening their business assertions, rerun the isolated journey, and separately verify any authorized live QA-only issue/send/payment path and resulting state. Do not classify outbox queueing as delivery.
