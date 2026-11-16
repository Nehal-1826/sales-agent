# Plan — XOAUTH2 sending for OAuth Gmail mailboxes

## Why
The warmup sender (`smtp_sender._deliver`) only does password auth via
`smtp_password_encrypted`. OAuth-connected Gmail mailboxes have no password
(only a Fernet-encrypted Google **refresh token** in `oauth_token_encrypted`),
so every send fails → 0 sends. Build XOAUTH2 so those mailboxes can warm.

## Verified facts
- `oauth_token_encrypted` = Fernet-encrypted Google **refresh token** (set by the
  mailbox-connect flow in `google_oauth.py`).
- Google token endpoint `https://oauth2.googleapis.com/token`; `settings.google_client_id`
  / `google_client_secret` are configured in prod.
- `smtp_sender._deliver` opens `aiosmtplib.SMTP(... start_tls=(port==587))` and
  calls `await smtp.login(username, password)`.

## Task 1 — Backend
1. New `app/services/warmup/oauth_token.py`:
   `async def google_access_token(refresh_token, *, settings) -> str` — POST
   grant_type=refresh_token + client_id/secret, return `access_token`; raise a
   clear error (incl. Google's `error`/`error_description`) on failure. httpx.
2. `smtp_sender.py`:
   - `_deliver` gains `xoauth2_token: str | None = None`. When set, after the
     session opens, authenticate with AUTH XOAUTH2 (base64 SASL
     `user=<u>\x01auth=Bearer <tok>\x01\x01`); handle the 334 error-challenge by
     sending an empty line; require final code 235 else raise. When None, keep
     `smtp.login(username, password)`.
   - `send_email`: pick auth mode — password if `smtp_password_encrypted`; else
     if `oauth_token_encrypted` non-empty and provider in {gmail, outlook}:
     decrypt refresh token → `google_access_token` → resolve host/port
     (gmail→smtp.gmail.com:587, outlook→smtp.office365.com:587, prefer
     mailbox.smtp_host/port if set), username = smtp_username or email_address →
     `_deliver(..., xoauth2_token=token)`. Scrub refresh + access token in finally.
     Else raise "no usable credentials".
3. `peer_pool_service.list_routing_mailboxes`: `can_send` = smtp password present
   OR (oauth token present AND provider in {gmail, outlook}). Keep `is_oauth`.

## Task 2 — Frontend (small)
`MailboxRoutingRow` badge: show "OAuth · not sending" (warning) only when
`!can_send`; when `is_oauth && can_send` show a neutral "OAuth" chip.

## Tests (TDD, mock network)
- `google_access_token`: mocked httpx returns token; error response raises.
- `send_email` OAuth path: oauth-only gmail mailbox → monkeypatch
  `google_access_token` + `_deliver`; assert `_deliver` called with
  `xoauth2_token` and gmail host/port, no password used.
- `send_email` password path unchanged (regression).
- `list_routing_mailboxes` can_send true for oauth gmail.

## Notes / risks
- Testing-mode (unverified app) refresh tokens expire after 7 days; older
  mailboxes may fail with `invalid_grant` until reconnected. Handle gracefully
  (log, mailbox stays not-sending) — do NOT crash the cycle.
- IMAP XOAUTH2 (inbound engagement) is out of scope here — sending only.
