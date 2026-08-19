# VPS deployment

The supported architecture and runbook are in [deployment/README_VPS.md](../deployment/README_VPS.md).
Use Ubuntu 24.04, Docker Compose and Caddy. Bind portal/site ports to loopback and expose only
Caddy. Store the environment in `/etc/jaautomation/jaautomation.env` with mode `0600`; store the
database/files under `/var/lib/jaautomation` and online backups under `/var/backups/jaautomation`.

Deployment artifacts include non-root read-only containers, Caddy routing, systemd service/timers,
health checks, disk-space preflight, backup/restore scripts, release tagging and rollback guidance.
No real VPS was modified by this repository session. Before go-live, operators must supply real
secrets, legal/tax/numbering configuration, recipient adapters, scanner and off-site backup values.

For the requested walkthrough deployment, use [SHOWCASE_ACCESS.md](SHOWCASE_ACCESS.md) together with
[deployment/README_VPS.md](../deployment/README_VPS.md). It enables the explicit showcase-only demo
environment, builds the site and portal, runs the reviewed seed inside the portal tools image, and
sets the printed owner ID as the jobs actor before enabling timers. Demo mode is not a production
authentication method.
