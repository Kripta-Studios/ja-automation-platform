# Owner and Finance navigation QA (QA-A)

Date: 2026-10-07. Source: `/home/kripta/ja-navigation-assistant-20261007` at commit `830b32a8`; isolated detached QA worktree: `/home/kripta/ja-assistant-qa-owner-20261007`. The lane changed only its browser harness/tests plus the matcher overlay explicitly authorized by root. No production database, production account, deployment, or parent source worktree was accessed or modified. Playwright used disposable Owner/Finance E2E credentials and isolated fixture data. Assistant navigation was the only business interaction; no business POST was observed.

## Outcome

The focused suite defines 6 journeys across 4 viewport projects (360, 390, 768, 1440), 24 cases total. The initial run was terminated by SIGTERM after 15 cases: 10 passed, 5 failed. It covered all six phone-360 cases, all six phone-390 cases, and the first three tablet-768 cases; the desktop project did not start. A separate tablet-768 diagnostic placed a native-dialog listener around leaving the untouched invoice-create surface. It observed no dialog and reached the Portuguese Time route. That diagnostic then stopped at a QA-only heading assertion that expected English “Time” for `lang=pt`; the assertion was corrected to “Horas”, but root requested that no further browser runs be started. The latest diagnostic JSON and Playwright HTML report are preserved.

Root identified and fixed the mobile launcher stacking defect exposed by this lane: the launcher had z-index 38 below ResponsiveSheet z-index 50; root raised it to 51 (notice 52) and added a click-based dirty-draft regression. Root also confirmed the Finance failures were QA selector/base-URL assumptions. This lane's source now uses the actual client-rate controls and a canonical `view=overview` baseline; root's integrated suite will provide post-fix browser verification.

## Role, phrase, and action coverage

| Role    | Query / locale                                                                            | Intended action                                         | Evidence/status                                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner   | “I wannt create a new project for a client” / EN                                          | Open new project form                                   | Passed at 360 and 390; matching status, destination controls, focus, and viewport checked.                                                                                                                 |
| Owner   | “Quiero añadir un cliente nuevo” / ES                                                     | Open new client form                                    | Passed at 360 and 390.                                                                                                                                                                                     |
| Owner   | “Quero criar um rascunho de fatura” / PT                                                  | Open invoice draft controls                             | Passed at 360 and 390; untouched-form navigation diagnostic observed no native confirmation.                                                                                                               |
| Owner   | “Quero registar horas no projeto” / PT                                                    | Open time entry form                                    | Passed at 360 and 390.                                                                                                                                                                                     |
| Owner   | “Quero lançar uma despesa no projeto” / PT                                                | Open expense entry form                                 | Passed at 360 and 390.                                                                                                                                                                                     |
| Owner   | “edit a project” / EN                                                                     | Choose a project record, open its edit controls         | Passed at 360, 390, and 768.                                                                                                                                                                               |
| Owner   | “invoice”; nonsense; EN/ES/PT negated prompts                                             | Show explicit choices or fallback, do not auto-navigate | Passed at 360, 390, and 768. Matching status was required before clicking supported phrases.                                                                                                               |
| Finance | “Quiero crear una tarifa de mano de obra para cliente” / ES                               | Open client labor-rate configuration                    | Matched and reached the configuration. Original assertion guessed a visible project selector; actual `projectId` is hidden and the visible controls are worker dropdown/rate input. QA selector corrected. |
| Finance | “Quero criar uma regra de custo interno” / PT; “create an internal loaded cost rule” / EN | Open internal loaded-cost configuration                 | Defined in suite but not reached in the initial run because the Spanish selector assertion stopped that scenario. Parent's integrated suite covers final behavior.                                         |
| Finance | Unsupported owner-only account/mailbox prompt                                             | Exclude canonical-owner actions                         | Passed at 360 and 390.                                                                                                                                                                                     |
| Owner   | Dirty time draft then open Finance task                                                   | Cancel route, retain draft, submit no business POST     | Initial click was blocked by mobile launcher layering at 360/390. Root fixed the defect and will verify click-based cancellation in its integrated suite.                                                  |

## Exact findings and harness corrections

- Phone-360 Finance ES reached `/finance?view=commercial&task=Client+labor+rate&lang=es`; the selected client labor-rate configuration was visible. The failed locator was `form[action*="createClientLaborRate"] select[name="projectId"]`. Product markup uses a hidden `projectId`, visible `select[name="workerId"]`, and visible `#finance-client-rate`. The QA source now asserts those actual controls.
- Phone-390 Finance's pre-navigation assertion captured `/finance?lang=es`, while app hydration normalized it to `/finance?lang=es&view=overview`. The QA source now starts at explicit `view=overview` and records the URL after opening the assistant.
- Dirty-form pointer repro: after choosing `time-create` on `/time?lang=en` and filling `[name="summary"]` with `QA draft that must remain after cancellation`, Playwright found the visible/enabled launcher but the underlying `form[action="?/createTime"][data-assistant-target="time-create"]` intercepted every click retry. No assistant navigation or native cancellation dialog was reached. Root fixed the z-index ordering and will verify click-based cancellation.
- Untouched-invoice direct navigation repro: a listener registered immediately before `page.goto('/time?lang=pt')` saw zero dialogs; navigation reached the Time route. That rerun's only failure was the English heading expectation, now corrected to Portuguese “Horas”. No confirmation defect was found on this path.
- Initial run console counts: 10/15 completed cases passed, 5 failed for the Finance harness assumptions and mobile pointer layering; SIGTERM arrived before tablet Finance and all desktop cases. A separate diagnostic JSON records its locale-heading-only harness failure.

## Verification and artifacts

The focused command used a portal-only preview on isolated port 4176:

```sh
PATH=/opt/jaautomation/runtime/node/bin:$PATH NODE_OPTIONS=--experimental-transform-types pnpm exec playwright test --config=playwright.assistant.config.ts tests/e2e/owner-finance-navigation.spec.ts --project=phone-360 --project=phone-390 --project=tablet-768 --project=desktop
```

The native-dialog diagnostic used:

```sh
PATH=/opt/jaautomation/runtime/node/bin:$PATH NODE_OPTIONS=--experimental-transform-types pnpm exec playwright test --config=playwright.assistant.config.ts tests/e2e/owner-finance-navigation.spec.ts --project=tablet-768 --grep='owner natural phrases open localized'
```

Initial mobile screenshots and trace are retained in `initial-attempt-browser-artifacts/`; the Playwright HTML report is `report/index.html`; the one-test native-dialog diagnostic JSON is `tablet-768-goto-dialog-diagnostic.json`. QA test/config sources and matcher overlay are copied to `qa-source/`. The lane's preview server on 4176 was stopped. Synthetic fixtures stayed in the isolated worktree; no production migration/data changes occurred.

Remaining verification: this lane stopped before desktop and before Finance PT/EN controls after root requested resource isolation. Root's final integrated browser suite is the source of post-fix acceptance for Finance and click-based dirty-form behavior. Root's current matcher/unit matrix covers later matcher refinements.
