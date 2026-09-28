# Semi-monthly billing rule: independent browser QA

Frozen product and catalog commit: `db135569882e49f323ff8391cd2de7bac0c7c64c` (tree `46eb27939b784a817fc4d038be77a72a0f6b9278`). Playwright used this exact commit in an isolated worktree with a fresh disposable database. The project and supported billing stream were created through the rendered application. A direct edit to the disposable database modeled an older saved split for the Auditor warning check. No production data was used.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/billing-semi-monthly-postfix-browser/playwright.config.ts --reporter=line
```

Final run: three passed and three intentionally skipped by viewport selection. Finance was tested at 390 px in English with SvelteKit enhanced submission; Owner was tested at 1440 px in Spanish with native submission; Auditor was tested at 1440 px in English for the historical warning and denied action. Redacted response and geometry records are in `results-*.json`. Screenshots crop the notices or reason field. Traces were disabled.

- The new picker offers only `1_15_16_end`, with translated help explaining both halves of the month. An injected legacy `1_15` Finance choice and an injected blank Owner choice returned `BILLING_SEMI_MONTHLY_RULE_INVALID` with the translated explanation, `semiMonthlyRule` field error, and Review billing setup remedy. Project, stream, cadence, dates, issuer, currency, payment terms, PO reference, and the attempted split remained in the form. The setup tab stayed selected, focus moved to the invalid select, and its adjacent error was visible. The Finance JSON action returned failure status 400; the Owner native POST returned HTML status 400. Neither used generic validation wording. No billing rule or audit event was added by either rejected submission.
- The above-form problem notice sat above the viewport after scroll restoration on the phone (top −812 px, bottom −640 px); the focused field and translated field error remained in view. On desktop, the notice was partially visible (top −67 px, bottom 65 px). This is a geometry observation for single-field errors, not a failed interaction.
- The Auditor saw an active historical stream warning explaining that its saved split is not applied and instructing them to ask Finance. It offered `contact_finance` as text, with no setup link or setup tab. An invalid direct Auditor POST returned `BILLING_READ_ONLY_ROLE` with `contact_finance` and no rule or audit write. Once the disposable historical stream was marked archived, the warning disappeared.
- There were no browser page exceptions or console errors. The disposable fixture's offline identity endpoint returned its expected 503.
