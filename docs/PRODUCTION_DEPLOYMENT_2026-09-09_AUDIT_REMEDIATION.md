# Production deployment — audit remediation and language persistence

Activated on 2026-09-09 at 20:08:59 UTC (22:08:59 Europe/Madrid).
Runtime and manuals commit: `58403295db6c0ba585eaf2e873437044cb065e24` on
`codex/v3-production-completion-orchestrated-20260819`, pushed to GitHub before deployment.
This receipt is a subsequent documentation-only commit; it does not change the deployed runtime.

## Result and identity

- Archive SHA-256: `bd63d2cc1c4dc973b144f0fe42dd23ccd84643cd8272e8cbbd28eae7ee2987e7`.
- Active release: `/opt/jaautomation/releases/ja-automation-bd63d2cc1c4dc973b144f0fe42dd23ccd84643cd8272e8cbbd28eae7ee2987e7`.
- Runtime source digest: `d77361643ab34930db69c534c408762b2cfbd7d372dfe8169d9ad0379066c114`.
- All 1,604 archive files match the active release byte for byte.
- All seven PDF hashes match Git, the archive and the running portal container.
- Portal and site are healthy; the jobs container is running. SQLite remains schema 42,
  integrity `ok`, with zero foreign-key violations. No migration was required.
- The public website and login return successful responses. The unsigned internal outbox
  endpoint rejects the request with HTTP 401. Two subsequent automatic job cycles pass.

## Language and manual evidence

The final isolated run passed 110 focused tests in 12 files, workspace typecheck, portal ESLint
and formatting. The combined browser run passed 18 tests: 12 language-persistence journeys,
four supplier workflows, a 78-route ES/PT text sweep and the current manual capture. Six skips
are the deliberate exclusion of non-desktop variants of the combined capture/sweep, whose
own coverage is explicit. Owner/Worker tests cover 360, 390, 768 and 1440 pixels, actual sign-out
and sign-in, legacy preference migration and persistence through reload/navigation.

A separate browser check against production passed six language/viewport cases: EN/ES/PT at
360 and 1440 pixels. A fresh browser with Spanish Accept-Language receives English; selecting
another language updates the login text and persists when the query is removed. HTTPS cookies
are Secure and retained for one year. This production check is anonymous; authenticated role
journeys use isolated synthetic users, not Antonny's credentials or production writes.

Forty-eight current synthetic screenshots back the regenerated manuals. Extracted PDF text
includes the language instructions and matching source identity; representative Portuguese and
Spanish pages were visually inspected.

| PDF                            | Pages | SHA-256                                                            |
| ------------------------------ | ----: | ------------------------------------------------------------------ |
| Employee_Field_Guide_EN.pdf    |     6 | `5e06e685dcafcac00e56cb72bfb3346fd168fb4568a33d0ed4dda7dd385f384f` |
| Employee_Field_Guide_ES.pdf    |     6 | `ece69e1dd2b1372a572b65ba11d38dd63655a18dc718c89fa7d14e41d67b70e4` |
| Employee_Field_Guide_PT-BR.pdf |     6 | `9cd8ca8509b33d80551c1f87a0437bc6afa8e7d96ffd7fecde36fe5fd7136f8f` |
| Owner_User_Guide.pdf           |    17 | `7111c18d7e1aa670865bd7c4f4557626f7508cb06e14b450fe2a4abd6d0a5e69` |
| Owner_User_Guide_PT-BR.pdf     |    18 | `fa6585c157b4d89f5957546426dc01edd2af02d8a25933b3be513630cb87a290` |
| Worker_User_Guide.pdf          |    12 | `9905e6646b6355523b7d2fbe4341504ec1e151b89aa177e566073e033852d2de` |
| Worker_User_Guide_PT-BR.pdf    |    13 | `2f4b0657d032d69911faf36077c068cc4235965fdf64be7d019b98258eb7e071` |

## Backups, activation and cleanup

The first activation attempt encountered an already-running ZIP scanner and did not change
production. The controlled wrapper was updated to wait for that lock and assert the expected
active release before post-checks. The second systemd unit,
`ja-locale-audit-cutover-20260909-2208.service`, completed with exit 0.

The exact candidate image verified the latest existing backup as UID 10001 with supplemental
GID 10003 and a read-only backup mount before activation. Deployment created a new complete
backup and configured private reader permissions before starting the new jobs container.
The automatic `backup.verified` event at `2026-09-09T20:08:53.056Z` confirms SQLite integrity,
zero foreign-key violations and 29 documents. Its warning truthfully reports only one observed
day out of the required thirty; six same-day snapshots do not represent thirty days of history.
All five previously retained backup manifests remain unchanged, and the new sixth backup is kept.

Cleanup removed the unused audit-only candidate images/archive/extraction, dangling Docker
images and build cache; pnpm cached metadata was pruned. The measured filesystem free-space
increase was 8,657,530,880 bytes (about 8.66 GB), leaving
about 23.47 GiB available. Current and tagged rollback images,
all six backups, production files and unrelated services were preserved. Production and
backup-preservation checks passed again after cleanup. Backup, jobs and deployment timers/watchers
are active.

## Audit scope still open

This deploys the controlled duplicate-receipt handling, mail adapter and explicit invoice PDF
queue/SMTP acknowledgement, real backup verification and language/manual fixes. It does not
claim complete contractual compliance. No real external test email was sent or historical failed
notification automatically replayed. Existing historical dead-letter/failed-artifact records were
preserved rather than relabeled successful.

The deleted backup history cannot be recreated. An external backup destination and alert channel,
verified fiscal configuration and Accounting approval, external delivery/DKIM and mailbox
migration/restore evidence, DPA/content approval and formal human acceptance remain outstanding.
The recorded Owner decision keeps MFA optional without step-up; the original contract remains
unchanged. See [the remediation matrix](AUDIT_REMEDIATION_2026-09-09.md).

Machine-readable evidence: [production verification](validation/production-audit-remediation-20260909.json).
