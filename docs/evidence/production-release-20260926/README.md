# Production release receipt — 2026-09-26

Application commit `eb11e677ec8227c03817ebd52ccdb4c43d202755` was deployed from the filtered ZIP with SHA-256 `97526909ab30e5ea893262674c5bcf080c6f7ab4ec1482de95e3c65cb7d996b5`. GitHub branch tip `7fdfeb1bdb898bb713c43007a826e75a68ef974e` adds only three test fixes excluded from that ZIP. The packaged application files match the deployed application commit.

The release deployer created an online pre-cutover backup, switched the release, and checked the public website and login URL. Site and portal containers became healthy. `verify-vps.sh --wait-two-automatic-runs` passed, observing two distinct automatic `jobs.cycle` records at `2026-09-26T01:40:40.832Z` and `2026-09-26T01:40:45.862Z`, both with zero failures. The ZIP watcher, jobs timer, and backup timer are active. The earlier release directory and both earlier Docker images remain available for rollback.

The new local backup verified with SQLite integrity `ok`, zero foreign-key violations, and one private document. An isolated restore of the preserved pre-cutover snapshot verified integrity `ok`, zero foreign-key violations, schema version 67, and the same document count. The restored trial copy was removed after verification; the preserved backup remains under `/var/tmp/ja-precutover-backups` outside routine retention. The [operator evidence](operations-evidence.json) carries the owner's existing September 6 waiver for a restore on a separate host. It does not claim remote backup replication. Local snapshot history currently covers two of the required three calendar days; September 24 is missing after the earlier authorized cleanup, and daily coverage must rebuild with future automatic backups.

The complete security and invariant run passed 38 files and 252 tests. Focused browser checks exercised visible forms, errors, navigation, and requests in an isolated Chromium fixture; see the [browser QA receipt](../browser-release-20260926/README.md). The final 32-step browser journey passed with fresh production operations evidence. Its only production request was a read-only Caddy boundary check.

The earlier repository-wide serial Vitest sweep was interrupted before completing all files. Its service-actor fixture collision was corrected and that file passed on rerun. This receipt does not claim a complete repository-wide test pass.

An [anonymous production Chromium check](public-browser.json) also passed at 390 px and 1440 px. It clicked the mobile portal link, desktop Capabilities link, login language selector, and empty required-field submit. No console errors, failed requests, or production writes were observed. Authenticated production flows were not exercised.

Docker build cache was pruned to 0 B after deployment, reclaiming 6.96 GB. Production images, volumes, and rollback material were retained. The machine had about 30 GiB free after the temporary isolated restore copy was removed.

The machine-readable [release receipt](release.json) and [operator evidence](operations-evidence.json) contain the checked timestamps and statuses. Raw deployment and verification logs remain private on the VPS under `/var/tmp/ja-*-eb11e67-20260926.*`.
