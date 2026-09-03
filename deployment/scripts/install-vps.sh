#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo bash deployment/scripts/install-vps.sh" >&2
  exit 1
fi

RELEASE_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
if [[ "$RELEASE_ROOT" != "/opt/jaautomation/current" ]]; then
  echo "Install the reviewed release at /opt/jaautomation/current before running this script." >&2
  exit 1
fi
AVAILABLE_KB=$(df --output=avail / | tail -1 | tr -d ' ')
if (( AVAILABLE_KB < 10485760 )); then
  echo "At least 10 GiB free is required for a safe image build." >&2
  exit 1
fi
command -v docker >/dev/null
command -v caddy >/dev/null
NODE_RUNTIME=/opt/jaautomation/runtime/node/bin/node
if [[ ! -x "$NODE_RUNTIME" || "$("$NODE_RUNTIME" --version)" != "v24.19.0" ]]; then
  echo "Node.js v24.19.0 is required at $NODE_RUNTIME for the host backup service." >&2
  exit 1
fi
docker compose version >/dev/null

install -d -o 10001 -g 10001 -m 0750 /var/lib/jaautomation/data /var/lib/jaautomation/files
for directory in receipts reports invoices technical plc-backups exports temp; do
  install -d -o 10001 -g 10001 -m 0750 "/var/lib/jaautomation/files/$directory"
done
install -d -o 10001 -g 10001 -m 0750 /var/backups/jaautomation
install -d -o root -g root -m 0750 /etc/jaautomation /opt/jaautomation/releases
if [[ ! -f /etc/jaautomation/jaautomation.env ]]; then
  install -o root -g root -m 0600 "$RELEASE_ROOT/deployment/jaautomation.env.example" /etc/jaautomation/jaautomation.env
  echo "Created /etc/jaautomation/jaautomation.env. Replace JA_AUTH_SECRET before starting the service."
fi

install -o root -g root -m 0644 "$RELEASE_ROOT/deployment/jaautomation.service" /etc/systemd/system/jaautomation.service
install -o root -g root -m 0644 \
  "$RELEASE_ROOT/deployment/jaautomation-jobs.service" \
  "$RELEASE_ROOT/deployment/jaautomation-jobs.timer" \
  "$RELEASE_ROOT/deployment/jaautomation-backup.service" \
  "$RELEASE_ROOT/deployment/jaautomation-backup.timer" \
  /etc/systemd/system/
install -o root -g root -m 0644 "$RELEASE_ROOT/deployment/Caddyfile.snippet" /etc/caddy/jaautomation.caddy

CADDYFILE=/etc/caddy/Caddyfile
BACKUP="${CADDYFILE}.before-jaautomation.$(date +%Y%m%d%H%M%S)"
cp -a "$CADDYFILE" "$BACKUP"
python3 - "$CADDYFILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
directive = "    import /etc/caddy/jaautomation.caddy\n\n"
if directive not in text:
    marker = "    # 5. Tu Bot Financiero actual"
    if marker not in text:
        raise SystemExit("Caddy marker not found; no changes written")
    text = text.replace(marker, directive + marker, 1)
    path.write_text(text)
PY

if ! caddy validate --config "$CADDYFILE" --adapter caddyfile; then
  cp -a "$BACKUP" "$CADDYFILE"
  echo "Caddy validation failed. Restored $BACKUP" >&2
  exit 1
fi

systemctl daemon-reload
systemctl enable jaautomation.service jaautomation-jobs.timer jaautomation-backup.timer
systemctl reload caddy
echo "VPS integration installed. Edit /etc/jaautomation/jaautomation.env, then validate and start the service and timers."
