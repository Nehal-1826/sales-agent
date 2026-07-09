#!/usr/bin/env bash
# =============================================================================
# WarmPulse — one-shot deploy script (run from a developer workstation)
# -----------------------------------------------------------------------------
# Usage:  ops/deploy/deploy.sh <ssh-host>
#         ops/deploy/deploy.sh warmpulse.yourdomain.com
#         ops/deploy/deploy.sh deploy@1.2.3.4
#
# Preconditions on the remote host (run ops/deploy/README.md once first):
#   - `warmpulse` system user exists with home /var/www/warmpulse
#   - Repo cloned at /var/www/warmpulse (working tree owned by warmpulse)
#   - Python venv at /var/www/warmpulse/backend/.venv
#   - pnpm + node installed (node 20+) and on PATH for the warmpulse user
#   - /etc/warmpulse/warmpulse.env populated (see ops/env/warmpulse.env.example)
#   - All four systemd units installed and enabled
#   - Nginx snippet included and reloaded
#
# What this script does NOT do: initial provisioning. For that, see the
# companion README.md.
# =============================================================================
set -euo pipefail

# --- Arg parsing -------------------------------------------------------------
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <ssh-host>" >&2
    echo "Example: $0 warmpulse.yourdomain.com" >&2
    exit 2
fi
REMOTE_HOST="$1"
REMOTE_USER="${REMOTE_USER:-warmpulse}"
REMOTE_PATH="${REMOTE_PATH:-/var/www/warmpulse}"
BRANCH="${BRANCH:-main}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:8001/health}"

echo "==> Deploying to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH} (branch=${BRANCH})"

# --- Remote deploy payload ---------------------------------------------------
# The `<<REMOTE` heredoc is executed by bash on the VPS. Uses the remote
# shell's $? / $PWD, not the local workstation's. `set -euo pipefail` is
# re-declared remotely because ssh starts a fresh shell.
ssh -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${REMOTE_HOST}" \
    "bash -s" <<REMOTE
set -euo pipefail

cd "${REMOTE_PATH}"

echo "--> [1/6] Pulling latest from git (branch=${BRANCH})"
git fetch --all --prune
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "--> [2/6] Installing backend deps into venv"
# Use the project's own venv; assume it already exists. Prod extras only.
source backend/.venv/bin/activate
cd backend
pip install --upgrade pip
pip install -e ".[prod]"

echo "--> [3/6] Running Alembic migrations"
alembic upgrade head
deactivate
cd ..

echo "--> [4/6] Building frontend (pnpm install + build)"
cd frontend
# --prod=false so devDependencies (vite, typescript, etc.) are installed
pnpm install --frozen-lockfile --prod=false
pnpm build
cd ..

echo "--> [5/6] Publishing frontend dist/ to web root"
# rsync over the build output — --delete ensures removed assets don't linger.
# /var/www/warmpulse/frontend/dist is what Nginx serves (see warmpulse.conf).
mkdir -p /var/www/warmpulse/frontend/dist
rsync -a --delete frontend/dist/ /var/www/warmpulse/frontend/dist/

echo "--> [6/6] Restarting systemd services"
# Requires NOPASSWD sudo for these four unit names (see README.md).
sudo systemctl restart warmpulse-api
sudo systemctl restart warmpulse-worker
sudo systemctl restart warmpulse-zai-worker
sudo systemctl restart warmpulse-beat

echo "--> Health-checking ${HEALTHCHECK_URL}"
# Retry up to ~15s because uvicorn workers need a moment to bind.
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS --max-time 3 "${HEALTHCHECK_URL}" >/dev/null; then
        echo "    health check passed (attempt \$attempt)"
        break
    fi
    if [[ "\$attempt" == "10" ]]; then
        echo "    health check FAILED after 10 attempts" >&2
        sudo systemctl status warmpulse-api --no-pager | tail -n 40 >&2
        exit 1
    fi
    sleep 1.5
done

echo "==> Deploy complete on \$(hostname)"
REMOTE

echo "==> Remote deploy finished successfully."
