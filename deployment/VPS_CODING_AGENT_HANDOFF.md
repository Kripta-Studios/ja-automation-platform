# VPS coding-agent handoff: J&A Automation showcase

Copy this message to the coding/deployment agent running on the VPS after the archive and its
checksum have been uploaded to `/home/kripta`.

```text
Deploy the J&A Automation V3 showcase archive at
/home/kripta/ja-automation-v3-showcase-20260819.zip.

Guardrails:
1. This is a disposable synthetic showcase deployment. Do not use it for customer or production
   data, and do not enable automatic invoice issue or send.
2. Do not edit, regenerate, rename, or delete
   J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md.
3. Do not copy a local SQLite database, commit secrets, expose ports 5100/5101, or use
   drizzle-kit push.
4. Before replacing any existing service or data, show the operator the target paths and take an
   online backup of /var/lib/jaautomation if it exists. Continue only after the operator confirms
   the showcase reset.

Run these commands as root/sudo from the VPS shell:

sudo -v
sha256sum /home/kripta/ja-automation-v3-showcase-20260819.zip
# Compare the output with the SHA-256 supplied by the release operator.

sudo systemctl stop jaautomation.service 2>/dev/null || true
sudo install -d -o root -g root -m 0750 /opt/jaautomation/releases
sudo unzip -q -o /home/kripta/ja-automation-v3-showcase-20260819.zip -d /opt/jaautomation/releases
sudo ln -sfn /opt/jaautomation/releases/ja-automation-v3-showcase-20260819 /opt/jaautomation/current
cd /opt/jaautomation/current

# Install/reconcile the host integration, then install the showcase-only environment.
sudo bash deployment/scripts/install-vps.sh
sudo install -o root -g root -m 0600 deployment/jaautomation.showcase.env.example \
  /etc/jaautomation/jaautomation.env
sudo sed -i "s|^JA_AUTH_SECRET=.*|JA_AUTH_SECRET=$(openssl rand -hex 32)|" \
  /etc/jaautomation/jaautomation.env
sudo grep -E '^(JA_DEMO_MODE|JA_ALLOWED_ORIGINS|JA_PUBLIC_SITE_ORIGIN|JA_WEBAUTHN_RP_ID|JA_WEBAUTHN_ORIGIN)=' \
  /etc/jaautomation/jaautomation.env

sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml config --quiet
sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  -f deployment/compose.production.yml build site portal demo-seed

# This intentionally recreates the SQLite showcase database and its synthetic private documents.
# The seed prints the owner ID; use it only as the leased-job service actor.
OWNER_ID=$(sudo docker compose --env-file /etc/jaautomation/jaautomation.env \
  --profile tools -f deployment/compose.production.yml run --rm --no-deps demo-seed \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["demoUserIds"]["admin"])')
test -n "$OWNER_ID" && test "$OWNER_ID" != "null"
sudo sed -i "s|^JA_JOB_ACTOR_ID=.*|JA_JOB_ACTOR_ID=$OWNER_ID|" \
  /etc/jaautomation/jaautomation.env

sudo systemctl daemon-reload
sudo systemctl enable --now jaautomation.service
sudo systemctl enable --now jaautomation-jobs.timer jaautomation-backup.timer
sudo systemctl --no-pager --full status jaautomation.service jaautomation-jobs.timer jaautomation-backup.timer
sudo bash deployment/scripts/verify-vps.sh https://gex-dashboard.hopto.org/j-aautomation

Final smoke test:
- Open https://gex-dashboard.hopto.org/j-aautomation/app/login.
- Select “Owner admin · Antonny”. The demo login has no password by design.
- Confirm the dashboard, Projects, Planning, Reports, Expenses, Documents, Billing, Finance and
  Audit sections contain the seeded showcase records.
- Open a draft invoice and request a PDF/report from the portal. Confirm the J&A Automation logo is
  in the generated PDF header.
- Do not issue or send an invoice during the showcase.

If sudo requests a password or any command fails, stop and report the exact command and output.
Do not bypass the failure by changing the authority specification or deleting unrelated releases.
```

The owner/admin showcase identity is Antonny Nascimento (`antonny.luty@j-aautomation.com`). The
role-button login is intentionally passwordless only while `JA_DEMO_MODE=true`; rotate the secret,
disable demo mode and use invite-only Better Auth before any real use.
