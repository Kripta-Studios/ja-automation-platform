#!/usr/bin/env bash
set -Eeuo pipefail
receipt=/tmp/ja-ux-release-receipt.json
archive=$(python3 -c 'import json;print(json.load(open("/tmp/ja-ux-release-receipt.json"))["path"])')
expected=$(python3 -c 'import json;print(json.load(open("/tmp/ja-ux-release-receipt.json"))["sha256"])')
target=/home/kripta/jaautomation-operational-ux-20260922.zip
[[ -f "$archive" && ! -e "$target" ]]
[[ $(sha256sum "$archive" | cut -d ' ' -f 1) == "$expected" ]]
systemctl stop jaautomation-zip-deploy.path jaautomation-zip-deploy.timer
finish() {
  result=$?
  trap - EXIT
  if [[ $result -ne 0 && -f "$target" ]]; then
    # Preserve a failed candidate outside the watched directory; do not retry it automatically.
    quarantine=$(mktemp -d /tmp/ja-ux-deploy-failed.XXXXXX)
    mv -- "$target" "$quarantine/"
    echo "FAILED_ARCHIVE_PRESERVED=$quarantine" >&2
  fi
  systemctl start jaautomation-zip-deploy.path jaautomation-zip-deploy.timer || {
    echo 'Failed to restore deployment watchers' >&2
    [[ $result -ne 0 ]] || result=1
  }
  exit "$result"
}
trap finish EXIT
# Respect an in-flight deployment: return without moving the reviewed archive.
state=$(systemctl show jaautomation-zip-deploy.service --property=ActiveState --value)
[[ "$state" != active && "$state" != activating ]] || { echo 'An existing deploy scan is still running; no archive was moved.'; exit 2; }
mv "$archive" "$target"
/usr/local/sbin/jaautomation-zip-deploy --archive "$target"
[[ $(readlink -f /opt/jaautomation/current) == "/opt/jaautomation/releases/ja-automation-$expected" ]]
echo "ACTIVATED_SHA256=$expected"
