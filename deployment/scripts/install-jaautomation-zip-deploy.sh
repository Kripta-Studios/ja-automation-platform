#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

WATCH_DIR=/home/kripta
DEPLOYER_SOURCE="$WATCH_DIR/jaautomation-zip-deploy"
DEPLOYER_TARGET=/usr/local/sbin/jaautomation-zip-deploy
ARCHIVE=''

usage() {
  printf 'Uso: sudo bash %s [--archive /home/kripta/jaautomation-release-YYYYMMDD-final.zip]\n' "$0"
}

while (($#)); do
  case "$1" in
    --archive)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      ARCHIVE=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

[[ ${EUID} -eq 0 ]] || { printf 'Ejecuta este instalador con sudo.\n' >&2; exit 1; }
[[ -f "$DEPLOYER_SOURCE" ]] || { printf 'Falta %s\n' "$DEPLOYER_SOURCE" >&2; exit 1; }
[[ -f /etc/jaautomation/jaautomation.env ]] || { printf 'Falta /etc/jaautomation/jaautomation.env\n' >&2; exit 1; }
[[ -f /etc/caddy/Caddyfile ]] || { printf 'Falta /etc/caddy/Caddyfile\n' >&2; exit 1; }
[[ -f /etc/caddy/jaautomation.caddy ]] || { printf 'Falta /etc/caddy/jaautomation.caddy\n' >&2; exit 1; }
[[ -d "$(readlink -f /opt/jaautomation/current)" ]] || { printf 'Falta un release activo en /opt/jaautomation/current\n' >&2; exit 1; }

for command_name in docker unzip zipinfo sha256sum curl caddy systemctl flock; do
  command -v "$command_name" >/dev/null 2>&1 || { printf 'Falta el comando %s\n' "$command_name" >&2; exit 1; }
done
docker compose version >/dev/null

if [[ -n "$ARCHIVE" ]]; then
  [[ "$ARCHIVE" == "$WATCH_DIR"/*.zip ]] || { printf 'El ZIP debe estar en %s\n' "$WATCH_DIR" >&2; exit 1; }
  [[ -f "$ARCHIVE" ]] || { printf 'No existe %s\n' "$ARCHIVE" >&2; exit 1; }
fi

install -o root -g root -m 0750 "$DEPLOYER_SOURCE" "$DEPLOYER_TARGET"
install -d -o root -g root -m 0750 /var/lib/jaautomation-zip-deploy

cat >/etc/systemd/system/jaautomation-zip-deploy.service <<'UNIT'
[Unit]
Description=Deploy a reviewed J&A Automation release ZIP
After=docker.service caddy.service network-online.target
Wants=docker.service caddy.service network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/jaautomation-zip-deploy
TimeoutStartSec=90min
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=6
UNIT

cat >/etc/systemd/system/jaautomation-zip-deploy.path <<'UNIT'
[Unit]
Description=Watch /home/kripta for J&A Automation release ZIPs

[Path]
PathChanged=/home/kripta
Unit=jaautomation-zip-deploy.service

[Install]
WantedBy=multi-user.target
UNIT

cat >/etc/systemd/system/jaautomation-zip-deploy.timer <<'UNIT'
[Unit]
Description=Retry scanning for stable J&A Automation release ZIPs

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=15s
Unit=jaautomation-zip-deploy.service
Persistent=true

[Install]
WantedBy=timers.target
UNIT

"$DEPLOYER_TARGET" --initialize
systemctl daemon-reload

if [[ -n "$ARCHIVE" ]]; then
  "$DEPLOYER_TARGET" --archive "$ARCHIVE"
fi

systemctl enable --now jaautomation-zip-deploy.path jaautomation-zip-deploy.timer
systemctl start jaautomation-zip-deploy.service

printf 'Instalación completada.\n'
systemctl --no-pager --full status jaautomation-zip-deploy.path jaautomation-zip-deploy.timer || true
