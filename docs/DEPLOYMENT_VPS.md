# VPS deployment

This is the operator runbook and current deployment record for J&A Automation on the Hetzner VPS.
The supported architecture remains Ubuntu 24.04, Docker Compose and Caddy: Caddy is the only
Internet-facing web proxy, while the site and portal bind to loopback. The production environment
uses Better Auth with MFA. When the live Stalwart integration is enabled, every current mailbox is
also a portal identity (the canonical `antonny.luty` identity is the sole `owner_admin`; all other
mail-linked identities start as `worker`). Do not run the demo seed or expose the application ports
directly.

Last live verification recorded here: **2026-08-28**. Facts labelled **verified** below came from
read-only VPS/HTTPS checks. Facts labelled **transition summary** come from
`.credentials/SUMMARY_EMAIL_DEPLOYMENT.md` (the mail summary is dated 2026-08-26) and must not be
treated as a fresh acceptance test. This documentation pass did not change VPS, DNS, Caddy,
systemd, mailbox or backup state. **Pending** items remain release blockers.

## Current live state

| Area                            | 2026-08-28 observed state                                                                                         | Evidence/status                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| VPS host                        | Hetzner VPS, Ubuntu 24.04.4 LTS, IPv4 `91.99.90.39`                                                               | **Verified**                                                                     |
| Canonical public root           | `https://j-aautomation.com/` routes to `/j-aautomation/en`                                                        | **Verified**                                                                     |
| Localized public site           | `/j-aautomation/en`, `/j-aautomation/es` and `/j-aautomation/pt` return HTTP 200                                  | **Verified**                                                                     |
| Portal entry point              | `https://j-aautomation.com/j-aautomation/app/login`                                                               | **Verified deployed entry point**                                                |
| Compatibility app host          | `https://app.j-aautomation.com/` redirects to the canonical deployment                                            | **Verified**                                                                     |
| Site listener                   | `127.0.0.1:5101`                                                                                                  | **Verified**                                                                     |
| Portal/API listener             | `127.0.0.1:5100`                                                                                                  | **Verified**                                                                     |
| Public health paths             | External `/j-aautomation/health/*` returns HTTP 404                                                               | **Verified and intentional**; use loopback readiness for monitoring              |
| Active release                  | `/opt/jaautomation/current` points at the active release; observed release/hash prefix is `894f…`                 | **Verified**; use the full server manifest for exact release sign-off            |
| Caddy                           | Configuration validation succeeded                                                                                | **Verified**                                                                     |
| Mail service inventory          | Stalwart on `mx1.j-aautomation.com`, with `webmail-new`; ports 25, 465, 587 and 993 are the public mail listeners | **Verified inventory**; mailbox cutover is separate                              |
| Local backup timer              | Last recorded `jaautomation-backup.service` is `Result=success`                                                   | **Verified**; this does not prove off-site recovery                              |
| Jobs                            | `jaautomation-jobs.timer` is active, but the latest `jaautomation-jobs.service` is `Result=exit-code`             | **Verified failure**; jobs are not production-ready until the service is healthy |
| Separate-host continuity backup | Remote replication and restore drill                                                                              | **Pending**                                                                      |

The job-service failure and the missing external continuity evidence keep the deployment below the
Client Essential release bar. A successful local backup timer run must not be reported as a
successful disaster-recovery test.

The checked-in ZIP deployer and VPS verifier now default to the canonical `j-aautomation.com`
deployment. The installed host-side deployer must receive this reviewed version in the next release;
until its version is confirmed, use the explicit canonical HTTPS checks in this runbook and pass the
canonical base URL to any older verifier invocation.

## Deployed topology and routing

```text
Internet
   |
   v
Caddy :80/:443
   |-- j-aautomation.com /j-aautomation/* -> 127.0.0.1:5101 (public site)
   |-- j-aautomation.com /j-aautomation/app* -> 127.0.0.1:5100 (portal/API)
   |-- loopback-only /j-aautomation/health/* -> 127.0.0.1:5100
   `-- external /j-aautomation/health/* -> 404

127.0.0.1:5101  site container (public, no database or auth-secret mount)
127.0.0.1:5100  portal/API container (private application, auth and SQLite)
```

The canonical customer-facing URLs are:

```text
https://j-aautomation.com/j-aautomation/en
https://j-aautomation.com/j-aautomation/es
https://j-aautomation.com/j-aautomation/pt
https://j-aautomation.com/j-aautomation/app/login
```

`app.j-aautomation.com` is a compatibility host and redirects to the canonical deployment. Keep
the canonical host in new links, Better Auth origins, WebAuthn configuration and release smoke
tests.

The public Caddy health response is deliberately not a readiness probe. Run readiness only against
the portal loopback listener or through the VPS verifier:

```bash
curl --fail --silent --show-error http://127.0.0.1:5100/j-aautomation/health/live
curl --fail --silent --show-error http://127.0.0.1:5100/j-aautomation/health/ready
curl --fail --silent --show-error http://127.0.0.1:5100/j-aautomation/app/api/health
```

The external check is expected to be a 404 and should remain part of the routing smoke test:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://j-aautomation.com/j-aautomation/health/ready
```

The deployed public liveness check used by the current browser checkpoint is the root `/health/live`
path (`HTTP 200`). The portal-scoped readiness path above intentionally remains private and returns
`HTTP 404` through the public Caddy boundary; a public 404 there is not a portal outage.

## DNS and mail transition

### Web DNS currently observed/reported

The web deployment uses the Hetzner IPv4 address `91.99.90.39`:

```dns
A     j-aautomation.com          91.99.90.39
CNAME www.j-aautomation.com      j-aautomation.com
A     app.j-aautomation.com      91.99.90.39
CNAME www.app.j-aautomation.com  app.j-aautomation.com
A     mx1.j-aautomation.com      91.99.90.39
```

The transition summary records no AAAA record for the root/www web names or for `mx1`; the mail
deployment is intentionally IPv4-only during this transition. Do not infer IPv6 readiness from the
presence of the host's IPv6 prefix.

The website and portal now run behind Caddy on the VPS. Do not edit DNS or MX records as part of a
normal application release.

### Mail state

The 2026-08-27 inventory confirms the service names and public listener set shown in the current
state table. The mailbox migration and DNS details below are retained from the **transition
summary** and are not a substitute for a final mail acceptance test.

The transition summary identifies the new mail host as `mx1.j-aautomation.com`, running Stalwart
0.16.19 behind Caddy, with `webmail-new` as the new webmail endpoint. The reported public mail
listeners are:

```text
25/tcp   SMTP
465/tcp  submission with implicit TLS
587/tcp  submission with STARTTLS
993/tcp  IMAPS
```

Stalwart administration remains on `127.0.0.1:8080`; it is not a public administration port. The
summary reports that the four mail ports were reachable externally and port 8080 was closed, but
mailbox migration and final DNS cutover still require their own acceptance evidence.

Until all mailboxes have been recreated, synchronized and validated, the production MX guard is:

```dns
MX j-aautomation.com 0 mail.j-aautomation.com
A  mail.j-aautomation.com 162.241.203.71
```

HostGator remains the source of truth for incoming mail during this transition. **Do not change the
MX, remove `mail.j-aautomation.com`, replace the root SPF, or cancel HostGator** until the staged
mailbox migration is complete. The planned sequence is:

1. inventory the 93 accounts and 2 forwarders;
2. create and initially synchronize the Stalwart mailboxes;
3. validate folders and messages while HostGator remains the MX;
4. change MX to `mx1.j-aautomation.com` only after validation;
5. run the final synchronization and validate real client send/receive behavior;
6. retain HostGator through the agreed safety period before retirement.

The summary also reports Amazon SES Frankfurt (`eu-central-1`) as the outbound relay, with the
domain identity, Easy DKIM, custom MAIL FROM and `p=none` DMARC configuration in place. No SMTP,
Stalwart or application credentials belong in this repository or this runbook. The final SES
production approval, PTR alignment, mailbox migration, final SPF, autodiscover/autoconfig/SRV and
DMARC hardening remain pending unless separately evidenced.

## Portal–Stalwart mailbox integration

This section is the deployment contract for the mailbox directory and Webmail authentication code.
It applies only to a release that contains the reviewed mail integration migration and backend/UI
implementation. The runbook does not read or modify Stalwart's RocksDB, password hashes, NDJSON
exports or migration artefacts.

### Runtime boundaries and source of truth

Stalwart `0.16.19` remains the source of truth for the live mailbox directory and passwords. The
portal container uses the following boundaries:

| Operation                                   | Runtime endpoint                           | Rule                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List/create/update/destroy mailbox accounts | `https://mx1.j-aautomation.com/jmap`       | Use JMAP `x:Account/query`, `x:Account/get` and `x:Account/set` with the restricted service key. Request only non-secret account fields; never request `credentials`. |
| Verify a Webmail password                   | `mx1.j-aautomation.com:993` (IMAPS/TLS)    | Stalwart validates the stored hash natively, including the existing heterogeneous crypt formats. The portal never imports or derives a copy of that hash.             |
| Portal identity, role, status and audit     | SQLite under `/var/lib/jaautomation/data/` | Store only the Stalwart account ID/email link and portal authorization state. Issued financial/history rows remain untouched when a portal identity is offboarded.    |

The path `/jmap` is intentional for this installed Stalwart `0.16.19` runtime. Some newer Stalwart
documentation shows `/api` in examples; do not change this deployment to `/api` without verifying
the exact server version and endpoint. The portal's `127.0.0.1` is the portal container itself,
not the VPS and not Stalwart. Production therefore uses the TLS name above, with certificate
verification enabled; a loopback IMAPS default is for isolated development only.

The JMAP key is server-side only. It is mounted as a Docker secret at
`/run/secrets/stalwart-mail-provisioner.token`; it is not an environment value, build argument,
browser value, log field, command-line argument or repository file. The Compose declaration reads
the host source `/etc/jaautomation/secrets/stalwart-mail-provisioner.token` and mounts it read-only
to UID `10001` inside `portal`. The jobs and public site services do not receive this secret.

### Production environment contract

Set these values in the root-owned `/etc/jaautomation/jaautomation.env`. The checked-in examples
are templates only and contain no credentials:

```dotenv
JA_MAIL_AUTH_ENABLED=true
JA_IMAP_HOST=mx1.j-aautomation.com
JA_IMAP_PORT=993
JA_IMAP_SERVERNAME=mx1.j-aautomation.com
JA_IMAP_TIMEOUT_MS=4000
JA_IMAP_TLS_REJECT_UNAUTHORIZED=true
JA_STALWART_JMAP_URL=https://mx1.j-aautomation.com/jmap
JA_STALWART_DOMAIN=j-aautomation.com
JA_STALWART_TOKEN_FILE=/run/secrets/stalwart-mail-provisioner.token
```

There is no static or fixture fallback at runtime. Local automated tests inject an in-memory
test client; deployed containers always use the live directory and report it as unavailable if
Stalwart cannot be reached. The portal must never silently show an old/static account list.

### Root/operator preflight

Run the following as an authorized root/operator before installing or upgrading the release. These
checks print paths and status only; they do not print the key, a password, hashes or mailbox data.

```bash
set -euo pipefail
test "$(id -u)" -eq 0
command -v docker >/dev/null
command -v caddy >/dev/null
docker compose version >/dev/null
systemctl is-active --quiet stalwart.service
test -r /etc/jaautomation/jaautomation.env
test -r /etc/jaautomation/secrets/stalwart-mail-provisioner.token
test -s /etc/jaautomation/secrets/stalwart-mail-provisioner.token
stat -c 'token-file %u:%g mode=%a path=%n' \
  /etc/jaautomation/secrets/stalwart-mail-provisioner.token
ss -ltn | awk '$4 ~ /:993$/ { found=1 } END { exit(found ? 0 : 1) }'
cd /opt/jaautomation/current
docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml config --quiet
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

The expected host token ownership is `root:10001` (numeric group is acceptable) with mode `0640`
or stricter. The container-side Compose secret is mounted with mode `0400` for UID `10001`.
If the numeric group does not exist on the host, create/use a dedicated non-login group with the
same numeric GID that the portal container uses; do not make the token world-readable. The
operator may create the directory and edit the generated key interactively as follows:

```bash
install -d -o root -g 10001 -m 0750 /etc/jaautomation/secrets
sudoedit /etc/jaautomation/secrets/stalwart-mail-provisioner.token
chown root:10001 /etc/jaautomation/secrets/stalwart-mail-provisioner.token
chmod 0640 /etc/jaautomation/secrets/stalwart-mail-provisioner.token
stat -c 'token-file %u:%g mode=%a path=%n' \
  /etc/jaautomation/secrets/stalwart-mail-provisioner.token
```

Do not place the value in shell history, a `docker compose -e` argument, `/etc/jaautomation/jaautomation.env`,
the release archive or this runbook. `sudoedit` opens the file without putting its contents in the
command line. The token file must exist before `docker compose up`; the production Compose stack
intentionally fails closed if the required secret source is absent.

### Stalwart service principal and API key

Create a dedicated non-human Stalwart service principal/API key in the Stalwart WebAdmin for the
portal integration. Use the WebAdmin's API-key/principal management page for this installed
version and record only the principal name, creation time and rotation owner in the operator's
secret inventory. Do not reuse the Stalwart administrator credential or a personal key.

The key's allowlist must be exactly the capabilities required by the Owner-controlled mailbox
workflow:

```text
authenticate
sysDomainGet
sysDomainQuery
sysAccountGet
sysAccountQuery
sysAccountCreate
sysAccountUpdate
sysAccountDestroy
```

Scope it to `j-aautomation.com` if the Stalwart installation supports resource/domain scoping;
otherwise the application must enforce the domain on every request and reject any other domain or
account ID. `sysAccountDestroy` is present only because the Owner explicitly requested mailbox
deletion from the portal. It is a high-impact capability: keep the key restricted to this one
portal, require the portal's Owner step-up/confirmation gate, audit every destroy request and do
not expose a generic administrator endpoint. If the deployment initially disables delete in the
UI, the key may be issued without `sysAccountDestroy` until that feature is reviewed; enabling
delete later requires a key rotation or capability update and a fresh smoke test.

After generating the key, install it through the protected file procedure above. Rotate by creating
a replacement key first, replacing the file interactively, restarting only the portal service,
checking the authenticated Owner directory flow, and revoking the old key in Stalwart. Never
delete the old key before the replacement has been tested, and never print either value.

### Fresh install and upgrade sequence

The mail migration is additive. For this release it is `migrations/0035_stalwart_mail_integration.sql`
and must be included in the reviewed migration contract/manifest shipped with the release. It
creates the `mail_identity` link, durable external-command ledger and database guards for the
canonical Owner; it does not import a Stalwart password or hash. On a fresh database, the normal
portal startup applies the complete reviewed migration set. On an upgrade, the same startup applies
only unapplied migrations and preserves existing rows. Before deployment, verify that the live
database has only the canonical Antonny Owner; remediate any historical non-canonical Owner through
an explicit audited change before enabling mail administration.
Never use `drizzle-kit push`, copy a local SQLite file, or manually edit `schema_migration`.

1. Confirm the release archive checksum and inspect `deployment/compose.production.yml`, the
   migration contract and `0035_stalwart_mail_integration.sql`.
2. Take and verify a local online backup of the database plus private files before changing the
   release or applying migration 0035:

   ```bash
   systemctl start jaautomation-backup.service
   systemctl status jaautomation-backup.service --no-pager
   journalctl -u jaautomation-backup.service -n 200 --no-pager -o short-iso
   ```

3. Install/verify the root-owned token file and production environment values.
4. Point `/opt/jaautomation/current` at the reviewed release, install the reviewed systemd unit
   files when they changed, and validate Compose/Caddy with the preflight above.
5. Run the database check through the tools image after the backup. It invokes the repository's
   reviewed migration runner; it does not seed fixture data:

   ```bash
   docker compose --env-file /etc/jaautomation/jaautomation.env \
     --profile tools -f deployment/compose.production.yml run --rm --no-deps \
     --entrypoint node demo-seed \
     --experimental-strip-types /workspace/packages/database/src/cli.ts check
   ```

6. Start the portal/site and then the jobs watchdog. The portal's readiness endpoint must report
   the database at the expected migration version before traffic is considered healthy:

   ```bash
   systemctl daemon-reload
   systemctl enable --now jaautomation.service
   systemctl enable --now jaautomation-jobs.timer jaautomation-backup.timer
   curl --fail --silent --show-error http://127.0.0.1:5100/j-aautomation/health/ready >/dev/null
   ```

7. Verify the secret is readable by the portal UID without printing it, and verify TLS/DNS from
   inside the portal network:

   ```bash
   docker compose --env-file /etc/jaautomation/jaautomation.env \
     -f deployment/compose.production.yml exec -T portal sh -lc \
     'test -r "$JA_STALWART_TOKEN_FILE" && test -s "$JA_STALWART_TOKEN_FILE"'
   docker compose --env-file /etc/jaautomation/jaautomation.env \
     -f deployment/compose.production.yml exec -T portal node --input-type=module -e \
     "import tls from 'node:tls'; const s=tls.connect({host:'mx1.j-aautomation.com',port:993,servername:'mx1.j-aautomation.com',rejectUnauthorized:true},()=>{console.log('IMAPS TLS OK');s.end()}); s.setTimeout(5000,()=>{console.error('IMAPS timeout');s.destroy();process.exit(1)}); s.on('error',e=>{console.error('IMAPS TLS failed:',e.code||'error');process.exit(1)});"
   ```

The TLS probe authenticates no account and must not be treated as a password or JMAP acceptance
test. The first authenticated directory request is performed in the Owner UI after the smoke
sequence below.

### Initial reconciliation and default roles

After migration and service health are green, Antonny signs in, completes **Confirm Owner
password**, and uses **Buzones de correo → Synchronize all Stalwart accounts**. This is the
reviewed, idempotent initial reconciliation. It includes the canonical Owner automatically as
`owner_admin` and every other mailbox as `worker`; it never submits Antonny as a worker. The
reconciliation must:

- query the live JMAP directory for the `j-aautomation.com` domain, never a static NDJSON/JSON
  dump;
- create a portal `active`, email-verified, Webmail-linked identity for every current Stalwart
  account that is not already linked;
- assign `worker` by default to every account except
  `antonny.luty@j-aautomation.com`, which must be `owner_admin` and remain active;
- be idempotent by Stalwart account ID and canonical lowercase email, so retries do not duplicate
  `user`, `account` or `mail_identity` rows;
- preserve an Owner-approved non-default role on later refreshes, while refusing any attempt to
  create another `owner_admin` or change/delete the canonical Owner;
- treat a mailbox missing from any live directory response as an authentication-time availability
  condition only: reconciliation must not archive its link, offboard its portal user, revoke its
  sessions, restore a previously archived link or replace an immutable Stalwart account ID. Only
  Antonny may make those lifecycle decisions through the explicit audited actions;
- write a redacted audit record containing counts/IDs and outcome, never a password, token,
  credential field or full JMAP response.

The release also contains `apps/portal/src/cli/sync-mailboxes.ts` and the
`pnpm --filter @ja/portal mailboxes:sync` entrypoint. It deliberately requires
`JA_MAIL_SYNC_SESSION_ID` for a current, recently step-upped Antonny session; it must not be run as
a fictitious root/system actor. The Owner UI is therefore the normal deployment path. The CLI is
reserved for an attended recovery run using that same audited Owner authority.

### Owner controls and destructive operations

Only the canonical Owner (`antonny.luty@j-aautomation.com`) may perform mailbox lifecycle or role
administration. Enforce this in server-side authorization and database guards, not only by hiding
buttons. Every operation requires an active Owner session, recent step-up authentication, exact
target/domain validation, a durable idempotency key and an append-only audit event. The database
records `pending`, `external_done` and `complete` without passwords or credential material, and a
completed browser replay returns its recorded safe result without repeating JMAP. An
`external_done` replay completes the pending SQLite/audit side only; an ambiguous `pending`
command first re-reads the live immutable account ID/alias before any safe retry. Reloading the UI
adopts the durable in-flight command for that actor/operation/target instead of bypassing it with a
new key:

- create a mailbox in Stalwart and create its linked portal identity in the same workflow, as
  `worker` by default or as the explicit `project_manager`/`finance_admin` role chosen by Antonny;
- change a linked portal role (non-Owner only); existing sessions are re-evaluated/revoked as the
  action contract requires;
- change a Webmail password by sending the new password only to Stalwart `x:Account/set`; never
  store it in SQLite, logs, audit payloads or browser state;
- offboard/delete a portal identity, which revokes sessions and preserves financial/audit history;
- destroy a Stalwart mailbox, which is a separate destructive confirmation and may remove mailbox
  data. It must never be an implicit cascade from portal offboarding, and it must not be used for
  the canonical Owner.

If a Stalwart mailbox is absent or the directory is temporarily unavailable while a portal link
remains, preserve the local identity, its explicit role, lifecycle state and sessions. Do not infer
that Antonny intended a portal offboarding, mailbox destruction or account-ID replacement from a
directory read. Webmail authentication still fails closed because every delegated login is
revalidated live against Stalwart; do not silently recreate a mailbox or reset its password. A
failed JMAP write must not be reported as success.

### Mail/authentication smoke test

Use a real Owner account and one non-Owner mailbox selected for the test. Capture timestamps,
release SHA, HTTP status and redacted UI results only:

1. Sign in at `https://j-aautomation.com/j-aautomation/app/login` as
   `antonny.luty@j-aautomation.com` with the existing demo password `antonny.luty`; confirm the
   normal Better Auth session and MFA policy still apply.
2. Sign out, then sign in as the same Owner with the real Webmail password; confirm IMAPS fallback
   succeeds and the local demo password still remains valid. Do not record the password.
3. In Projects → Team → Buzones, confirm the live account count and aliases match the current
   Stalwart directory without exposing credentials. Select two non-Owner accounts, provision them
   as `worker`, refresh and confirm both appear in worker/project assignment selectors.
4. Sign in as one provisioned worker with that mailbox's existing Webmail password. Confirm a
   password failure remains a failure, a disabled/offboarded identity cannot create a session, and
   no local password/hash is written as a side effect of IMAP authentication.
5. Create a uniquely named disposable test mailbox only if the customer authorizes it; verify the
   new account in Stalwart WebAdmin/Roundcube and then remove it with the Owner's explicit
   step-up/destructive confirmation. Never use a production mailbox or change an existing user's
   password for this test.
6. If testing update/delete, take a fresh backup first, use only the disposable mailbox, verify the
   audit event and session revocation, and confirm the canonical Owner cannot be deleted, demoted,
   or replaced. Keep provider-side evidence redacted.

The IMAPS test demonstrates native Stalwart validation; it does not inspect or migrate the
underlying hash. A JMAP directory read failure, stale migration, absent token, invalid TLS, or
unresolved Owner guard is a release blocker.

## Host layout and production safety

```text
/etc/jaautomation/jaautomation.env       mode 0600, root-owned
/etc/jaautomation/secrets/stalwart-mail-provisioner.token  root:10001, mode 0640 or stricter
/var/lib/jaautomation/data/              SQLite database and WAL
/var/lib/jaautomation/files/             private receipts, reports, invoices and exports
/var/backups/jaautomation/               online backups and manifests
/opt/jaautomation/current/               active checked-out release
/opt/jaautomation/releases/              retained release directories
/home/kripta/                            operator release archives and checksums
```

Release changes must not overwrite `/var/lib/jaautomation/data`,
`/var/lib/jaautomation/files` or `/etc/jaautomation/jaautomation.env`. Do not use
`drizzle-kit push`, copy a local SQLite file, run the demo seed against production, or expose
ports 5100/5101 directly. Apply only reviewed additive migrations.

The production configuration contract is explicit: keep `JA_OFFLINE_ENABLED=false` for this
go-live, and keep malware scanning disabled with `JA_MALWARE_SCANNER_REQUIRED=false` plus empty
scanner URL/result/provider values so uploaded documents remain truthfully `not_scanned`. The
production examples set `JA_BACKUP_REMOTE_ENABLED=true` as a fail-closed continuity requirement;
do not install that example unchanged. Before starting the backup timer, configure the separate
SSH host, user, key, encryption key, namespace and retention values. If the separate host is not
available during the transition, explicitly set `JA_BACKUP_REMOTE_ENABLED=false` to preserve the
local backup while recording continuity as **pending**; an incomplete remote configuration is a
blocked state, never a successful recovery gate.

Before a release switch, retain the previous release target, one tested rollback image and one
verified local backup. Caddy must pass validation before it is reloaded. The deployment scripts
perform a full release switch and health wait; copying individual source files into the active
tree is not a supported deployment.

## Release archive handoff

The release archive is a source/build handoff, not a database dump. It contains the reviewed
website, portal, packages, migrations, deployment files, tests and the disposable fixture source.
It excludes `.git`, dependency trees, generated build output, SQLite files, private uploads and
secrets.

Use a date-specific archive name; do not hard-code an obsolete handoff date:

```text
/home/kripta/jaautomation-release-YYYYMMDD-final.zip
/home/kripta/jaautomation-release-YYYYMMDD-final.zip.sha256
```

Build and upload from a reviewed tree:

```powershell
$releaseDate = Get-Date -Format 'yyyyMMdd'
pwsh -File scripts/build-release-and-upload.ps1 -ReleaseDate $releaseDate
```

The repository pins Node.js `24.19.0` and pnpm `11.22.0`; verify both before packaging. The
release metadata records these versions, and the production Dockerfiles and host deployer reject
an unsupported Node version.

Use `-NoUpload` for a local archive check, `-Force` only to replace a same-day local archive, and
`-AllowDirty` only when the exact reviewed worktree snapshot is intentionally being packaged.
Do not use `-SkipQualityGates` for a customer release.

On the VPS, inspect and verify the archive before installation:

```bash
less /home/kripta/install-jaautomation-zip-deploy.sh
less /home/kripta/jaautomation-zip-deploy
sha256sum /home/kripta/jaautomation-release-YYYYMMDD-final.zip
sha256sum -c /home/kripta/jaautomation-release-YYYYMMDD-final.zip.sha256
```

The explicit deployer extracts only under `/opt/jaautomation/releases/`, validates the release
shape and Caddy, creates an online backup when a database exists, builds the site and portal,
preserves rollback images, atomically updates `/opt/jaautomation/current`, starts the containers,
waits for local health and reloads Caddy only after validation.

```bash
sudo bash /home/kripta/install-jaautomation-zip-deploy.sh \
  --archive /home/kripta/jaautomation-release-YYYYMMDD-final.zip
```

For first installation or a host where the watcher is not installed, use the reviewed installer
from the release instead:

```bash
sudo bash deployment/scripts/install-vps.sh
```

Review its Caddy and systemd changes first. It must be run with the intended environment file and
host paths; it is not a substitute for the release checksum or application acceptance checks.

## Post-deploy verification

Run the local checks before relying on public HTTPS:

```bash
curl --fail --silent --show-error http://127.0.0.1:5101/j-aautomation/en >/dev/null
curl --fail --silent --show-error http://127.0.0.1:5100/j-aautomation/app/api/health
curl --fail --silent --show-error http://127.0.0.1:5100/j-aautomation/health/ready >/dev/null
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Then check the canonical public paths and the compatibility redirect:

```bash
curl -fsS https://j-aautomation.com/j-aautomation/en >/dev/null
curl -fsS https://j-aautomation.com/j-aautomation/es >/dev/null
curl -fsS https://j-aautomation.com/j-aautomation/pt >/dev/null
curl -fsS https://j-aautomation.com/j-aautomation/app/login >/dev/null
curl -fsSI https://app.j-aautomation.com/
```

Inspect all service state after the switch:

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f /opt/jaautomation/current/deployment/compose.production.yml ps
sudo systemctl status jaautomation.service jaautomation-jobs.timer \
  jaautomation-backup.timer --no-pager
sudo journalctl -u jaautomation-jobs.service -n 200 --no-pager
sudo journalctl -u jaautomation-backup.service -n 100 --no-pager
df -h /
```

The current jobs status is a known open incident: the timer is active but the last service result
is `exit-code`. Do not hide that result with a manual portal action or report the job pipeline as
healthy until the service actor/binding, logs, queued work and two consecutive timer runs have
been verified.

The transition summary contains no jobs-service, `JA_JOB_ACTOR_ID`, service-actor or binding
evidence, and the current read-only SSH account cannot inspect the systemd journal or
`/etc/jaautomation/jaautomation.env`. Consequently, the precise cause of the observed exit code is
**unconfirmed**. A root/operator session must inspect the unit journal and the redacted environment,
then verify the deployment binding; do not infer the cause from the mail-transition summary.

Read-only inspection on 2026-09-01 confirms that the active release symlink targets the
`b3f4889a1c6a...` release built with Node `24.19.0`, while the installed systemd jobs unit still uses
the older optional `EnvironmentFile=-...` definition. The timer triggers every five minutes and the
service exits `1` in about one second, excluding the configured 120-second timeout as the immediate
cause. The journal, protected environment and SQLite binding remain inaccessible without operator
privilege, so the exact runner error is still not proven. Deploy the current allowlisted jobs
environment and reinstall the reviewed unit/timer; changing `/opt/jaautomation/current` alone does
not replace files already installed under `/etc/systemd/system`.

### Jobs diagnosis and two-run evidence procedure

The jobs timer is a five-minute watchdog that keeps the always-on Compose `jobs` worker running.
`active` on the timer means only that systemd will start the container if it is down; it does not
mean that a worker cycle completed. Diagnose as an authorized operator before changing or restarting
the service:

```bash
sudo systemctl status jaautomation-jobs.timer jaautomation-jobs.service --no-pager
sudo systemctl show jaautomation-jobs.timer \
  -p ActiveState -p SubState -p Result -p LastTriggerUSec -p NextElapseUSecRealtime --no-pager
sudo systemctl show jaautomation-jobs.service \
  -p Result -p ExecMainCode -p ExecMainStatus \
  -p ExecMainStartTimestamp -p ExecMainExitTimestamp --no-pager
sudo journalctl -u jaautomation-jobs.service -n 200 --no-pager -o short-iso
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f /opt/jaautomation/current/deployment/compose.production.yml ps jobs
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f /opt/jaautomation/current/deployment/compose.production.yml logs --tail 50 jobs
```

Check only redacted environment presence; never print the environment file, Compose-resolved
secrets, webhook secrets or encryption keys:

```bash
sudo awk -F= '/^(JA_TENANT_ID|JA_DEPLOYMENT_ID|JA_DATABASE_PATH|JA_DOCUMENT_ROOT|JA_JOB_ACTOR_ID|JA_OUTBOX_WEBHOOK_URL|JA_OUTBOX_WEBHOOK_SECRET)=/ {
  value=$0; sub(/^[^=]*=/, "", value); print $1 "=" (length(value) ? "set" : "empty")
}' /etc/jaautomation/jaautomation.env
```

Remove the deprecated `JA_JOB_ACTOR_ID` setting during environment maintenance. The current Compose
jobs service uses an explicit environment allowlist, so it does not pass that legacy row or unrelated
portal/backup secrets into the worker. The worker resolves the active deployment singleton
service-actor binding in SQLite. Verify or provision that
binding through the operator-only, idempotent command (use the actual binder user ID, not the
placeholder below), then perform at most one manual run to validate a correction:

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f /opt/jaautomation/current/deployment/compose.production.yml run --rm --no-deps \
  service-actor provision \
  --actor-id jobs-service-v1 \
  --name 'J&A durable jobs v1' \
  --bound-by-user-id owner-user-id
sudo systemctl start jaautomation-jobs.service
sudo systemctl status jaautomation-jobs.service --no-pager
sudo journalctl -u jaautomation-jobs.service -n 100 --no-pager -o short-iso
```

Install the unit definitions from the exact active candidate before evidence capture, then use the
repository verifier for one current run or two timer-triggered runs:

```bash
sudo install -o root -g root -m 0644 \
  /opt/jaautomation/current/deployment/jaautomation-jobs.service \
  /etc/systemd/system/jaautomation-jobs.service
sudo install -o root -g root -m 0644 \
  /opt/jaautomation/current/deployment/jaautomation-jobs.timer \
  /etc/systemd/system/jaautomation-jobs.timer
sudo systemctl daemon-reload
sudo systemctl reset-failed jaautomation-jobs.service
sudo systemctl enable --now jaautomation-jobs.timer
sudo bash /opt/jaautomation/current/deployment/scripts/verify-vps.sh \
  https://j-aautomation.com/j-aautomation --wait-two-automatic-runs \
  | sudo tee /var/log/jaautomation-jobs-two-runs.log
```

Capture the durable queue/run state without payloads or secrets before and after each automatic
invocation:

```bash
sudo /opt/jaautomation/runtime/node/bin/node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/var/lib/jaautomation/data/jaautomation.sqlite', { readOnly: true });
const jobs = db.prepare(\"SELECT state, COUNT(*) AS count FROM job GROUP BY state ORDER BY state\").all();
const runs = db.prepare(\"SELECT kind,state,outcome,error_code,started_at,finished_at FROM job_run ORDER BY started_at DESC LIMIT 20\").all();
console.log(JSON.stringify({ jobs, recentRuns: runs }));
db.close();
"
```

After the manual validation, wait for two consecutive `jobs.cycle` records from the always-on
container. For each one record the docker log line, the jobs container `running` state, and the
queue/run state transition (`queued` → `claimed`/`running` → `succeeded` or an
explicit retryable/terminal failure). A queued row, an active timer, or two manual starts is not
CORE-16 evidence. Preserve failure and retry metadata; do not clear the queue manually. The current
live record remains **OPEN** until those two automatic cycles are attached to the release evidence.

## Rollback and incident-safe handling

The ZIP deployer keeps the prior release, image tags and Caddy snippet so a failed activation can
be rolled back without touching the data or document volumes. First capture state and logs:

```bash
sudo readlink -f /opt/jaautomation/current
sudo awk -F= '/^(release|commit|node|pnpm|source_snapshot)=/{print}' \
  /opt/jaautomation/current/RELEASE-BUILD.txt
sudo journalctl -u jaautomation-zip-deploy.service -n 200 --no-pager
sudo systemctl status jaautomation.service jaautomation-jobs.timer \
  jaautomation-backup.timer --no-pager
```

If the deployer reports a failed activation, use its recorded rollback state and the previously
validated Compose release/image with `--no-build`; do not run `docker compose down`, delete a
release directory, delete a database/file root or overwrite an issued artifact. Validate Caddy
before reloading it and repeat the local/public smoke checks. If financial history, private files,
or an issued artifact appears inconsistent, stop writes and follow
[INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).

## Backups and continuity

The daily local backup uses the online SQLite backup API and a private-file manifest. Verify age,
integrity, foreign keys, document hashes and safe paths before considering a backup usable:

```bash
sudo systemctl status jaautomation-backup.timer --no-pager
sudo journalctl -u jaautomation-backup.service -n 200 --no-pager
```

The last recorded local backup result is `Result=success`. Separate-host encrypted replication and an
isolated restore drill remain **pending**. The Client Essential recovery gate requires a separately
administered SSH destination, a complete encrypted upload with a completion marker/hash, retention
verification and a restore from the remote copy. Until that evidence exists, the system has local
backup evidence only and must not be called continuity-ready.

### Encrypted remote-copy and restore procedure

The mechanism is implemented in `deployment/scripts/continuity-backup.mjs`; no remote continuity
acceptance is implied by the code or by the local `test:continuity` suite. Keep the SSH key and the
32-byte encryption key in the root-owned `0600` environment file, never in Git, command arguments,
shell history or logs. Required remote settings are `JA_BACKUP_REMOTE_ENABLED=true`,
`JA_BACKUP_REMOTE_HOST`, `JA_BACKUP_REMOTE_USER`, `JA_BACKUP_REMOTE_PORT`, `JA_BACKUP_SSH_KEY`,
`JA_BACKUP_ENCRYPTION_KEY`, `JA_BACKUP_REMOTE_NAMESPACE`, `JA_BACKUP_REMOTE_ROOT` (absolute but not
`/`) and `JA_BACKUP_REMOTE_RETENTION_DAYS` (at least 30). An incomplete enabled configuration must
remain **BLOCKED**; set it disabled only while recording off-site recovery as pending.

Check configuration and key availability without transferring data. The shell loads the protected
environment without echoing it:

```bash
sudo bash -c '
  set -a
  . /etc/jaautomation/jaautomation.env
  set +a
  cd /opt/jaautomation/current
  exec /opt/jaautomation/runtime/node/bin/node deployment/scripts/continuity-backup.mjs --readiness
'
```

`READY` here means the configured key/path/host prerequisites are usable; it is not proof that a
remote copy exists or can be restored. Run one scheduled backup and inspect its structured output:

```bash
sudo systemctl start jaautomation-backup.service
sudo systemctl status jaautomation-backup.service --no-pager
sudo journalctl -u jaautomation-backup.service -n 200 --no-pager -o short-iso
```

The completed record must include a remote backup ID, encrypted snapshot and encrypted manifest,
matching remote byte lengths/SHA-256 values, and a completion marker written last. Partial transfer,
hash mismatch, remote conflict or a missing marker is a failure, not usable continuity evidence.

For the isolated restore drill, set `JA_BACKUP_RESTORE_ID` (or leave it empty to select the latest
completed marker), `JA_RESTORE_DATABASE_PATH` and `JA_RESTORE_DOCUMENT_ROOT` in the protected file.
Both restore targets must be dedicated empty paths that do not overlap the live database or private
document root. Then run the explicit drill entrypoint with the same protected environment:

```bash
sudoedit /etc/jaautomation/jaautomation.env
sudo bash -c '
  set -a
  . /etc/jaautomation/jaautomation.env
  set +a
  cd /opt/jaautomation/current
  exec /opt/jaautomation/runtime/node/bin/node deployment/scripts/continuity-backup.mjs --restore-drill
'
```

Record the structured `PASS` result, backup ID, completion-marker/hash verification, schema version,
SQLite `integrity_check` and foreign-key result, issued-invoice snapshot equality, at least two
private artifact hashes/byte lengths, and RPO/RTO timings. Execute the drill on a separate host or
isolated environment without access to live storage. A local fixture (`ops:backup:test`,
`ops:restore-test` or `test:continuity`) validates mechanics only and cannot close this gate.

See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for the staged local restore procedure and
[deployment/README_VPS.md](../deployment/README_VPS.md) for the supported host integration.

## First-owner provisioning

After reviewed migrations are applied to the intended production database, provision the first
owner through the operator-only tools target. The password is entered interactively and is never
placed in this runbook:

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f /opt/jaautomation/current/deployment/compose.production.yml \
  build portal bootstrap-owner
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f /opt/jaautomation/current/deployment/compose.production.yml \
  run --rm --no-deps \
  -e JA_BOOTSTRAP_EMAIL=antonny.luty@j-aautomation.com \
  -e JA_BOOTSTRAP_NAME='Antonny Luty' \
  bootstrap-owner
```

The canonical owner signs in at `/j-aautomation/app/login` and enrolls MFA. Once the live mail
integration is healthy, run the idempotent reconciliation described in **Initial reconciliation
and default roles** so all current Stalwart mailboxes receive portal access as `worker`, while
`antonny.luty@j-aautomation.com` remains the sole `owner_admin`. Invitations remain available for
non-mail-linked identities. No shared account, passwordless role switch or production demo seed is
supported.

## Durable jobs service actor

The jobs process uses the active deployment-scoped singleton service-actor binding in SQLite; it no
longer accepts a human `JA_JOB_ACTOR_ID`. Apply migration `0032_client_essential_worker_statement_jobs`
before enabling Worker statement jobs. After the first owner exists, provision the actor through
the operator-only tools target. `JA_TENANT_ID` and `JA_DEPLOYMENT_ID` are read from the production
environment file and must match the database identity; the binder must be an active `owner_admin`
or `finance_admin`.

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f /opt/jaautomation/current/deployment/compose.production.yml \
  build service-actor
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f /opt/jaautomation/current/deployment/compose.production.yml \
  run --rm --no-deps \
  service-actor provision \
  --actor-id jobs-service-v1 \
  --name 'J&A durable jobs v1' \
  --bound-by-user-id owner-user-id
```

The exact capability allowlist is applied by the CLI when `--capabilities` is omitted. Repeating
the same command is an idempotent no-op. Rotate only after confirming that no job run is claimed by
the current actor; rotation disables the previous actor as history and advances the binding version:

```bash
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f /opt/jaautomation/current/deployment/compose.production.yml \
  run --rm --no-deps \
  service-actor rotate \
  --actor-id jobs-service-v2 \
  --name 'J&A durable jobs v2' \
  --bound-by-user-id finance-user-id
```

A missing, disabled, drifted or capability-incomplete binding fails closed before queued work is
claimed. Keep the initiating human identity on the queued command/audit record; it is not the
execution principal.

## ANEXO D acceptance evidence

The local contract's `ANEXO D` is a contractual UAT gate, separate from implementation and focused
test evidence. Keep each result dated, tied to the reviewed release SHA, and attributable to the
responsible J&A/EVOCON approver. A route returning HTTP 200 or a source inspection is not a signed
acceptance.

### D.1 Web corporativa

Run the public reachability and Caddy-boundary checks without credentials or state changes:

```bash
BASE_URL=https://j-aautomation.com
curl --fail --silent --show-error "$BASE_URL/health/live" >/dev/null
for locale in en es pt; do
  curl --fail --silent --show-error "$BASE_URL/j-aautomation/$locale" >/dev/null
  curl --fail --silent --show-error "$BASE_URL/j-aautomation/$locale/contact" >/dev/null
  curl --fail --silent --show-error "$BASE_URL/j-aautomation/$locale/careers" >/dev/null
done
curl --fail --silent --show-error "$BASE_URL/j-aautomation/app/login" >/dev/null
test "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/j-aautomation/health/ready")" = 404
```

Attach screenshots or trace evidence at 360/390/768/1440, the three localized URLs, and confirmation
that the agreed Home, Capabilities/Services, Industries, Projects, Aquarex, About, Careers, Contact,
Employee Portal and legal sections render with the approved J&A content/images. Attach
contact/support/career form outcomes with non-secret message IDs. The 2026-08-28 browser checkpoint
proves local steps 1–29 and the deployed routing assertions in step 32; it does not by itself prove
D.1 content approval or form delivery. Until those artifacts and approval exist, D.1 remains
**PENDING**.

### D.3 Migración de correo

D.3 requires provider-side evidence that the agreed accounts and aliases were created, technically
migrable history was synchronized within the agreed limits, SPF/DKIM/DMARC are active, external send
and receive both succeed, and application notifications reach the agreed mailbox. The Stalwart/SES
inventory retained above is a transition summary, not D.3 acceptance. Keep only a redacted account
checklist, DNS query output, timestamps and message IDs; never place passwords, private keys, API
tokens or full message contents in the repository or runbook.

The contractual handoff remains **PENDING** until D.1 and D.3 evidence is attached and signed by the
responsible J&A/EVOCON approvers. Public routing, Caddy validation, a successful local backup, or a
mail-service inventory must not be described as full contractual acceptance or `CLIENT READY`.

## References and release decision

- [deployment/README_VPS.md](../deployment/README_VPS.md) — supported host integration and service layout.
- [RELEASE_ZIP_DEPLOY.md](RELEASE_ZIP_DEPLOY.md) — archive creation, checksum and deployer details.
- [BACKUP_RESTORE.md](BACKUP_RESTORE.md) — local backup and staged restore.
- [SHOWCASE_ACCESS.md](SHOWCASE_ACCESS.md) — invite-only access and first-owner operations.

The deployed website routes and Caddy boundary are live, but the job-service failure and external
continuity backup are still open. Deployment, a successful local backup, or a passing Caddy
configuration alone does not change the Client Essential checklist verdict; release status must be
based on the checklist and its executable finance, security, browser and recovery evidence.
