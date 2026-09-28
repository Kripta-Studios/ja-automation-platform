#!/usr/bin/env bash
# One reviewed, explicit cutover of the already-rehearsed production database.
# The original pair remains in a private directory. A failed cutover restores
# it and restarts the services; all copies and evidence remain for review.
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
EXPECTED=7e09e7d3885256d3564daacedccc22cd93b9d3534ba2e5d3a55e49921976e1d2
TAG=zip-7e09e7d3885256d3564daacedccc22cd
NODE=/opt/jaautomation/runtime/node/bin/node
OUT=/home/kripta/ja-clean-slate-cutover-$(date -u +%Y%m%dT%H%M%SZ)
export OUT

[[ $(readlink -f /opt/jaautomation/current) == /opt/jaautomation/releases/ja-automation-$EXPECTED ]]
[[ $(systemctl is-active stalwart.service) == active ]]
[[ $(docker inspect deployment-portal-1 --format '{{.Config.Image}}') == ja-automation-portal:$TAG ]]
[[ $(docker inspect deployment-jobs-1 --format '{{.Config.Image}}') == ja-automation-portal:$TAG ]]
[[ $(docker inspect deployment-site-1 --format '{{.Config.Image}}') == ja-automation-site:$TAG ]]
[[ $(grep -c "^JA_RELEASE_TAG=$TAG$" /etc/jaautomation/jaautomation.env) == 1 ]]
[[ -f $DB && -d $FILES && -x $NODE ]]
[[ ! -e $OUT && ! -e $LIVE/data/jaautomation.sqlite.staged && ! -e $LIVE/files.staged ]]
python3 - <<'PY'
import sqlite3
p='/var/lib/jaautomation/data/jaautomation.sqlite'
c=sqlite3.connect(f'file:{p}?mode=ro',uri=True)
assert c.execute('SELECT MAX(version) FROM schema_migration').fetchone()[0]==65
for table in ['user','account','mail_identity']:
    assert c.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]>0
c.close()
print('IDENTITY_PREFLIGHT_PASS')
PY

exec 9>/var/lib/jaautomation-zip-deploy/deploy.lock
flock -n 9 || { echo 'Deployment lock busy' >&2; exit 1; }
watcher_held=0
writers_stopped=0
recover_on_failure() {
  local status=$1
  if [[ $status -ne 0 && $writers_stopped -eq 1 ]]; then
    set +e
    echo "CUTOVER_FAILED status=$status; restoring original database and files" >&2
    systemctl stop jaautomation-jobs.timer jaautomation-jobs.service jaautomation-backup.timer jaautomation-backup.service >&2
    docker stop deployment-portal-1 >/dev/null 2>&1
    if [[ -e $OUT/rollback/original.sqlite ]]; then
      [[ ! -e $DB ]] || mv -T "$DB" "$OUT/rollback/failed-clean.sqlite"
      for sidecar in -wal -shm; do
        [[ ! -e $DB$sidecar ]] || mv -T "$DB$sidecar" "$OUT/rollback/failed-clean.sqlite$sidecar"
      done
      mv -T "$OUT/rollback/original.sqlite" "$DB"
      for sidecar in -wal -shm; do
        [[ ! -e $OUT/rollback/original.sqlite$sidecar ]] || mv -T "$OUT/rollback/original.sqlite$sidecar" "$DB$sidecar"
      done
    fi
    if [[ -e $OUT/rollback/original-files ]]; then
      [[ ! -e $FILES ]] || mv -T "$FILES" "$OUT/rollback/failed-clean-files"
      mv -T "$OUT/rollback/original-files" "$FILES"
    fi
    if [[ -f $DB && -d $FILES ]] &&
       { [[ ! -f $OUT/pre-cutover/database.sha256 ]] ||
         [[ $(sha256sum "$DB" | cut -d ' ' -f 1) == $(cut -d ' ' -f 1 "$OUT/pre-cutover/database.sha256") ]]; } &&
       { [[ ! -f $OUT/pre-cutover/artifacts.sha256 ]] ||
         (cd "$FILES" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum) | cmp -s "$OUT/pre-cutover/artifacts.sha256" -; }; then
      docker start deployment-portal-1 >/dev/null 2>&1
      systemctl start jaautomation-jobs.service jaautomation-jobs.timer jaautomation-backup.timer >&2
      echo "RECOVERY_ATTEMPTED; original pair restored; inspect services and $OUT" >&2
    else
      echo "RECOVERY_INCOMPLETE; writers remain stopped; inspect $OUT and restore original pair" >&2
    fi
  fi
  if [[ $watcher_held -eq 1 ]]; then
    set +e
    systemctl reset-failed jaautomation-zip-deploy.service >/dev/null 2>&1
    systemctl start jaautomation-zip-deploy.path jaautomation-zip-deploy.timer >&2
  fi
}
trap 'recover_on_failure $?' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo 'HOLDING_ZIP_WATCHER'
watcher_held=1
systemctl stop jaautomation-zip-deploy.path jaautomation-zip-deploy.timer
# A scan that was already starting will fail its nonblocking lock and exit.
for attempt in $(seq 1 20); do
  state=$(systemctl is-active jaautomation-zip-deploy.service || true)
  [[ $state != active && $state != activating ]] && break
  sleep 1
done
[[ $(systemctl is-active jaautomation-zip-deploy.path || true) == inactive ]]
[[ $(systemctl is-active jaautomation-zip-deploy.timer || true) == inactive ]]
state=$(systemctl is-active jaautomation-zip-deploy.service || true)
[[ $state != active && $state != activating ]]
# Recheck the release after taking the shared deployment lock; a ZIP scan may
# have completed between the initial preflight and lock acquisition.
[[ $(readlink -f /opt/jaautomation/current) == /opt/jaautomation/releases/ja-automation-$EXPECTED ]]
[[ $(docker inspect deployment-portal-1 --format '{{.Config.Image}}') == ja-automation-portal:$TAG ]]
[[ $(docker inspect deployment-jobs-1 --format '{{.Config.Image}}') == ja-automation-portal:$TAG ]]
[[ $(docker inspect deployment-site-1 --format '{{.Config.Image}}') == ja-automation-site:$TAG ]]
[[ $(grep -c "^JA_RELEASE_TAG=$TAG$" /etc/jaautomation/jaautomation.env) == 1 ]]
[[ ! -e $OUT && ! -e $LIVE/data/jaautomation.sqlite.staged && ! -e $LIVE/files.staged ]]
install -d -o root -g root -m 0700 "$OUT" "$OUT/pre-cutover" "$OUT/rollback"
echo "CUTOVER_DIR=$OUT"

echo 'STOPPING_APP_WRITERS'
writers_stopped=1
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
python3 - <<'PY'
import json, os, sqlite3
from pathlib import Path
p=Path(os.environ['OUT'])/'pre-cutover'
c=sqlite3.connect(f'file:{p / "original.sqlite"}?mode=ro&immutable=1',uri=True)
tables={row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
names=['user','account','mail_identity','supplier','supplier_user_profile','tax_profile']
counts={name:c.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in names if name in tables}
assert all(counts[name]>0 for name in ['user','account','mail_identity'])
assert c.execute('SELECT MAX(version) FROM schema_migration').fetchone()[0]==65
(p/'protected-counts.json').write_text(json.dumps(counts,sort_keys=True)+'\n')
c.close()
print('COLD_IDENTITY_AND_PROFILE_SNAPSHOT_PASS', counts)
PY

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
baseline=json.loads((p/'pre-cutover/protected-counts.json').read_text())
for table, count in baseline.items():
    assert a['before'][table]==count
    if table in ['user','account','mail_identity']:
        assert a['after'][table]==count
for table in ['invoice','daily_report','time_entry','expense']:
    assert a['after'][table]==0
assert not a['blockedReferences']
old=sqlite3.connect(f"file:{p/'pre-cutover/original.sqlite'}?mode=ro&immutable=1",uri=True)
new=sqlite3.connect(f"file:{p/'working.rehearsal.sqlite'}?mode=ro&immutable=1",uri=True)
assert old.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").fetchall()==new.execute("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").fetchall()
assert new.execute('SELECT MAX(version) FROM schema_migration').fetchone()[0]==65
assert new.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not new.execute('PRAGMA foreign_key_check').fetchall()
assert sorted(x[0] for x in new.execute('SELECT id FROM client'))==['client-020-impc']
assert sorted(x[0] for x in new.execute('SELECT id FROM project'))==['project-cp020-bbs-mexico','project-cp020-dfw']
assert hashlib.sha256((p/'pre-cutover/original.sqlite').read_bytes()).hexdigest()==a['originalDatabaseSha256']
for table, count in a['after'].items():
    assert new.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]==count, table
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
mv -T "$DB" "$OUT/rollback/original.sqlite"
for sidecar in -wal -shm; do
  if [[ -e $DB$sidecar ]]; then mv -T "$DB$sidecar" "$OUT/rollback/original.sqlite$sidecar"; fi
done
mv -T "$FILES" "$OUT/rollback/original-files"
mv -T "$LIVE/data/jaautomation.sqlite.staged" "$DB"
mv -T "$LIVE/files.staged" "$FILES"
[[ ! -e $DB-wal && ! -e $DB-shm ]]
[[ $(sha256sum "$DB" | cut -d ' ' -f 1) == "$staged_sha" ]]
python3 - <<'PY'
import json, os, sqlite3
p='/var/lib/jaautomation/data/jaautomation.sqlite'
c=sqlite3.connect(f'file:{p}?mode=ro&immutable=1',uri=True)
assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not c.execute('PRAGMA foreign_key_check').fetchall()
assert c.execute('SELECT MAX(version) FROM schema_migration').fetchone()[0]==65
assert c.execute('SELECT COUNT(*) FROM client').fetchone()[0]==1
assert c.execute('SELECT COUNT(*) FROM project').fetchone()[0]==2
with open(os.environ['OUT']+'/applied.json') as f:
    expected=json.load(f)['after']
for table, count in expected.items():
    assert c.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]==count, table
with open(os.environ['OUT']+'/pre-cutover/protected-counts.json') as f:
    original=json.load(f)
for table in ['user','account','mail_identity']:
    assert c.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]==original[table]
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
[[ $(docker inspect deployment-portal-1 --format '{{.State.Running}}') == true ]]
[[ $(docker inspect deployment-jobs-1 --format '{{.State.Running}}') == true ]]
[[ $(systemctl is-active jaautomation-jobs.timer) == active ]]
[[ $(systemctl is-active jaautomation-backup.timer) == active ]]
systemctl reset-failed jaautomation-zip-deploy.service || true
systemctl start jaautomation-zip-deploy.path jaautomation-zip-deploy.timer
[[ $(systemctl is-active jaautomation-zip-deploy.path) == active ]]
[[ $(systemctl is-active jaautomation-zip-deploy.timer) == active ]]
watcher_held=0
echo 'CUTOVER_SWITCH_PASS; ZIP_WATCHER_RESTORED'
