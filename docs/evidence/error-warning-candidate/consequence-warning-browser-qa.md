# Consequence warning browser QA

Date: 2026-09-26. Baseline commit: `8669fa3`. The candidate was an uncommitted shared worktree, so this evidence is tied to the Playwright source and test run rather than a final candidate commit.

Playwright Chromium used the repository's disposable SQLite fixture and local SvelteKit build at 390×844 and 1440×900. No production business writes were made. The focused suite is [`tests/e2e/consequence-warning-browser.spec.ts`](../../../tests/e2e/consequence-warning-browser.spec.ts).

| Role and surface             | Browser checks                                                                                                                                 | Result                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Worker, time                 | Spanish draft and week submission warnings, count from live draft list, record-specific review links                                           | Passed at both widths                    |
| Worker, expenses             | Portuguese payer warning separates actual payer, worker reimbursement, and customer billing; selection stays entered                           | Passed at both widths                    |
| Owner and manager, approvals | Approval and return warnings explain factual review versus Finance decisions; review links target the scoped time record                       | Passed at desktop and phone respectively |
| Finance, classification      | Warning explains that customer billing classification does not decide reimbursement                                                            | Passed at both widths                    |
| Finance, billing             | Pre-issue immutable snapshot warning and Spanish audited adjustment warning in the invoice action sheet; phone card and desktop table controls | Passed at both widths                    |
| Finance, accounting          | Spanish and Portuguese versioned artifact warning before Accounting Pack generation                                                            | Passed at phone and desktop respectively |

The suite asserted warning codes, `data-kind="warning"`, rendered wording, available remedies, absence of unexpected form POSTs, and absence of page exceptions. The worker scenario also checked failed network responses against the known disabled offline identity endpoint. The Billing UI fixture changes a disposable draft invoice to `approved` to expose the warning without issuing or sending an invoice.

Commands and results:

```text
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/consequence-warning-browser.spec.ts --project=phone-390 --project=desktop
6 passed (worker, approval, Finance classification)

PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/consequence-warning-browser.spec.ts --project=phone-390 --project=desktop --grep 'invoice issuance|accounting warns'
Accounting 2 passed; Billing phone passed. Billing desktop locator first failed because the UI translated Manage to Gestionar.

PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH corepack pnpm exec playwright test tests/e2e/consequence-warning-browser.spec.ts --project=desktop --grep 'invoice issuance'
1 passed after selecting the row action button independent of locale.
```

The candidate build emitted no Svelte warning in the final runs. Playwright's failure traces stay in ignored local `test-results`; they were not copied here because they can contain authenticated session data. No redacted screenshot set or committed candidate identity has been produced yet, so this packet is focused browser evidence rather than the full release evidence requested for every role and action.
