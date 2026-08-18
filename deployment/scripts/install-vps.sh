#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo bash deployment/scripts/install-vps.sh" >&2
  exit 1
fi

RELEASE_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
AVAILABLE_KB=$(df --output=avail / | tail -1 | tr -d ' ')
if (( AVAILABLE_KB < 10485760 )); then
  echo "At least 10 GiB free is required for a safe image build." >&2
  exit 1
fi
command -v docker >/dev/null
command -v caddy >/dev/null
docker compose version >/dev/null

install -d -o 10001 -g 10001 -m 0750 /var/lib/j-aautomation /var/lib/j-aautomation/documents
install -d -o root -g root -m 0750 /etc/j-aautomation /opt/j-aautomation/releases
if [[ ! -f /etc/j-aautomation/portal.env ]]; then
  install -o root -g root -m 0600 "$RELEASE_ROOT/deployment/portal.env.example" /etc/j-aautomation/portal.env
  echo "Created /etc/j-aautomation/portal.env. Replace JA_AUTH_SECRET before starting the service."
fi

install -o root -g root -m 0644 "$RELEASE_ROOT/deployment/jaautomation.service" /etc/systemd/system/jaautomation.service
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
systemctl enable jaautomation.service
systemctl reload caddy
echo "VPS integration installed. Edit /etc/j-aautomation/portal.env, then seed and start the service."
