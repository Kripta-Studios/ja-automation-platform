# VPS coding-agent handoff: J&A Automation production release

Use this message only after the release operator has supplied the archive path and SHA-256. The
portal has one access model: invitation-only Better Auth sessions. Do not create or restore a
passwordless showcase account.

The release operator places the archive at `/home/kripta/<release-archive>.zip`; verify it in that
location before extracting. The archive is source-only and intentionally contains no database,
private uploads, generated build output or production secrets. Its demo seed is for isolated
validation only and must not be run against production. Two zero-filled, untracked test artifacts
present in the local worktree are excluded from this archive; they are not runtime code and must be
repaired separately before claiming a green full test gate.

```text
Deploy the reviewed J&A Automation V3 release archive from the path and checksum supplied by the
release operator. This is a full J&A release replacement: switch the code and rebuild both J&A
containers from the archive. Preserve the production database, private files, secrets, old release
target and all unrelated applications so rollback remains possible.

Guardrails:
1. Do not use a local SQLite database, commit secrets, expose ports 5100/5101, run
   drizzle-kit push, or enable automatic invoice issue/send.
2. Do not edit, regenerate, rename, or delete
   J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md.
3. Before replacing any existing J&A release or applying migrations, show the target paths and take
   and verify an online backup of /var/lib/jaautomation if it exists. Continue only after operator
   confirmation. Never delete or overwrite that data tree as part of a code release.
4. Do not touch unrelated NexIA/EVOCON services or Caddy routes. Edit/reload only the J&A Caddy
   import, and run `caddy validate` before every reload.

Run as root/sudo on the VPS:

sudo -v
sha256sum /home/kripta/<release-archive>.zip
# Compare the output with the release operator's SHA-256.

sudo install -d -o root -g root -m 0750 /opt/jaautomation/releases
sudo unzip -q -o /home/kripta/<release-archive>.zip -d /opt/jaautomation/releases
# Confirm that the extracted directory is the archive's release directory, then record the old
# target and atomically switch the current symlink without deleting the previous release.
sudo readlink -f /opt/jaautomation/current || true
sudo ln -sfn /opt/jaautomation/releases/<release-directory> /opt/jaautomation/current
cd /opt/jaautomation/current

sudo bash deployment/scripts/install-vps.sh
sudo install -o root -g root -m 0600 deployment/jaautomation.env.example \
  /etc/jaautomation/jaautomation.env
# Replace all example secrets, origins, recipients, scanner, outbox and backup values.
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml config --quiet
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml up -d --build --remove-orphans

# Apply reviewed SQL migrations, then provision the first owner. The bootstrap command prompts for
# the password without echoing it and requires a 12–128 character password.
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f deployment/compose.production.yml build portal bootstrap-owner
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f deployment/compose.production.yml run --rm --no-deps \
  -e JA_BOOTSTRAP_EMAIL=owner@example.com \
  -e JA_BOOTSTRAP_NAME='J&A Owner' \
  bootstrap-owner

sudo systemctl daemon-reload
sudo systemctl enable --now jaautomation.service jaautomation-jobs.timer jaautomation-backup.timer
sudo bash deployment/scripts/verify-vps.sh https://example.invalid/j-aautomation

Final smoke test:
- Open /j-aautomation/app/login.
- Sign in with the operator-provisioned owner credentials.
- Complete MFA enrollment and verify the dashboard, Projects, Planning, Reports, Expenses,
  Documents, Billing, Finance and Audit authorization boundaries.
- Invite a second account from Projects → Team and verify the single-use activation flow.
- Verify the public `/j-aautomation/en`, `/pt`, and `/es` routes, public forms, and that existing
  NexIA/EVOCON routes still respond. From the VPS itself, verify the loopback-only portal
  `/j-aautomation/health/live` and `/j-aautomation/health/ready` checks; the public Caddy health
  path is intentionally unavailable (404).
- Verify both J&A containers bind only to localhost and that the jobs/backup timers are active.

If sudo requests a password or any command fails, stop and report the exact command and output.
Do not bypass a failure by changing the authority specification, running the fixture seed against
production, deleting unrelated releases, or deleting production data. If the new release fails
health checks, restore the previous `current` symlink and tagged images, leave the database/files
volume untouched, and report the failed check before retrying.
```

The first owner must enroll MFA before inviting other users. The owner then manages all additional
accounts through the portal; fixture data and fixture credentials are limited to isolated tests.
