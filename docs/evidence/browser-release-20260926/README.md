# Disposable browser QA receipt — 2026-09-26

Chromium and Playwright exercised the portal through visible controls, form submissions, browser requests, and UI state. All writes used an isolated disposable SQLite fixture at `/tmp/ja-qa-continue-20260926`. Production was used only for the read-only Caddy boundary GET in step 32. No production account or data was changed.

## Result

| Browser run                                                        | Result                                             | Scope                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final Client Essential desktop journey with operator evidence      | **32/32 step bodies passed; overall suite passed** | All browser steps passed, including automatic jobs evidence, Owner-waived continuity with local safeguards, and the read-only deployed Caddy boundary.                                                              |
| Earlier Client Essential desktop journey without operator evidence | **30/32 step bodies passed; overall suite failed** | Steps 1–29 and 32 passed. Steps 30 and 31 could not run without fresh external operations evidence.                                                                                                                 |
| Finance tax profile and billing stream click path                  | **1/1 passed**                                     | Created a global USD 8.25% profile, saw it in the directory and billing stream selector, and kept the Configure billing tab after save.                                                                             |
| Native tax profile validation recovery                             | **1/1 passed**                                     | Finance forced a document POST with a one-character name and 7.5% rate. HTTP 400 preserved visible 7.5 and hidden 750; correcting the name saved an active USD profile with 750 basis points.                       |
| Owner approval and Finance payment recovery                        | **4/4 passed**                                     | Phone 390 and desktop, with actual form errors and stale-state recovery. These were run against an earlier Billing overlay; the later Billing setup change was covered by the focused tax test and 32-step journey. |
| Enhanced project save with blocked `sessionStorage`                | **1/1 passed**                                     | Phone 390; action POST succeeded, stale-state notice focused, entered value retained, no page exception. This used an earlier project overlay.                                                                      |
| Native invalid invoice void recovery                               | **1/1 passed**                                     | Phone 390; HTTP 400, one scoped notice, reason and drawer scroll retained, no page exception. This used an earlier Billing overlay.                                                                                 |

The desktop journey’s step 29 checked responsive widths 360, 390, 768, and 1440. The 32-step spec intentionally skips non-desktop Playwright projects. The separate recovery runs supplied direct phone testing.

The final run used operator evidence file `/var/tmp/ja-ops-evidence-eb11e67-20260926.json` (raw-file SHA-256 `e65c723afb6759e6d1774c8c80fe3a456b7136d339f3e104223555d205553324`; canonical contract SHA-256 `4fc36edd0d447cd921b674aa5200fcb929a9ae06be056f36f3f83b90fbe4d112`). The preflight matched independently supplied tenant `jaautomation` and deployment `production-vps`. It validated two recent automatic job runs and an **Owner waiver** of remote continuity, with local backup and rollback checks. A waiver is the evidence route taken here; this run does not claim that a remote restore drill passed. The earlier two failures were `OPERATIONS_EVIDENCE_MISSING`, not browser form failures.

## Source and command

The isolated copy began at HEAD `dbe849956c150c76dbea0898de1605e3daaf1006`, tracked diff SHA-256 `6170630b68c95eec0c142fb874ff4f55aa0a3173ed3a2662cc4a74b41f4d6f56`, and untracked content manifest SHA-256 `46473cfa533865c27853e6199f53e24e91a070d71284f9551183b38276c52bac`. Later shared files were copied into the isolated build immediately before the focused tax and final desktop runs:

| File in isolated copy                                       | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/portal/src/lib/portal/sections/BillingSection.svelte` | `6e44ee4804cd039b71f50a88fa47ff5168c97f1c814287eb06a0967f39659d29` |
| `packages/database/src/repository.ts`                       | `006e39be9e2077721cfaad8c6ff7f98c607d4eb8faa8c1f3ef8a2a276af16918` |
| `apps/portal/src/routes/app/projects/[id]/+page.svelte`     | `7783d9edec37b816a28ce510d8d4c6abc159f461c74ac4cc7fd9484b92e46868` |
| Shared `tests/e2e/client-essential-32-step.spec.ts`         | `2b68774f140f41728278af5ae8f50890274bb6ce12a41dd1c40c828506cf6525` |
| Isolated UAT spec, QA port and timeout edits only           | `b9e4a135e919b15ef0c7be24dd717edb5cd35f51f9d0e41c6a5cc5506cc70e6b` |
| Isolated `tests/e2e/auth.ts`, QA port edit only             | `2b493f52d2a0a4e57755855d96a83fefa48b93c555b1db80dc1f718d5c74372e` |
| Isolated focused tax browser spec                           | `bcb04ad9e9546d6fa134ec38a2df9a830e5176c4703f52a74098823d0dd8281a` |
| Isolated `playwright.pending.config.ts`                     | `b2ad602359fc0afd7bb84c0f0b8b58fdb9577903b71704fb804fc833b3211531` |
| Isolated `tests/e2e/pending-global-setup.ts`                | `0025caf0269f06dca7a84f136b69abc342d2cc23d35cdf409cefa22907b8898f` |
| Isolated portal build entrypoint for 30/32 UAT              | `7ee538a7cb6916ea3bae8348036d1dd0df4b8edd18c13abf4cf00884e670071e` |

The later native validation recovery run used these additional shared source overlays in a newly built isolated portal:

| File                                                        | SHA-256                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/portal/src/lib/portal/sections/BillingSection.svelte` | `6c482de9b4ee158ebcf777ede3940532114ce45fb305bdbbeb7efda6fefacf4e` |
| `apps/portal/src/lib/server/actions/billing-actions.ts`     | `a436ac517c936413b92833ed0c42e583c48976884552ef1410aabf144ed809a5` |
| Isolated focused native recovery browser spec               | `28bda3fe3e17ff67b0144d57410a2103a7a2e358fee70f5055bb945c8045e3c3` |
| Isolated portal build entrypoint                            | `d8623125718d91ee19c7c5c337ce81eb462163fd6b50243a61e3d1b1f12a2a06` |

The custom QA config serializes disposable fixture setup before launching the portal on port 4185. This avoids a race between the standard `webServer` and global fixture migration on a fresh SQLite database. Both runs used one Chromium worker in `/tmp/ja-qa-continue-20260926`:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test tests/e2e/pending-tax-profile-ui.spec.ts --config playwright.pending.config.ts --project=desktop --workers=1 --reporter=line --output=tax-profile-fixed-results
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH JA_E2E_CADDY_BASE_URL=https://j-aautomation.com pnpm exec playwright test tests/e2e/client-essential-32-step.spec.ts --config playwright.pending.config.ts --project=desktop --workers=1 --reporter=line --output=uat-tax-fixed-results
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test tests/e2e/pending-tax-native-recovery.spec.ts --config playwright.pending.config.ts --project=desktop --workers=1 --reporter=line --output=tax-native-recovery-results
env -u JA_E2E_FIXTURE_TOKEN -u JA_E2E_DATABASE_PATH -u JA_E2E_DOCUMENT_ROOT JA_E2E_OPERATIONS_EVIDENCE_PATH=/var/tmp/ja-ops-evidence-eb11e67-20260926.json JA_E2E_OPERATIONS_TENANT_ID=jaautomation JA_E2E_OPERATIONS_DEPLOYMENT_ID=production-vps JA_E2E_CADDY_BASE_URL=https://j-aautomation.com PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test tests/e2e/client-essential-32-step.spec.ts --config playwright.pending.config.ts --project=desktop --workers=1 --reporter=line --output=uat-ops-evidence-results
```

`browser-results.json`, `final-uat-result.json`, `playwright-final-last-run.json`, `approval-phone-390.json`, `payment-phone-390.json`, and `tax-native-recovery.json` contain selected browser observations. The final raw Playwright log remains in the disposable QA directory and has SHA-256 `24681a8046a0d9c246de2140dd9e8721839bf23857a27b9641073f980cd00115`. The native recovery run proved the first POST was a browser `document` request (HTTP 400) and the corrected submit was an enhanced `fetch` request (HTTP 200). The visible directory confirms that the saved profile exists, while the fixture database confirms its rate; the directory does not display numeric component rates. Raw traces, full screenshots, and fixture logs stay in the disposable QA directory because they may include account names or client data. The isolated browser saw `/j-aautomation/app/api/offline/identity` return HTTP 503 and show a sync warning, but no page exception; this may depend on QA offline configuration and was not classified as a production defect.
