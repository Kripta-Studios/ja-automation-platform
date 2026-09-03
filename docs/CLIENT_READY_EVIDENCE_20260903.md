# Client Essential candidate evidence — 2026-09-04

## Status

**BLOCKED — not `CLIENT READY`.**

Qualification began at candidate `3d87690f48053426d103f89894a078118ccade35` on branch
`codex/v3-production-completion-orchestrated-20260819`; the latest numbered migration is
`0035_stalwart_mail_integration.sql`. The initial clean-candidate run exposed executable local defects.
The final evidence below is for the explicitly authorized, uncommitted remediation worktree derived
from that SHA, not an assertion that the untouched commit now passes. No commit or deployment occurred.

## Runtime and safety preflight

Observed worker profile: `gpt-5.6-terra`, high reasoning effort; unrestricted filesystem and disabled
approval sandbox profile. No production database, config, mail, DNS, service, or container was changed.

```sh
PATH=/opt/jaautomation/runtime/node/bin:$PATH node --version
PATH=/opt/jaautomation/runtime/node/bin:$PATH corepack pnpm --version
```

Output: `v24.19.0`, `11.22.0`. The runtime has no bare `pnpm` shim. All gates therefore used:

```sh
PATH=/tmp/ja-corepack-pnpm.akhT0b:/opt/jaautomation/runtime/node/bin:$PATH \
  corepack pnpm --config.verify-deps-before-run=warn <command>
```

The temporary non-secret shim is outside the repository and only lets child scripts resolve Corepack pnpm.
Every pnpm invocation warned that `node_modules` is structurally out of sync with the lockfile; no
install, purge, or dependency repair was performed. Disk stayed above the 1.5 GiB stop threshold
(6.6–6.7 GiB free during the final gates).

## Final local gates

The full unit, integration, security, migration and supporting suites were rerun after the bounded
corrections. Build results remain the prior green baseline because the final delta is covered by the
post-remediation typecheck, lint, format and browser build/journey below.

| Command                            | Exit | Evidence                                                                                                     |
| ---------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------ |
| `run test:unit`                    | 0    | 119 files / 708 tests passed.                                                                                |
| `run test:integration`             | 0    | 51 files / 358 tests passed.                                                                                 |
| `run test:security`                | 0    | 29 files / 177 tests passed.                                                                                 |
| `exec vitest run tests/migrations` | 0    | 11 files / 84 tests passed.                                                                                  |
| `run test:reporting`               | 0    | 1 file / 5 tests passed.                                                                                     |
| `run test:invariants`              | 0    | 1 file / 1 test passed.                                                                                      |
| `run test:offline`                 | 0    | 3 files / 8 tests passed.                                                                                    |
| `run test:continuity`              | 0    | 1 file / 16 tests passed; local-only continuity drill.                                                       |
| `run typecheck`                    | 0    | 10 workspace typechecks completed.                                                                           |
| `run lint`                         | 0    | `eslint .` completed.                                                                                        |
| `--filter @ja/site build`          | 0    | Optimized build generated 255 static pages.                                                                  |
| `--filter @ja/portal build`        | 0    | Production build passed with disposable DB/document-root, tenant/deployment and invalid build-origin values. |
| `run jobs:build`                   | 0    | `jobs-run.mjs` 1,395.92 kB (273.05 kB gzip).                                                                 |

The Portal build received only disposable values: a `/tmp` SQLite path and document root, fixed
non-production tenant/deployment UUIDs, `JA_OFFLINE_ENABLED=false`, build-only origin, and non-production
build secret. No production value was read or printed.

## Browser release gates

Both commands use repository-created disposable E2E database/document fixtures and the non-secret
`JA_E2E_CADDY_BASE_URL=https://j-aautomation.com` value.

```sh
pnpm exec playwright test tests/e2e/client-essential-32-step.spec.ts --project=desktop --reporter=line
pnpm exec playwright test tests/e2e/ui-multirole-accessibility-matrix.spec.ts \
  --project=phone-360 --project=phone-390 --project=tablet-768 --project=desktop --reporter=line
```

The 32-step command exits 1 intentionally because its final aggregate assertion retains unavailable
external proof as failures. Its actual result is local **PASS for steps 1–29 and 32**, with exactly:

- Step 30 `automatic-jobs`: `OPERATIONS_EVIDENCE_MISSING` for automatic production job evidence.
- Step 31 `continuity-backup`: `OPERATIONS_EVIDENCE_MISSING` for separate-host encrypted backup and
  isolated restore evidence.

The Owner explicitly waived separate-host/off-site continuity as a nonblocking post-release improvement on
2026-09-04. Step 31 remains a truthful advisory failure, not a release blocker.
The verified local online backup and isolated restore drill remain part of the deployment safety baseline.

The responsive/accessibility matrix exits 0: **20/20** role/viewport combinations pass at 360, 390,
768, and 1440 px. This rerun verifies axe, keyboard, overflow, reduced-motion, CSP runtime behavior,
contrast, and 44 px phone touch targets.

## Post-remediation delta evidence

After the full-suite baseline, five bounded fixes changed document download audit ordering, nonzero tax
edit/resubmit preservation, generic inline-view disposition, progress pseudo-selector compatibility, and
invoice identity assertion semantics. Focused final evidence is **4 files / 29 tests PASS**:
`finance-planning-actions`, `private-download`, `private-document-route-hardening`, and
`private-artifact-routes`; it includes 400/1000/2100 canonical tax-BPS resubmits and truthful download
audit ordering. The complete unit, integration, security and migration suites, the 6-file/30-test
supporting gate, typecheck, lint and format/diff checks were rerun after this delta. The 32-step journey
was also rerun with the live Caddy base URL: steps 1–29 and 32 pass; only the expected operations-evidence
markers at steps 30–31 remain.

## Earlier remediations proven by the final gates

- Installed Playwright Chromium and `pdftotext` availability resolved the prior renderer/environment
  blocker; reporting and offline gates now pass.
- Private document download/scan routes and fail-closed storage error normalization resolved the prior
  route-shape/security failures.
- Browser contracts now validate persisted commercial/rate/classification/payment state, invoice identity,
  the ledger table, and the valid payment-details summary control.
- Empty optional commercial identifiers normalize before persistence, and UI-only `taxPercent` is removed
  before the strict finance action boundary.
- Native progress elements replace CSP-blocked dynamic inline styles; selected Billing summary contrast and
  worker-payment touch targets meet the matrix requirements.

## External gates still blocked

No direct candidate evidence exists yet for two automatic production job cycles, the new release running
behind live Caddy, real form/mail delivery, or customer/ANEXO D UAT. These remain `BLOCKED` and are not
simulated by local fixtures. Separate-host encrypted backup and restore remain unproven but, by the
Owner's 2026-09-04 waiver, no longer control the Client Ready verdict; local backup and rollback remain
mandatory deployment controls.
