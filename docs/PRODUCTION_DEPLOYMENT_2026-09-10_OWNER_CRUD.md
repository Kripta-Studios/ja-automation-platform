# Production deployment — Owner CRUD and searchable dropdowns

Activated **2026-09-10 10:49:09 UTC (12:49:09 CEST)**.

- Application commit: `031077bea174afe62003bed663ecc9d79635f433`, pushed to `codex/v3-production-completion-orchestrated-20260819`.
- Release ZIP SHA-256: `c5919693554a385ee19ccafcd10bf6a4994f4d76bfa2783c3f22f191343da221`.
- Active release: `/opt/jaautomation/releases/ja-automation-c5919693554a385ee19ccafcd10bf6a4994f4d76bfa2783c3f22f191343da221`.
- The installed ZIP watcher acquired the deployment lock and completed the deployment. The concurrent explicit invocation correctly skipped while that lock was held.
- All **47 changed files** in the activated release matched the committed source byte-for-byte.

## Backup and activation

Pre-deploy backup: `/var/backups/jaautomation/2026-09-10T104900372Z-f5cbf38f-00f9-443a-8086-5bb2cfeeaa6a`, 29 stored documents, SHA-256 `4c12636361dc62bc07c89397f6a80bbf2c807775a76f7c1f76f4a8f6e4091735`.

Previous images retained under `rollback-20260910104555-c5919693554a`. Site/portal builds passed; jobs service-actor preflight and both public URL checks passed. ZIP timer/path, jobs timer and backup timer are active after deployment.

## Verification

`deployment/scripts/verify-vps.sh https://j-aautomation.com/j-aautomation` exited 0. Portal and site Docker health checks are healthy; jobs is running and emits successful automatic cycles with no current cycle failures. The unauthenticated management route returns HTTP 401, retaining its authentication boundary.

Schema is **44**, SQLite integrity is `ok`, and `PRAGMA foreign_key_check` returns no violations. Counts in 19 business tables match their pre-deployment values:

| Table                  | Rows |
| ---------------------- | ---: |
| client                 |   26 |
| client_contact         |   11 |
| project                |   28 |
| project_member         |   16 |
| user                   |  109 |
| supplier               |    1 |
| supplier_user_profile  |    2 |
| supplier_project_grant |    1 |
| time_entry             |    9 |
| expense                |   11 |
| daily_report           |    2 |
| technical_report       |    1 |
| technical_change       |    2 |
| invoice                |    3 |
| invoice_line           |    8 |
| document               |   13 |
| planning_assignment    |    2 |
| worker_availability    |    3 |
| project_milestone      |    2 |

No production demo/mock data was erased. Destructive CRUD tests ran only against disposable fixtures and an isolated production backup; that private working copy was removed afterward.

The operational verifier also reports existing historical dead-letter jobs (3) and failed localized PDF variants (4). This receipt asserts the deployed scope and healthy current cycles, not remediation of every historical artifact or closure of the earlier external acceptance items.

## Cache cleanup

`docker builder prune --all --force` reclaimed **6.828 GB**. Final Docker build cache: **0 entries / 0 bytes**. Current and rollback images, production database, files, backups and unrelated Navidrome were retained. Free disk space after cleanup was approximately 29 GiB.

Implementation, permission boundaries and test evidence: [Owner management evidence](evidence/owner-crud-20260910/README.md). Final combined browser pass: **24/24**, widths 360/390/768/1440; Svelte: zero errors, seven existing unused-CSS warnings. The metadata-only receipt commit does not require replacing the already verified application images.
