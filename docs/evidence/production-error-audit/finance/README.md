# Production finance and billing message audit

Observed on 26 September 2026 at `https://j-aautomation.com/j-aautomation/app` in an isolated headless Chromium context. The Finance Administrator and Read-only Auditor accounts are documented test roles. This audit used read-only navigation and deliberately invalid submissions; no business record was created, approved, issued, paid, archived, or changed. Raw credentials, cookies, record IDs, request bodies, and customer names are excluded from this evidence.

## Finance Administrator, English, 390 × 844

The [redacted case data](invalid-submissions-redacted.json) records the visible notices, response status and problem code, focus, and scroll position for ten rejected submissions. The billing and Accounting requests used SvelteKit enhanced forms, whose HTTP response was 200 with a failure envelope carrying action status 400. The commercial requests were native form posts returning HTTP 400 HTML. Their HTML contained stable codes and message keys; extraction retained only those identifiers.

| Route / action                                    | Live problem code                                        | Visible result                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commercial / `createCanonicalLegalEntityRevision` | `FINANCE_LEGAL_ENTITY_REVISION_FIELDS_INVALID`           | “Review the issuing legal entity's dates, identity, currency, address, and reason.” Remedy: “Correct the highlighted field.”                       |
| Commercial / `assignProjectLegalEntity`           | `FINANCE_PROJECT_LEGAL_ENTITY_ASSIGNMENT_FIELDS_INVALID` | “Review the project issuing authority and effective period.” Same remedy.                                                                          |
| Commercial / `createProjectCommercialPolicy`      | `FINANCE_PROJECT_COMMERCIAL_POLICY_FIELDS_INVALID`       | “Review the project's commercial policy fields.” Same remedy.                                                                                      |
| Commercial / `setProjectReimbursementDefault`     | `FINANCE_PROJECT_REIMBURSEMENT_FIELDS_INVALID`           | “Review the project worker reimbursement mode, version, and reason.” Same remedy.                                                                  |
| Commercial / `settleCompensation`                 | `FINANCE_SETTLEMENT_PERIOD_FIELDS_INVALID`               | “Review the worker compensation settlement period.” Same remedy.                                                                                   |
| Commercial / `createCompensationRule`             | `FINANCE_COMPENSATION_RULE_FIELDS_INVALID`               | “Review the worker compensation rule's rate, scope, and effective dates.” Same remedy.                                                             |
| Commercial / `createClientLaborRate`              | `FINANCE_CLIENT_LABOR_RATE_FIELDS_INVALID`               | “Review the customer labor rate's scope, amount, and effective dates.” Same remedy.                                                                |
| Commercial / `createInternalCostRule`             | `FINANCE_INTERNAL_COST_RULE_FIELDS_INVALID`              | “Review the internal cost rule's scope, amount, and effective dates.” Same remedy.                                                                 |
| Billing setup / `createBillingRule`               | `BILLING_STREAM_FIELDS_INVALID`                          | “Check the billing stream fields and choose valid project, cadence, currency, and dates.” Field summary and “Review billing setup” remedy visible. |
| Accounting / `createAccountingPack`               | `BILLING_ACCOUNTING_PERIOD_TOO_SHORT`                    | “Choose an accounting period of at least two calendar dates.” Focus on period end and “Review accounting pack” remedy.                             |

### Priority finding

All eight commercial responses have specialized codes, but the native reload returned the viewport to scroll position 0 for six forms that began 1,294–2,128 px down the page. It focused the top “Action needed” notice and showed only the generic remedy “Correct the highlighted field”; no field-level error was visible. For forms accessed through the Commercial policies task selector, the selected task reset to the default Project issuing authority view, hiding the attempted form. The create-revision disclosure also closed. Retention of nonempty entered values was not measured in these cases and needs a focused regression check.

The billing and Accounting enhanced failures showed field-level feedback and task-specific remedies. Their scroll moved as focus changed; the audit does not classify that movement as a defect without a longer-form scenario.

## Read-only Auditor, English, 390 × 844

The auditor loaded Economic Review, Commercial Configuration, Billing setup, and Accounting with HTTP 200 and zero visible POST forms. Approvals returned HTTP 403 with “Your account does not have access to this page. Return to a section available to your role.” and a Back link. This is a role-safe page-level instruction, although the page title itself is the generic “Error.”

## Locale and access constraint

The Spanish and Portuguese desktop authenticated checks were not completed. After repeated production test-account sign-ins, the login flow returned its rate-limit guidance in the selected language: “Demasiados intentos de acceso. Espera unos minutos antes de intentarlo de nuevo.” and “Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.” The [redacted navigation log](role-locale-navigation-redacted.json) records that constraint. Further sign-ins were stopped. A later audit should reuse one authorized browser context and wait for the normal rate-limit window instead of retrying.

No screenshots or traces were retained because they would contain live financial and customer data. The evidence is the redacted browser observation log, with the action and response identifiers needed for a later regression check.
