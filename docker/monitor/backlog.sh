#!/bin/bash
# VPS の cron (notify.sh) から実行し、終了コード 1 を通知につなぐ。利用者の情報は出さない (lumorphia/accounts と同じ形)。
set -euo pipefail
root="${SCENOTE_ROOT:-/srv/scenote}"
cd "$root"
result="$(docker compose --env-file .env.production -f compose.prod.yaml exec -T postgres psql -X -U scenote -d scenote -v ON_ERROR_STOP=1 -At < docker/monitor/backlog.sql)" || { echo 'scenote backlog probe failed' >&2; exit 1; }
printf '%s\n' "$result"
if printf '%s\n' "$result" | awk -F= '$2 + 0 > 0 { found=1 } END { exit !found }'; then exit 1; fi
