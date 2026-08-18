#!/usr/bin/env bash
set -euo pipefail
BASE_URL=${1:-https://gex-dashboard.hopto.org/j-aautomation}

docker compose -f deployment/compose.production.yml ps
curl --fail --silent --show-error http://127.0.0.1:5101/en/ >/dev/null
curl --fail --silent --show-error http://127.0.0.1:5100/j-aautomation/app/api/health
curl --fail --silent --show-error "$BASE_URL/en/" >/dev/null
curl --fail --silent --show-error "$BASE_URL/app/login" >/dev/null
echo
echo "J&A MVP checks passed: $BASE_URL/en/ and $BASE_URL/app/login"
