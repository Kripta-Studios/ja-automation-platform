#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL=${1:-https://j-aautomation.com/j-aautomation}
MODE=${2:---current-jobs}
ENV_FILE=/etc/jaautomation/jaautomation.env
COMPOSE_FILE=/opt/jaautomation/current/deployment/compose.production.yml
NODE24=/opt/jaautomation/runtime/node/bin/node
DATABASE_PATH=/var/lib/jaautomation/data/jaautomation.sqlite

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ ${EUID} -eq 0 ]] || die 'Run this verifier with sudo so it can inspect systemd, Docker and the production database read-only.'
[[ "$MODE" == '--current-jobs' || "$MODE" == '--wait-two-automatic-runs' ]] ||
  die 'Usage: verify-vps.sh [base-url] [--current-jobs|--wait-two-automatic-runs]'
[[ -r "$ENV_FILE" ]] || die "$ENV_FILE is not readable"
[[ -r "$COMPOSE_FILE" ]] || die "$COMPOSE_FILE is not readable"
[[ -x "$NODE24" ]] || die "Pinned Node 24 runtime is missing at $NODE24"
[[ "$($NODE24 --version)" == 'v24.19.0' ]] || die 'The VPS jobs verifier requires Node v24.19.0'

compose=(
  docker compose
  --env-file "$ENV_FILE"
  -f "$COMPOSE_FILE"
)

"${compose[@]}" config --quiet
rendered_compose_json=$("${compose[@]}" config --format json)
if ! "$NODE24" --input-type=module -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  const services = JSON.parse(input)?.services ?? {};
  const environment = services.jobs?.environment ?? {};
  const portalEnvironment = services.portal?.environment ?? {};
  const forbidden = [
    "JA_JOB_ACTOR_ID",
    "JA_AUTH_SECRET",
    "JA_BACKUP_ENCRYPTION_KEY",
    "JA_BACKUP_SSH_KEY",
    "JA_SMTP_URL",
  ];
  const leaked = forbidden.filter((name) => Object.hasOwn(environment, name));
  if (leaked.length) {
    console.error(`forbidden jobs environment names: ${leaked.join(",")}`);
    process.exit(1);
  }
  const expectedWebhook =
    "https://j-aautomation.com/j-aautomation/app/api/internal/outbox-delivery";
  const missingDelivery = [];
  if (environment.JA_OUTBOX_WEBHOOK_URL !== expectedWebhook)
    missingDelivery.push("JA_OUTBOX_WEBHOOK_URL");
  if (
    typeof environment.JA_OUTBOX_WEBHOOK_SECRET !== "string" ||
    Buffer.byteLength(environment.JA_OUTBOX_WEBHOOK_SECRET, "utf8") < 32
  )
    missingDelivery.push("JA_OUTBOX_WEBHOOK_SECRET");
  if (portalEnvironment.JA_SMTP_URL !== "smtp://mx1.j-aautomation.com:25")
    missingDelivery.push("JA_SMTP_URL");
  if (!/@j-aautomation\.com$/u.test(portalEnvironment.JA_SMTP_FROM ?? ""))
    missingDelivery.push("JA_SMTP_FROM");
  if (!/@j-aautomation\.com$/u.test(portalEnvironment.JA_FORM_RECIPIENT ?? ""))
    missingDelivery.push("JA_FORM_RECIPIENT");
  const cutoverAt = portalEnvironment.JA_OUTBOX_CUTOVER_AT;
  if (
    typeof cutoverAt !== "string" ||
    !Number.isFinite(Date.parse(cutoverAt)) ||
    new Date(Date.parse(cutoverAt)).toISOString() !== cutoverAt ||
    Date.parse(cutoverAt) > Date.now()
  )
    missingDelivery.push("JA_OUTBOX_CUTOVER_AT");
  if (missingDelivery.length) {
    console.error(`missing or invalid mail delivery settings: ${missingDelivery.join(",")}`);
    process.exit(1);
  }
' <<<"$rendered_compose_json"; then
  die 'Jobs isolation or the built-in mail delivery configuration is invalid.'
fi

"${compose[@]}" ps
curl --fail --silent --show-error http://127.0.0.1:5101/j-aautomation/en >/dev/null
curl --fail --silent --show-error http://127.0.0.1:5100/j-aautomation/app/api/health
curl --fail --silent --show-error http://127.0.0.1:5100/j-aautomation/health/ready >/dev/null
curl --fail --silent --show-error "$BASE_URL/en/" >/dev/null
curl --fail --silent --show-error "$BASE_URL/app/login" >/dev/null
outbox_probe_status=$(
  curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --request POST --header 'origin: https://j-aautomation.com' \
    --header 'content-type: application/json' --data '{}' \
    "$BASE_URL/app/api/internal/outbox-delivery"
)
[[ "$outbox_probe_status" == '401' ]] || die 'The signed outbox delivery endpoint did not fail closed.'

systemctl is-active --quiet jaautomation-jobs.timer || die 'jaautomation-jobs.timer is not active'
systemctl is-enabled --quiet jaautomation-jobs.timer || die 'jaautomation-jobs.timer is not enabled'

read_job_state() {
  "$NODE24" --input-type=module - "$DATABASE_PATH" <<'NODE'
import { DatabaseSync } from 'node:sqlite';

const databasePath = process.argv[2];
const db = new DatabaseSync(databasePath, { readOnly: true });
const hasTable = (name) => Boolean(
  db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name),
);
const grouped = (table, column) => hasTable(table)
  ? db.prepare(`SELECT ${column} AS state,COUNT(*) AS count FROM ${table} GROUP BY ${column} ORDER BY ${column}`).all()
  : [];

const result = {
  jobs: grouped('job', 'state'),
  localizedPdfs: grouped('localized_pdf_variant', 'status'),
  accountingPacks: grouped('accounting_pack_artifact', 'status'),
  workerStatements: grouped('worker_statement_artifact', 'status'),
  recentRuns: hasTable('job_run')
    ? db.prepare(
        `SELECT kind,state,outcome,error_code,started_at,finished_at,retry_run_after
         FROM job_run ORDER BY started_at DESC LIMIT 20`,
      ).all()
    : [],
};
console.log(JSON.stringify(result));
db.close();
NODE
}

jobs_logs() {
  "${compose[@]}" logs --no-color --timestamps --tail 200 jobs 2>/dev/null || true
}

jobs_container_state() {
  "${compose[@]}" ps --all --format '{{.State}}' jobs 2>/dev/null | head -n1
}

verify_latest_cycle() {
  local state logs last_cycle
  state=$(jobs_container_state)
  [[ "$state" == 'running' ]] ||
    die "jobs container is not running (state=${state:-missing}). Inspect: docker compose -f $COMPOSE_FILE ps jobs"
  logs=$(jobs_logs)
  grep -q '"event":"jobs.cycle"' <<<"$logs" ||
    die 'Always-on jobs worker has no structured jobs.cycle record'
  last_cycle=$(grep '"event":"jobs.cycle"' <<<"$logs" | tail -n 1)
  if grep '"event":"jobs.runner.error"' <<<"$logs" | tail -n 1 | grep -q .; then
    local last_error
    last_error=$(grep '"event":"jobs.runner.error"' <<<"$logs" | tail -n 1)
    if [[ "$last_error" > "$last_cycle" ]]; then
      die 'Always-on jobs worker latest record is jobs.runner.error'
    fi
  fi
  printf 'jobs_container_state=%s\n' "$state"
  printf '%s\n' "$last_cycle"
  read_job_state
}

wait_for_next_cycle() {
  local prior=$1 current deadline
  deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    current=$(jobs_logs | grep '"event":"jobs.cycle"' | tail -n 1 || true)
    if [[ -n "$current" && "$current" != "$prior" ]]; then
      printf '%s\n' "$current"
      return 0
    fi
    sleep 1
  done
  die 'Timed out waiting for the next jobs.cycle from the always-on worker'
}

if [[ "$MODE" == '--wait-two-automatic-runs' ]]; then
  cycle=$(jobs_logs | grep '"event":"jobs.cycle"' | tail -n 1 || true)
  for run_number in 1 2; do
    cycle=$(wait_for_next_cycle "$cycle")
    printf '%s\n' "automatic_run=$run_number"
    printf '%s\n' "$cycle"
    verify_latest_cycle
  done
else
  verify_latest_cycle
fi

echo
echo "J&A production and jobs checks passed: $BASE_URL/en/ and $BASE_URL/app/login"
