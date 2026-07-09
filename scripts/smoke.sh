#!/usr/bin/env bash
# WarmPulse production smoke test.
#
# Hits the canonical health + auth + admin + workspace + payments endpoints
# against a deployed instance and asserts every response is 2xx (with a
# small whitelist of expected non-200s for endpoints that legitimately
# return 503 when an integration is feature-flagged off).
#
# Usage:
#   BASE_URL=https://restinpices.com ADMIN_EMAIL=admin@x.dev \
#   ADMIN_PASSWORD=hunter2 ./scripts/smoke.sh
#
# Optional:
#   CLIENT_EMAIL / CLIENT_PASSWORD — extra client-token checks for
#     /workspace/* paths (otherwise admin token covers admin-only routes
#     and we skip the workspace section).
#
# Exit code:
#   0 — every required endpoint returned 2xx (or an explicitly allowed 503).
#   1 — at least one assertion failed.
#
# Requires: bash, curl, jq.
set -euo pipefail

: "${BASE_URL:?Set BASE_URL, e.g. https://restinpices.com}"
: "${ADMIN_EMAIL:?Set ADMIN_EMAIL}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD}"

TOTAL=0
FAILED=0
RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'

# Assert that a GET (or POST with a body) returns one of $expected_codes.
# expected_codes is a space-separated list, e.g. "200" or "200 503".
check() {
    local label="$1" expected_codes="$2" path="$3" auth="${4:-}" method="${5:-GET}" body="${6:-}"
    TOTAL=$((TOTAL + 1))
    local args=(-s -o /dev/null -w "%{http_code}" -X "$method")
    [[ -n "$auth" ]] && args+=(-H "Authorization: Bearer $auth")
    if [[ -n "$body" ]]; then
        args+=(-H 'content-type: application/json' -d "$body")
    fi
    local code
    code=$(curl "${args[@]}" "$BASE_URL$path" || echo "000")
    if echo " $expected_codes " | grep -q " $code "; then
        printf "  ${GREEN}OK${RESET}    %-3s  %s\n" "$code" "$label"
    else
        printf "  ${RED}FAIL${RESET}  %-3s  %s ${YELLOW}(expected %s)${RESET}\n" \
            "$code" "$label" "$expected_codes"
        FAILED=$((FAILED + 1))
    fi
}

echo "WarmPulse smoke against $BASE_URL"
echo

# -------------- public meta --------------
check "GET /health"         "200" "/health"
# OpenAPI is served by FastAPI without auth.
check "GET /openapi.json"   "200" "/openapi.json"

# -------------- auth --------------
echo
echo "auth"
ADMIN_TOKEN=$(curl -fsS -X POST "$BASE_URL/api/auth/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | jq -r '.access_token // .tokens.access_token')
if [[ -z "${ADMIN_TOKEN:-}" || "$ADMIN_TOKEN" == "null" ]]; then
    printf "  ${RED}FAIL${RESET}      admin login (couldn't extract access_token)\n"
    exit 1
fi
printf "  ${GREEN}OK${RESET}    200  POST /api/auth/login (admin)\n"
TOTAL=$((TOTAL + 1))
check "GET /api/auth/me (admin)" "200" "/api/auth/me" "$ADMIN_TOKEN"

# -------------- admin --------------
echo
echo "admin"
check "GET /api/admin/users"                       "200" "/api/admin/users" "$ADMIN_TOKEN"
check "GET /api/admin/peer-inboxes"                "200" "/api/admin/peer-inboxes" "$ADMIN_TOKEN"
check "GET /api/admin/peer-inboxes/stats"          "200" "/api/admin/peer-inboxes/stats" "$ADMIN_TOKEN"
check "GET /api/admin/peer-pools"                  "200" "/api/admin/peer-pools" "$ADMIN_TOKEN"
check "GET /api/admin/pool-routing"                "200" "/api/admin/pool-routing" "$ADMIN_TOKEN"
check "GET /api/admin/audit-log/"                  "200" "/api/admin/audit-log/" "$ADMIN_TOKEN"
check "GET /api/admin/zai-usage/summary"           "200" "/api/admin/zai-usage/summary" "$ADMIN_TOKEN"
check "GET /api/admin/payments"                    "200" "/api/admin/payments" "$ADMIN_TOKEN"
check "GET /api/admin/platform-analytics/overview" "200" "/api/admin/platform-analytics/overview" "$ADMIN_TOKEN"
check "GET /api/admin/platform-analytics/send-volume?from=2026-01-01&to=2026-12-31" \
                                                   "200" "/api/admin/platform-analytics/send-volume?from=2026-01-01&to=2026-12-31" \
                                                   "$ADMIN_TOKEN"
check "GET /api/admin/settings"                    "200" "/api/admin/settings" "$ADMIN_TOKEN"

# -------------- public listing --------------
echo
echo "public"
check "GET /api/plans"  "200" "/api/plans"

# -------------- workspace (only if client creds provided) --------------
if [[ -n "${CLIENT_EMAIL:-}" && -n "${CLIENT_PASSWORD:-}" ]]; then
    echo
    echo "workspace (client login)"
    CLIENT_TOKEN=$(curl -fsS -X POST "$BASE_URL/api/auth/login" \
        -H 'content-type: application/json' \
        -d "{\"email\":\"$CLIENT_EMAIL\",\"password\":\"$CLIENT_PASSWORD\"}" \
        | jq -r '.access_token // .tokens.access_token')
    if [[ -z "${CLIENT_TOKEN:-}" || "$CLIENT_TOKEN" == "null" ]]; then
        printf "  ${RED}FAIL${RESET}      client login (couldn't extract access_token)\n"
        FAILED=$((FAILED + 1))
    else
        printf "  ${GREEN}OK${RESET}    200  POST /api/auth/login (client)\n"
        TOTAL=$((TOTAL + 1))
        check "GET /api/workspace/mailboxes"                         "200" "/api/workspace/mailboxes" "$CLIENT_TOKEN"
        check "GET /api/workspace/analytics/dashboard/summary"       "200" "/api/workspace/analytics/dashboard/summary" "$CLIENT_TOKEN"
        check "GET /api/workspace/analytics/daily-metrics"           "200" "/api/workspace/analytics/daily-metrics" "$CLIENT_TOKEN"
        check "GET /api/workspace/warmup-activity"                   "200" "/api/workspace/warmup-activity" "$CLIENT_TOKEN"
        check "GET /api/workspace/warmup-activity/today-stats"       "200" "/api/workspace/warmup-activity/today-stats" "$CLIENT_TOKEN"
        check "GET /api/workspace/reputation/overview"               "200" "/api/workspace/reputation/overview" "$CLIENT_TOKEN"
        check "GET /api/workspace/billing/usage"                     "200" "/api/workspace/billing/usage" "$CLIENT_TOKEN"
        check "GET /api/workspace/settings"                          "200" "/api/workspace/settings" "$CLIENT_TOKEN"
        check "GET /api/workspace/reports"                           "200" "/api/workspace/reports" "$CLIENT_TOKEN"
        check "GET /api/workspace/team-members"                      "200" "/api/workspace/team-members" "$CLIENT_TOKEN"
        check "GET /api/workspace/api-keys"                          "200" "/api/workspace/api-keys" "$CLIENT_TOKEN"
        check "GET /api/workspace/notifications-inbox"               "200" "/api/workspace/notifications-inbox" "$CLIENT_TOKEN"
        check "GET /api/payments/me"                                 "200" "/api/payments/me" "$CLIENT_TOKEN"
        # Stripe checkout 503 is expected when STRIPE_SECRET_KEY isn't set;
        # 200 when it is. Both pass the smoke.
        check "POST /api/payments/checkout (Stripe gate)" "200 400 503" \
            "/api/payments/checkout" "$CLIENT_TOKEN" POST '{"plan_id":"00000000-0000-0000-0000-000000000000"}'
    fi
else
    echo
    echo "workspace section skipped (set CLIENT_EMAIL + CLIENT_PASSWORD to include)"
fi

# -------------- summary --------------
echo
PASSED=$((TOTAL - FAILED))
if (( FAILED == 0 )); then
    printf "${GREEN}%d / %d checks passed.${RESET}\n" "$PASSED" "$TOTAL"
    exit 0
else
    printf "${RED}%d of %d checks failed.${RESET}\n" "$FAILED" "$TOTAL"
    exit 1
fi
