# VPS deployment

The supported architecture and runbook are in [deployment/README_VPS.md](../deployment/README_VPS.md).
Use Ubuntu 24.04, Docker Compose and Caddy. Bind portal/site ports to loopback and expose only
Caddy. Store the environment in `/etc/jaautomation/jaautomation.env` with mode `0600`; store the
database/files under `/var/lib/jaautomation` and online backups under `/var/backups/jaautomation`.

Deployment artifacts include non-root read-only containers, Caddy routing, systemd service/timers,
health checks, disk-space preflight, backup/restore scripts, release tagging and rollback guidance.
No real VPS was modified by this repository session. Before go-live, operators must supply real
secrets, legal/tax/numbering configuration, recipient adapters, scanner and off-site backup values.

## Release archive handoff

The release handoff is a source archive, not a database dump. It contains the current `website/`,
`apps/portal/`, workspace packages, reviewed migrations, deployment files, tests and the disposable
`packages/database/src/demo-seed.ts` fixture source. It intentionally excludes `.git`, dependency
trees, generated build output, SQLite files, private uploads, test databases and secrets.

For the 2026-08-20 handoff, the operator places the generated archive at:

```text
/home/kripta/jaautomation-release-20260820-final.zip
```

The operator must provide the exact SHA-256 printed beside that archive. The VPS agent must verify
the checksum before extraction and must perform a full release switch rather than copying a few
source files over the old tree. “Full replacement” means that `/opt/jaautomation/current` points to
the new extracted release and the J&A site/portal containers are rebuilt from it; it does not mean
deleting `/var/lib/jaautomation`, overwriting `/etc/jaautomation/jaautomation.env`, deleting old
release directories, or touching unrelated NexIA/EVOCON services and Caddy routes.

Before the switch, take and verify an online backup of the existing J&A database and private files.
Keep the previous `/opt/jaautomation/current` target and at least one healthy image available for
rollback. Apply only reviewed migrations, reload Caddy only after `caddy validate` succeeds, and
run the public, portal, health, job, backup and existing-route smoke checks before declaring the
release live. The fixture seed is for an isolated validation database only; never run it against
the production database.

For a production deployment, use [SHOWCASE_ACCESS.md](SHOWCASE_ACCESS.md) together with
[deployment/README_VPS.md](../deployment/README_VPS.md). It provisions the first owner through the
operator-only bootstrap command, then uses invitation-only Better Auth accounts. No demo or
passwordless access mode is part of the release.
