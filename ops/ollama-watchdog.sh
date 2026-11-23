#!/bin/bash
# Recycle the local model runner when it has outgrown itself.
#
# The runner (llama-server inside warmpulse-ollama) keeps growing the whole
# time it stays loaded - and it never unloads (OLLAMA_KEEP_ALIVE=-1):
#   2.1 GB fresh -> 3.3 GB after a day -> 5.6 GB when the 8 GB box began to
#   thrash (2026-11-23: load average 60, swap full, every AI call timing out).
# A restart gives the memory back; the model reloads on the next request
# (about 15 s). This runs from cron and only restarts an IDLE runner, so it
# never cuts a request in half. The compose file's mem_limit is the hard
# backstop when the growth is faster than the cron interval.
#
#   ops/ollama-watchdog.sh [LIMIT_MB]      (default 3600)
#
# VPS cron:  */15 * * * * /var/www/sales-agent/ops/ollama-watchdog.sh
#            >> /var/log/warmpulse-ollama-watchdog.log 2>&1

set -u
CONTAINER=warmpulse-ollama
LIMIT_MB=${1:-3600}

[ -n "$(docker ps -q -f name="^${CONTAINER}$")" ] || exit 0     # not running: nothing to do

usage=$(docker stats --no-stream --format '{{.MemUsage}}' "$CONTAINER" 2>/dev/null | cut -d/ -f1 | xargs)
mb=$(echo "$usage" | awk '/GiB/{printf "%d", $1 * 1024} /MiB/{printf "%d", $1} /KiB/{printf "%d", $1 / 1024}')
[ -n "$mb" ] || exit 0
[ "$mb" -gt "$LIMIT_MB" ] || exit 0

# Busy? The runtime logs "processing task" when a request starts and
# "release" when it ends; recycle only when the last of the two is a release.
last=$(docker logs --since 15m "$CONTAINER" 2>&1 | grep -E 'processing task|slot +release:' | tail -1)
if [ -n "$last" ] && ! echo "$last" | grep -q 'release:'; then
  echo "$(date -u '+%FT%TZ') runner at ${mb} MB (> ${LIMIT_MB}) but busy - will try again"
  exit 0
fi

echo "$(date -u '+%FT%TZ') runner at ${mb} MB (> ${LIMIT_MB}) and idle - recycling"
logger -t ollama-watchdog "recycled the model runner at ${mb} MB"
docker restart "$CONTAINER" >/dev/null
