# Deployment procedure review

Verdict: **SHIP**. The blocking automatic-retry issue is resolved in the reviewed wrapper.
This review inspected scripts and service state only; it did not build, deploy, stop services,
or run production mutations.

## Reviewed script identities

| File | SHA-256 |
| --- | --- |
| `/tmp/ja-ux-package.py` | `7d414d1bf3a811ee055224eab0e7635a5cc451d9e9767c65fd6c8f475346550e` |
| `/tmp/ja-ux-deploy.sh` | `9dadee7060a6a6a33c8be35aaef1ba38c4c01fb936b300c43aed437192f15fb2` |
| `/usr/local/sbin/jaautomation-zip-deploy` | `ad08be5429b324fd991187161f494625d19ca7569a96104ab35eed7c5dacfb30` |

The installed deployer matches the repository's reviewed deployer byte for byte.

## Evidence

- Packaging uses a temporary Git index and explicit release paths, preserving the real index
  and excluding deployment data/private roots. The ZIP remains under `/tmp` until activation.
  It records the source tree and base commit, creates a SHA-256 manifest covering source files
  plus RELEASE-BUILD metadata, checks ZIP integrity, and records the complete archive hash.
- Activation checks the archive hash and refuses to overwrite an existing target. It stops
  the path/timer watchers and refuses to move the candidate while the deployment service is
  active or activating. The last observed service state was activating; the wrapper will
  return without moving the candidate in that case and may be retried after the scan completes.
- The corrected EXIT handler captures the original result. On failure it moves the candidate
  out of `/home/kripta` into a unique `/tmp/ja-ux-deploy-failed.*` directory before restoring
  watchers. Thus a failed candidate cannot be automatically redeployed after rollback.
  Failure to restore watchers is reported and produces a nonzero result.
- The installed deployer validates candidate Compose, builds images before replacement,
  retains prior images, stops the J&A worker, creates the online backup, validates Caddy,
  switches the release/tag, and checks application health, the worker and public URLs.
  The wrapper additionally verifies the exact active release path against the archive hash.
- Rollback restores the previous release/tag, containers, J&A units and Caddy snippet on
  activation failure. It does not restore the database automatically. This UX snapshot has
  no migration, Compose, Dockerfile or dependency-lock changes, and persistent bind mounts
  remain unchanged.
- Compose operations use project `deployment`; the reviewed procedure contains no global
  container shutdown or pruning. Caddy configuration is validated before reload. Other
  application stacks are not targeted.
- The preservation script uses read-only SQLite and compares stable financial-table hashes
  and an aggregate private-file manifest. Its output contains counts and hashes, not private
  rows or file names. The public smoke script checks public pages/login in three locales at
  two widths; authenticated workflows are covered separately in disposable browser fixtures.

The existing deployer still runs its established outbox cutover quarantine and backup-reader
configuration. Those are unchanged by this release; the earlier read-only audit found zero
pending pre-cutover events. Release execution remains conditional on the parent's final test
results and must be followed by the prepared preservation, backup and health checks.
