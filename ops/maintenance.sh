#!/usr/bin/env bash
# =============================================================================
# WarmPulse — maintenance mode control (nginx flag file)
# -----------------------------------------------------------------------------
# Works even when the API/frontend containers are down (that's the point —
# run `on` BEFORE `docker compose up -d --build ...` during deploys).
#
#   ops/maintenance.sh on       # site → maintenance page (immediately)
#   ops/maintenance.sh off      # site back to normal
#   ops/maintenance.sh status   # current state
#
# No nginx reload is needed — the config checks for the flag file on every
# request. The admin-panel toggle (Settings → Danger Zone) writes the SAME
# file via MAINTENANCE_FLAG_PATH, so both stay in sync.
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLAG="${MAINTENANCE_FLAG_FILE:-$APP_DIR/maintenance.on}"

case "${1:-status}" in
  on)
    touch "$FLAG"
    echo "maintenance: ON  ($FLAG)"
    echo "The site now serves the maintenance page. Admin API (/api/admin/) stays reachable."
    ;;
  off)
    rm -f "$FLAG"
    echo "maintenance: OFF"
    ;;
  status)
    if [ -f "$FLAG" ]; then
      echo "maintenance: ON  ($FLAG)"
    else
      echo "maintenance: OFF"
    fi
    ;;
  *)
    echo "usage: $0 on|off|status" >&2
    exit 2
    ;;
esac
