# Slack Integration — Design

**Date:** 2026-05-15
**Sub-project:** 5 of 8 (Pro Plus tier — 3/3 done after this; tier is then launch-ready)
**Status:** Approved (verbal)
**Effort:** ~3-4 hours via 1 subagent

## Why

The webhook dispatcher from sub-project 1 already POSTs notification events to any HTTPS URL. A user can paste a Slack incoming-webhook URL today and reach their Slack channel — but the message looks like raw JSON in the channel.

Closing the gap: detect Slack URLs in the dispatcher and reformat the payload as Slack Block Kit so messages render as pretty cards instead of raw JSON dumps.

This is the **fast path** to Slack integration — 80% of the user value at 10% of the work. Full Slack-OAuth-app + bot + channel picker is deferred to a future polish round (5-7 days vs this 3-4 hours).

## Scope

### 1. Slack URL detection
In `services/webhook_dispatcher.py`, add:
```python
SLACK_HOOK_RE = re.compile(r"^https://hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+$")

def is_slack_url(url: str) -> bool:
    return bool(SLACK_HOOK_RE.match(url))
```

When dispatching:
- If `is_slack_url(webhook.url)`: body = `slack_formatter.format(event, payload)`
- Else: body = `{"event": event, "payload": payload}` (existing behavior)
- HMAC signature header still added (Slack ignores; harmless)

### 2. Block Kit formatter — `services/slack_formatter.py`

One pure function per event type. Each returns a Slack Block Kit envelope:

```python
def format(event: str, payload: dict) -> dict:
    """Returns Slack Block Kit body for the event."""
    handler = HANDLERS.get(event, _generic)
    return handler(payload)

# Each handler builds blocks with header + section + context.
def _mailbox_paused(p: dict) -> dict: ...
def _bounce_spike(p: dict) -> dict: ...
def _peer_failed(p: dict) -> dict: ...
def _placement_test_completed(p: dict) -> dict: ...
def _spam_rate_spike(p: dict) -> dict: ...
def _complaint_rate_spike(p: dict) -> dict: ...
def _weekly_digest(p: dict) -> dict: ...
def _invoice_paid(p: dict) -> dict: ...
def _invoice_failed(p: dict) -> dict: ...
def _member_invited(p: dict) -> dict: ...
def _product_updates(p: dict) -> dict: ...
def _generic(p: dict) -> dict: ...  # unknown event fallback
```

**Block Kit envelope shape (example for `mailbox_paused`):**

```json
{
  "text": "Mailbox paused — alex@acme.com",
  "blocks": [
    {"type": "header", "text": {"type": "plain_text", "text": "⚠️ Mailbox paused"}},
    {"type": "section", "fields": [
      {"type": "mrkdwn", "text": "*Mailbox*\nalex@acme.com"},
      {"type": "mrkdwn", "text": "*Reason*\nBounce rate exceeded 3%"}
    ]},
    {"type": "context", "elements": [{
      "type": "mrkdwn",
      "text": "WarmPulse · <https://app.warmpulse.io/app/mailboxes/{id}|View mailbox>"
    }]}
  ]
}
```

**Emoji + tone per event:**

| Event | Emoji | Header text | Deep-link to |
|---|---|---|---|
| `mailbox_paused` | ⚠️ | "Mailbox paused" | `/app/mailboxes/{id}` |
| `bounce_spike` | 🔴 | "Bounce-rate spike" | `/app/reputation` |
| `peer_failed` | ⚠️ | "Peer inbox failing" | `/app/reputation` |
| `placement_test_completed` | ✅ | "Placement test complete" | `/app/tools/placement` |
| `spam_rate_spike` | 🔴 | "Spam-rate spike (Postmaster)" | `/app/reputation` |
| `complaint_rate_spike` | 🔴 | "Complaint-rate spike (SNDS)" | `/app/reputation` |
| `weekly_digest` | 📊 | "Weekly warmth digest" | `/app/dashboard` |
| `invoice_paid` | ✅ | "Invoice paid" | `/app/billing` |
| `invoice_failed` | 🔴 | "Payment failed" | `/app/billing` |
| `member_invited` | ✨ | "Member joined" | `/app/workspace` |
| `product_updates` | ✨ | "WarmPulse update" | (external changelog URL) |
| _unknown_ | 🔔 | event name | `/app/dashboard` |

**Deep-link host:** read from `settings.app_base_url` (add this setting if missing; default `https://app.warmpulse.io`). Falls back to `https://app.warmpulse.io` if unset.

**`placement_test_completed` flourish:** include a stacked emoji bar based on results. E.g.:
- 23 inbox · 5 promo · 2 spam → "🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟡🟡🟡🟡🟡🔴🔴"
- A nice visual at-a-glance.

### 3. Tests — `tests/test_slack_formatter.py`

At least 5 tests:
- `test_is_slack_url_matches_real_format` — both positive (real Slack URL) and negative (other domain, malformed)
- `test_format_mailbox_paused_produces_valid_block_kit` — assert structure: top-level `text` + `blocks` array, header block, section block with fields, context block with deep-link
- `test_format_placement_completed_includes_stacked_emoji_bar` — assert the emoji bar string is in one of the blocks
- `test_unknown_event_falls_back_to_generic_format` — assert no crash, generic 🔔 + event name shown
- `test_dispatcher_routes_slack_urls_to_slack_formatter` — integration test: mock httpx, dispatch a webhook with Slack URL, assert the posted JSON has `blocks` key (not `event` + `payload`)

### 4. Frontend tweaks — `pages/client/settings/ProSettings.tsx`

Find the existing Webhooks subsection (sub-project 1's work). Apply these tweaks:

- **URL input placeholder:** `https://your-server.com/webhook OR https://hooks.slack.com/services/T0/B0/...`
- **Helper text below the input** (small grey, fontSize 11):
  > "Slack incoming-webhook URLs work too — get yours from api.slack.com/apps → Incoming Webhooks → Add."
- **In the existing webhook list**: detect if `url.startsWith('https://hooks.slack.com/')` and render a small Slack-logo chip (purple S-on-white) next to the URL. Use the lucide-react `MessageSquare` icon as a simple Slack stand-in (don't bring in a heavy Slack-logo SVG asset).

No new hooks, no new routes — just three small visual changes inside the existing component.

## Defaults retained
- HMAC signature `X-WarmPulse-Signature` still set on every request, including Slack URLs.
- Retry policy (1m / 5m / 30m → dead-letter) unchanged.
- 1000 deliveries/hour per workspace rate limit unchanged.
- SSRF block list unchanged — `hooks.slack.com` resolves to public IP and passes.
- Dead-letter table records same shape regardless of formatter.

## Out of scope (deferred)
- Slack OAuth app + bot user + `chat.postMessage` + channel picker (5-7 day follow-up)
- Interactive Slack actions (buttons that call back into WarmPulse)
- Slack slash commands (`/warmpulse pause ...`)
- Microsoft Teams / Discord formatters (same pattern, future sub-projects)
- Per-channel routing (one webhook URL ↔ one channel — fine for v1)
- Thread/reply support
- File uploads (placement-test results as a CSV attachment)

## Risk

| Risk | Mitigation |
|---|---|
| Slack changes Block Kit schema | Block Kit is stable + versioned by Slack; tests cover schema; quick fix if it ever changes |
| Customer pastes a malformed Slack URL | Regex match returns false, falls back to generic JSON; nothing breaks, just looks ugly in Slack |
| `app_base_url` not configured in prod | Default `https://app.warmpulse.io` is hardcoded; safe |
| User pastes a Slack URL but it's revoked | Same as any failing webhook — retries + dead-letter |

## Verification

- `cd backend && pytest tests/test_slack_formatter.py -x` — green
- `cd frontend && npx tsc -p tsconfig.app.json --noEmit` — no new errors
- Manual: paste real Slack webhook URL (e.g. test channel), fire test from UI, see formatted card arrive

## File touch list
- **Add** (backend): `services/slack_formatter.py` · `tests/test_slack_formatter.py`
- **Modify** (backend): `services/webhook_dispatcher.py` (URL detection + route through formatter)
- **Modify** (frontend): `pages/client/settings/ProSettings.tsx` (placeholder + helper + chip)
