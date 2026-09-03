# Build and deploy the 2026-09-03 portal/Stalwart hotfix

This document supplements the canonical [VPS deployment runbook](DEPLOYMENT_VPS.md) and the
[release ZIP workflow](RELEASE_ZIP_DEPLOY.md). Use those documents for the complete safety and
rollback contract. This hotfix is code-only: the expected maximum `schema_migration` remains `35`.

## Included behavior

- MFA enrollment is optional for the Owner and all other users; users may still enable MFA.
- The Team directory keeps Specialists and Mailboxes as distinct, directly addressable views.
- Mailbox failures expose safe, useful causes without logging credentials, authorization headers
  or complete JMAP responses.
- The dedicated Stalwart service account is excluded from the mailbox directory.
- An explicitly activated available mailbox may safely relink an archived portal identity with the
  same canonical email; background synchronization may not perform that recovery implicitly.
- Every available mailbox has an individual **Activate in portal** action. Active rows are not
  selectable for the bulk activation action.
- Destructive confirmation text states that the operator must type `DELETE` followed by the exact
  email address.

## Stalwart service credential

Do not use an administrator account or administrator-owned API key. In Stalwart WebAdmin `0.16.19`:

1. Create the non-human User Account `jaautomation-provisioner` in `j-aautomation.com`.
2. Leave Tenant as `None`, add no groups and assign only the built-in `User` role.
3. Set the account permission mode to **Merge** and add:
   `sysDomainGet`, `sysDomainQuery`, `sysAccountGet`, `sysAccountQuery`, `sysAccountCreate`,
   `sysAccountUpdate` and `sysAccountDestroy`.
4. Create an API key inside that account and set its permission mode to **Inherit**. The effective
   `authenticate` permission comes from the User role.
5. Install only the token value with `sudoedit`; never paste it into chat, shell arguments or the
   environment:

   ```bash
   sudo install -d -o root -g 10001 -m 0750 /etc/jaautomation/secrets
   sudoedit /etc/jaautomation/secrets/stalwart-mail-provisioner.token
   sudo chown root:10001 /etc/jaautomation/secrets/stalwart-mail-provisioner.token
   sudo chmod 0640 /etc/jaautomation/secrets/stalwart-mail-provisioner.token
   sudo test -s /etc/jaautomation/secrets/stalwart-mail-provisioner.token
   sudo stat -c '%U:%G %a %n' /etc/jaautomation/secrets/stalwart-mail-provisioner.token
   ```

The **Replace** configuration containing only eight portal permissions is not sufficient for
account creation in this Stalwart version: it omits default User capabilities that the caller must
be able to grant to a new User. After both directory read and disposable-account creation succeed,
remove any temporary Password credential from the service account and revoke the obsolete
administrator-owned portal key. Never restart Stalwart just to rotate this token.

## Build a reviewed release

Build from the published branch with a clean worktree. The repository pins Node.js `24.19.0` and
pnpm `11.22.0`; PowerShell 7, Git, `ssh` and `scp` must also be available.

```powershell
git switch codex/v3-production-completion-orchestrated-20260819
git pull --ff-only
git status --short
$releaseDate = Get-Date -Format 'yyyyMMdd'
pwsh -File scripts/build-release-and-upload.ps1 -ReleaseDate $releaseDate
```

`git status --short` must be empty. The script performs frozen dependency installation, typechecks,
builds the site/portal/jobs packages, packages only reviewed repository paths, writes the manifest
and SHA-256, uploads with temporary `.part` names and verifies the remote checksum. Do not use
`-AllowDirty` or `-SkipQualityGates` for a production release. Use `-NoUpload` only for a local
inspection build.

## VPS configuration and preflight

Preserve every existing value in `/etc/jaautomation/jaautomation.env` and atomically add or update:

```dotenv
JA_MAIL_AUTH_ENABLED=true
JA_IMAP_HOST=mx1.j-aautomation.com
JA_IMAP_PORT=993
JA_IMAP_SERVERNAME=mx1.j-aautomation.com
JA_IMAP_TIMEOUT_MS=4000
JA_IMAP_TLS_REJECT_UNAUTHORIZED=true
JA_STALWART_JMAP_URL=https://mx1.j-aautomation.com/jmap
JA_STALWART_DOMAIN=j-aautomation.com
JA_STALWART_EXCLUDED_USERNAMES=jaautomation-provisioner
JA_STALWART_TOKEN_FILE=/run/secrets/stalwart-mail-provisioner.token
```

Keep `JA_BACKUP_REMOTE_ENABLED=false` if the independent off-site destination is not configured;
record that continuity gap as pending and do not invent remote credentials. Before deployment:

Open a root login shell with `sudo -i`; the complete preflight block below runs inside that root
shell. Do not run only selected lines as an unprivileged user.

```bash
test "$(id -u)" -eq 0
systemctl is-active --quiet stalwart.service
ss -ltn | awk '$4 ~ /:993$/ { ok=1 } END { exit(ok ? 0 : 1) }'
systemctl start jaautomation-backup.service
systemctl status jaautomation-backup.service --no-pager
journalctl -u jaautomation-backup.service -n 100 --no-pager -o short-iso
docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f /opt/jaautomation/current/deployment/compose.production.yml config --quiet
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Stop if the online backup fails. Verify the uploaded ZIP with its adjacent `.sha256` file, then use
the reviewed deployer; do not copy individual source files into the active release:

```bash
sha256sum -c /home/kripta/jaautomation-release-YYYYMMDD-final.zip.sha256
sudo bash /home/kripta/install-jaautomation-zip-deploy.sh \
  --archive /home/kripta/jaautomation-release-YYYYMMDD-final.zip
```

The deployer performs the backup, image builds, additive migration, atomic release switch, unit
installation, health checks and automatic rollback. It must never run the demo seed, copy a local
SQLite database, read Stalwart RocksDB, import account exports, or alter DNS/mail configuration.

## Acceptance after deployment

Record only redacted release, migration, service, HTTP and count evidence:

- the active `RELEASE-BUILD.txt` contains the expected commit;
- maximum migration is `35` and `PRAGMA integrity_check` is `ok`;
- portal/site containers are healthy and jobs is Up;
- the latest `jaautomation-jobs.service` result is `success`, both timers are active, and recent
  `jobs.cycle` events contain no errors;
- portal can read the mounted secret without printing it and completes TLS verification to
  `mx1.j-aautomation.com:993`;
- private readiness and public site/login return the expected HTTP codes;
- Stalwart, Roundcube and mail ports remain healthy without a Stalwart restart;
- Mailboxes opens as its own view, excludes `jaautomation-provisioner`, and shows active/available
  counts consistently;
- one available mailbox can be activated with its row action, while active rows remain disabled
  for bulk activation;
- creating a uniquely named disposable mailbox either succeeds or returns a safe specific reason;
- sign-in works without mandatory MFA enrollment unless that user opted into MFA.

Do not synchronize by impersonating the Owner. Antonny must perform Owner step-up and any bulk
mailbox reconciliation from Projects → Team → Mailboxes. Never include tokens, passwords, hashes,
authorization headers or full JMAP responses in the deployment report.
