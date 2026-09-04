# Client Essential candidate evidence — 2026-09-04

## Status

**BLOCKED — not `CLIENT READY`, solely pending real form/mail delivery and signed ANEXO D UAT,
including the Owner role/project-assignment smoke.**

The reviewed application candidate was committed, published and deployed on 2026-09-04 from branch
`codex/v3-production-completion-orchestrated-20260819`; the latest numbered migration is
`0035_stalwart_mail_integration.sql`. The deployed immutable release passed migration, Caddy, internal
and public health, Stalwart/IMAPS, database integrity and automatic-jobs verification. The later
acceptance-contract correction makes the Owner's continuity waiver executable and fail-closed.

## Runtime and safety preflight

The release was installed through the reviewed root deployer. It performed an online local backup,
rebuilt the production images, ran the additive migration and atomically switched the release. It did
not change Stalwart data/accounts, credentials, mail content or DNS.

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
| `run test:unit`                    | 0    | 121 files / 722 tests passed.                                                                                |
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

The 32-step command exits 0: **32/32 PASS** in 2.2 minutes. It consumed a protected,
deployment-identity-bound evidence file (`root:root`, mode `0600`) captured on the VPS. Step 30 proves
two distinct automatic `jobs.cycle` records with zero failures and no manual queue processing. Step 31
accepts the Owner's explicit 2026-09-04 separate-host continuity waiver only because the same
digest-bound contract also proves a successful local backup and retained rollback images. Missing,
stale, cross-deployment, digest-mismatched, non-Owner or safeguard-free waiver evidence remains a hard
failure. The original full remote-copy contract continues to pass unchanged when supplied.

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
was also rerun with the live Caddy base URL and protected VPS operations evidence: all 32 steps pass.

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

Direct production evidence now exists for two automatic job cycles, the active release behind live
Caddy, SQLite integrity, local backup/rollback, portal secret readability, Stalwart 0.16.19 and TLS
IMAPS. Real form/mail delivery and customer/ANEXO D UAT remain `BLOCKED` and are not simulated by local
fixtures. Separate-host encrypted backup remains unproven but, by the Owner's 2026-09-04 waiver, does
not control the Client Ready verdict.
