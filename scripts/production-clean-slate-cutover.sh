#!/usr/bin/env bash
# One reviewed, explicit cutover of the already-rehearsed production database.
# The original pair remains in a private directory. This script deliberately
# stops on any failed gate with writers stopped; recovery is operator-reviewed.
set -Eeuo pipefail
umask 077

[[ ${EUID} -eq 0 && ${1:-} == --execute-reviewed-cutover ]] || {
  echo 'Run as root with --execute-reviewed-cutover' >&2
  exit 2
}
ROOT=/home/kripta/ja-automation-platform-vps-hotfix
LIVE=/var/lib/jaautomation
DB=$LIVE/data/jaautomation.sqlite
FILES=$LIVE/files
EXPECTED=d215671b99323d6d8c4ce34b74b4f8e09c860a7bad1a662a542a8350362e6365
TAG=zip-d215671b99323d6d8c4ce34b74b4f8e0
NODE=/opt/jaautomation/runtime/node/bin/node
OUT=/home/kripta/ja-clean-slate-cutover-$(date -u +%Y%m%dT%H%M%SZ)
export OUT

[[ $(readlink -f /opt/jaautomation/current) == /opt/jaautomation/releases/ja-automation-$EXPECTED ]]
[[ $(systemctl is-active stalwart.service) == active ]]
[[ $(systemctl is-active jaautomation-zip-deploy.path || true) == inactive ]]
[[ $(systemctl is-active jaautomation-zip-deploy.timer || true) == inactive ]]
[[ $(systemctl is-active jaautomation-zip-deploy.service || true) != active ]]
[[ $(systemctl is-active jaautomation-zip-deploy.service || true) != activating ]]
[[ $(docker inspect deployment-portal-1 --format '{{.Config.Image}}') == ja-automation-portal:$TAG ]]
[[ $(docker inspect deployment-jobs-1 --format '{{.Config.Image}}') == ja-automation-portal:$TAG ]]
[[ $(docker inspect deployment-site-1 --format '{{.Config.Image}}') == ja-automation-site:$TAG ]]
[[ $(grep -c '^JA_RELEASE_TAG=zip-d215671b99323d6d8c4ce34b74b4f8e0$' /etc/jaautomation/jaautomation.env) == 1 ]]
[[ -f $DB && -d $FILES && -x $NODE ]]
[[ ! -e $OUT && ! -e $LIVE/data/jaautomation.sqlite.staged && ! -e $LIVE/files.staged ]]
python3 - <<'PY'
import sqlite3
p='/var/lib/jaautomation/data/jaautomation.sqlite'
c=sqlite3.connect(f'file:{p}?mode=ro',uri=True)
assert c.execute('SELECT MAX(version) FROM schema_migration').fetchone()[0]==60
for table, expected in [('user',118),('account',118),('mail_identity',99)]:
    assert c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]==expected
c.close()
print('IDENTITY_PREFLIGHT_PASS')
PY

exec 9>/var/lib/jaautomation-zip-deploy/deploy.lock
flock -n 9 || { echo 'Deployment lock busy' >&2; exit 1; }
install -d -o root -g root -m 0700 "$OUT" "$OUT/pre-cutover" "$OUT/rollback"
echo "CUTOVER_DIR=$OUT"

echo 'STOPPING_APP_WRITERS'
systemctl stop jaautomation-jobs.timer jaautomation-jobs.service jaautomation-backup.timer jaautomation-backup.service
docker stop deployment-portal-1 >/dev/null
[[ $(docker inspect deployment-portal-1 --format '{{.State.Running}}') == false ]]
[[ $(docker inspect deployment-jobs-1 --format '{{.State.Running}}') == false ]]
if lsof "$DB" "$DB-wal" "$DB-shm" 2>/dev/null; then
  echo 'Database is still held open; cutover stopped' >&2
  exit 1
fi

echo 'CHECKPOINT_AND_COLD_BACKUP'
checkpoint=$(sqlite3 "$DB" 'PRAGMA wal_checkpoint(TRUNCATE);')
[[ $checkpoint == '0|0|0' && ! -s $DB-wal ]]
[[ $(sqlite3 "$DB" 'PRAGMA integrity_check;') == ok ]]
[[ -z $(sqlite3 "$DB" 'PRAGMA foreign_key_check;') ]]
cp -a "$DB" "$OUT/pre-cutover/original.sqlite"
for sidecar in -wal -shm; do
  if [[ -e $DB$sidecar ]]; then cp -a "$DB$sidecar" "$OUT/pre-cutover/original.sqlite$sidecar"; fi
done
cp -a "$FILES" "$OUT/pre-cutover/original-files"
sha256sum "$OUT/pre-cutover/original.sqlite" > "$OUT/pre-cutover/database.sha256"
(cd "$OUT/pre-cutover/original-files" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) > "$OUT/pre-cutover/artifacts.sha256"
[[ $(sha256sum "$DB" | cut -d ' ' -f 1) == $(cut -d ' ' -f 1 "$OUT/pre-cutover/database.sha256") ]]

echo 'REHEARSING_ON_COLD_COPIES'
cp -a "$OUT/pre-cutover/original.sqlite" "$OUT/working.rehearsal.sqlite"
cp -a "$OUT/pre-cutover/original-files" "$OUT/working.rehearsal-artifacts"
cd "$ROOT"
"$NODE" --experimental-strip-types scripts/rehearse-clean-slate.ts --rehearsal \
  --database "$OUT/working.rehearsal.sqlite" \
  --artifacts "$OUT/working.rehearsal-artifacts" \
  --archive "$OUT/original.rehearsal-archive" > "$OUT/applied.json"
"$NODE" --experimental-strip-types scripts/rehearse-clean-slate.ts --rehearsal \
  --database "$OUT/working.rehearsal.sqlite" \
  --artifacts "$OUT/working.rehearsal-artifacts" \
  --archive "$OUT/original.rehearsal-archive" > "$OUT/idempotent.json"
python3 - <<'PY'
import hashlib, json, os, sqlite3
from pathlib import Path
p=Path(os.environ['OUT'])
a=json.loads((p/'applied.json').read_text())
b=json.loads((p/'idempotent.json').read_text())
assert a['status']=='applied' and b['status']=='already_applied'
assert a['integrity']==b['integrity']=='ok'
assert a['foreignKeyFailures']==b['foreignKeyFailures']==0
assert a['retained']==b['retained']=={'clientId':'client-020-impc','projectIds':['project-cp020-bbs-mexico','project-cp020-dfw']}
assert a['protectedTableDigests']==b['protectedTableDigests']
assert a['postCleanManifestSha256']==b['postCleanManifestSha256']
assert a['retainedArtifactManifestSha256']==b['retainedArtifactManifestSha256']
assert a['after']['client']==1 and a['after']['project']==2
for table in ['user','account','mail_identity']:
    assert a['before'][table]==a['after'][table]
for table in ['invoice','daily_report','time_entry','expense']:
    assert a['after'][table]==0
assert not a['blockedReferences']
old=sqlite3.connect(f"file:{p/'pre-cutover/original.sqlite'}?mode=ro&immutable=1",uri=True)
new=sqlite3.connect(f"file:{p/'working.rehearsal.sqlite'}?mode=ro&immutable=1",uri=True)
assert old.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").fetchall()==new.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").fetchall()
assert new.execute('SELECT MAX(version) FROM schema_migration').fetchone()[0]==60
assert new.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not new.execute('PRAGMA foreign_key_check').fetchall()
assert sorted(x[0] for x in new.execute('SELECT id FROM client'))==['client-020-impc']
assert sorted(x[0] for x in new.execute('SELECT id FROM project'))==['project-cp020-bbs-mexico','project-cp020-dfw']
assert hashlib.sha256((p/'pre-cutover/original.sqlite').read_bytes()).hexdigest()==a['originalDatabaseSha256']
old.close(); new.close()
print('COLD_REHEARSAL_PASS', {k:(a['before'][k],a['after'][k]) for k in ['client','project','user','account','mail_identity','invoice','daily_report','time_entry','expense']})
PY

echo 'STAGING_CLEAN_PAIR'
[[ ! -e $OUT/working.rehearsal.sqlite-wal && ! -e $OUT/working.rehearsal.sqlite-shm ]]
[[ ! -e $LIVE/data/jaautomation.sqlite.staged && ! -e $LIVE/files.staged ]]
cp -a "$OUT/working.rehearsal.sqlite" "$LIVE/data/jaautomation.sqlite.staged"
cp -a "$OUT/working.rehearsal-artifacts" "$LIVE/files.staged"
[[ $(stat -c '%u:%g:%a' "$LIVE/data/jaautomation.sqlite.staged") == $(stat -c '%u:%g:%a' "$DB") ]]
[[ $(stat -c '%u:%g:%a' "$LIVE/files.staged") == $(stat -c '%u:%g:%a' "$FILES") ]]
staged_sha=$(sha256sum "$LIVE/data/jaautomation.sqlite.staged" | cut -d ' ' -f 1)
[[ $staged_sha == $(sha256sum "$OUT/working.rehearsal.sqlite" | cut -d ' ' -f 1) ]]
[[ ! -e $LIVE/data/jaautomation.sqlite.staged-wal && ! -e $LIVE/data/jaautomation.sqlite.staged-shm ]]

echo 'PROMOTING_CLEAN_PAIR'
mv "$DB" "$OUT/rollback/original.sqlite"
for sidecar in -wal -shm; do
  if [[ -e $DB$sidecar ]]; then mv "$DB$sidecar" "$OUT/rollback/original.sqlite$sidecar"; fi
done
mv "$FILES" "$OUT/rollback/original-files"
mv "$LIVE/data/jaautomation.sqlite.staged" "$DB"
mv "$LIVE/files.staged" "$FILES"
[[ ! -e $DB-wal && ! -e $DB-shm ]]
[[ $(sha256sum "$DB" | cut -d ' ' -f 1) == "$staged_sha" ]]
python3 - <<'PY'
import sqlite3
p='/var/lib/jaautomation/data/jaautomation.sqlite'
c=sqlite3.connect(f'file:{p}?mode=ro&immutable=1',uri=True)
assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not c.execute('PRAGMA foreign_key_check').fetchall()
assert c.execute('SELECT MAX(version) FROM schema_migration').fetchone()[0]==60
assert c.execute('SELECT COUNT(*) FROM client').fetchone()[0]==1
assert c.execute('SELECT COUNT(*) FROM project').fetchone()[0]==2
assert c.execute('SELECT COUNT(*) FROM user').fetchone()[0]==118
assert c.execute('SELECT COUNT(*) FROM account').fetchone()[0]==118
assert c.execute('SELECT COUNT(*) FROM mail_identity').fetchone()[0]==99
assert c.execute('SELECT COUNT(*) FROM invoice').fetchone()[0]==0
assert c.execute('SELECT COUNT(*) FROM daily_report').fetchone()[0]==0
c.close()
print('PROMOTED_DB_PASS')
PY

echo 'RESTARTING_APP'
docker start deployment-portal-1 >/dev/null
systemctl start jaautomation-jobs.service
for attempt in $(seq 1 45); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:5100/j-aautomation/health/ready >/dev/null; then break; fi
  sleep 2
done
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:5100/j-aautomation/health/ready >/dev/null
[[ $(docker inspect deployment-portal-1 --format '{{.Config.Image}}') == ja-automation-portal:$TAG ]]
[[ $(docker inspect deployment-jobs-1 --format '{{.Config.Image}}') == ja-automation-portal:$TAG ]]
[[ $(systemctl is-active stalwart.service) == active ]]
systemctl start jaautomation-jobs.timer jaautomation-backup.timer
systemctl reset-failed jaautomation-zip-deploy.service || true
echo 'CUTOVER_SWITCH_PASS; ZIP_WATCHER_HELD_FOR_BROWSER_ACCEPTANCE'
