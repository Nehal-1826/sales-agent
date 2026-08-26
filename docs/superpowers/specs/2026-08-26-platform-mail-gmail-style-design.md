# Platform Mail — Gmail-style client (design)

**Date:** 2026-08-26
**Status:** approved by reference — user attached a Gmail screenshot ("it should
open like that") and asked for "a full mail system in WarmPulse like Gmail".
**Scope:** the platform's own account only (`/admin/platform-mail`,
noreply@warmpulse.tech). The read-only Mail Viewer for client mailboxes is
out of scope (it already benefits from shared `MailBodyView`).

## Problem

The current detail pane is a debug-style header grid + monospace body block.
Headers/bodies ARE returned and rendered (verified live end-to-end: API,
served bundle, DOM), but it doesn't read like a mail client. The user wants
the open-mail experience to look like Gmail: toolbar, avatar, "to me"
details, inline-rendered HTML, attachments, quick reply.

## Backend additions (`services/platform_mail.py`, `routes/platform_mail.py`)

1. **Search** — `list_messages(search=...)`: IMAP `SEARCH TEXT <query>`
   (matches headers + body) instead of `SEARCH ALL`; same listing shape.
   Route: `GET /messages?folder=&search=`.
2. **Star (\Flagged)** — listing entries gain `starred: bool` (parsed from
   FLAGS); `set_starred(folder, uid, starred)` does a silent UID STORE
   ±FLAGS `\Flagged`, audited as `platform_mail_flag`. Route:
   `POST /{uid}/star?starred=`.
3. **Attachments listing** — `get_message` gains
   `attachments: [{part, filename, content_type, size}]`: leaf parts with
   `Content-Disposition: attachment` (or a filename param), with their IMAP
   part paths computed by walking the MIME tree (1, 2, 1.2 …).
4. **Attachment download** — `get_attachment(folder, uid, part)` validates
   `part` as `\d+(\.\d+)*`, SELECT + `UID FETCH (BODY.PEEK[{part}])`, decodes
   the part (CTE) and returns `(filename, content_type, bytes)`; the route
   streams it with `Content-Disposition: attachment`. Audited as
   `platform_mail_attachment`.
5. **Compose attachments** — `send_mail(attachments=[{filename,
   content_type, content_b64}])`, total ≤ 10 MB, strict Pydantic model
   (`extra="forbid"`); added via `EmailMessage.add_attachment`.

## Frontend (`PlatformMailPage.tsx` rewrite + `features/admin/api.ts`)

- **Header:** search box (debounced, filters the open folder server-side,
  clearable) + Compose + Refresh.
- **List (Gmail rows):** star toggle first, colored avatar circle with the
  sender's initial, bold sender + inline subject — gray snippet, short date
  right ("14:42" today, else "24 Aug"), unread = bold + accent dot.
- **Open view (the reference screenshot):** toolbar (back, Reply, Forward,
  Star, Mark unread, Delete), big bold subject, avatar + sender name +
  "to me" popover (full To/Cc/Date/Msg-ID), short date right, body as a
  white rounded card — HTML via the existing sandboxed-iframe `MailBodyView`,
  text fallback in normal (non-mono) type — attachment chips that download,
  and a Gmail-style quick-reply box (textarea + Send) at the bottom.
- **Forward:** opens compose with `Fwd:` subject + quoted original
  (From/Date/Subject headers + body). **Reply** keeps threading headers.
- Attachment downloads go through axios (auth header) as a blob → object URL.

## Deliberately out (v1)

- Rich-text (bold/italic) compose editor — sends stay plain text; received
  HTML renders fully.
- Conversation/thread grouping, labels, aliases, signatures.
- Sending attachments from the read-only Mail Viewer.

## Testing

Backend: extend `test_platform_mail.py` fakes — search criteria recorded,
starred parsing, star STORE, attachment listing, part fetch + download,
send-with-attachment bytes in SMTP message and Sent APPEND. Frontend:
`pnpm typecheck` + `pnpm build`. Live: deploy, then browser E2E with a
temporary super_admin (deleted immediately after) + screenshots.
