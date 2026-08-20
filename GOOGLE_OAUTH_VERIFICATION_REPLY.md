# Google OAuth Verification — Reply Pack (WarmPulse)

Use this to (a) configure Cloud Console and (b) reply to the verification email.
Updated 2026-07-30. The app requests three Gmail scopes and **each is actively
used** by a real, demonstrable feature (this is what Google's least-privilege
rule requires — no unused/"future-proofing" scopes).

| Scope | Used for | Code |
|-------|----------|------|
| `gmail.send` | Send warmup mail from the mailbox | `services/warmup/oauth_token.gmail_api_send` |
| `gmail.modify` | Rescue peer warmup mail from Spam, mark read, star, label it | `tasks/client_engagement` + `services/warmup/gmail_engagement` |
| `gmail.labels` | Create + apply the "WarmPulse" label | `services/warmup/gmail_engagement.ensure_warmup_label` |

---

## STEP 1 — Set the scopes in Cloud Console (do this FIRST)

Google Cloud Console → **APIs & Services → OAuth consent screen → Data Access**.
Ensure the sensitive-scope list is **exactly** these (string-match with the app):

- `openid`
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.labels`

Remove anything else. **Save.** This resolves the "Scope Discrepancy" finding
(the codebase now requests precisely these three Gmail scopes — deployed).

## STEP 2 — Confirm the privacy policy URL

- Privacy policy: **https://warmpulse.tech/privacy** (linked in the site footer).
- It now (a) has a **"How we protect your data"** section (TLS in transit,
  Fernet AES-128 at rest, key isolation, credential scrubbing, audit logging),
  (b) a **"Retention & deletion"** section, and (c) a **"Why we use Gmail
  scopes"** section that discloses `gmail.send`, `gmail.modify`, and
  `gmail.labels` and exactly what each does.
- If the URL in your consent screen differs, set it to the one above.

---

## STEP 3 — Reply to the verification email

Paste the sections below.

### A. Scope justification — `gmail.send`

> WarmPulse is an email-deliverability ("mailbox warm-up") tool. On a schedule
> the user configures, it sends a small, ramping number of warm-up messages
> **from the user's own connected mailbox** to WarmPulse's own network of
> consenting warm-up inboxes, gradually building the sending domain's
> reputation so the user's legitimate business email lands in the inbox instead
> of spam. Sending on the user's behalf is the feature, so `gmail.send` (via
> `users.messages.send`) is the narrowest scope that implements it. We do not
> use SMTP for Gmail and therefore do not request `https://mail.google.com/`.

### B. Scope justification — `gmail.modify`

> Warm-up is bidirectional: our peer network also sends warm-up mail **to** the
> user's mailbox, and the engagement it receives there is the strongest
> reputation signal. `gmail.modify` lets us act on that specific warm-up mail
> inside the user's mailbox — the maximum user-facing extent is:
>
> 1. **Rescue from Spam** — if Google filed a warm-up message under Spam, we
>    move it back to the Inbox (remove the `SPAM` label, add `INBOX`). This is
>    the core reputation-repair action and the primary reason we need modify.
> 2. **Mark as read** — remove the `UNREAD` label on engaged warm-up mail.
> 3. **Star** a portion of warm-up mail (add the `STARRED` label).
> 4. **Apply our "WarmPulse" label** so the user can see warm-up activity.
>
> A narrower scope does not exist for this: `gmail.send` cannot change labels,
> and there is no "labels-only-on-messages" or "spam-only" Gmail scope —
> `gmail.modify` is the minimum scope that can move a message out of Spam and
> change its read/label state. **We use it only on mail we identify as coming
> from our own peer network** (we search Gmail for our peer sender addresses and
> read only the `From` header and label ids of the matches — never message
> bodies), and we never read, forward, store, or transmit the user's real
> correspondence. Implementation: `services/warmup/gmail_engagement.py`
> (`modify_message` → `users.messages.modify`).

### C. Scope justification — `gmail.labels`

> Before we can apply the "WarmPulse" label to warm-up mail, the label has to
> exist. `gmail.labels` is used solely to look up the user's label list and
> create the single "WarmPulse" user label if it isn't there yet
> (`users.labels.list` / `users.labels.create`). We create exactly one label
> and never read or modify the user's other labels. Implementation:
> `services/warmup/gmail_engagement.ensure_warmup_label`.

### D. Use-case justification (addresses the "Gmail app distribute spam" finding)

> We want to directly address the concern that WarmPulse could distribute spam.
> WarmPulse is a sender-reputation tool, not a bulk-sending or outreach tool,
> and it is architecturally incapable of sending unsolicited mail to
> third-party recipients:
>
> 1. **Closed recipient set.** Warm-up mail is delivered only between the user's
>    own connected mailbox and WarmPulse's own network of warm-up inboxes, which
>    exist solely to receive and engage with this traffic and consent to it.
>    There is no feature to enter arbitrary third-party recipients.
> 2. **Consensual on both ends.** Every warm-up message goes to an inbox that
>    WarmPulse operates and that is expecting it. No non-consenting person
>    receives warm-up mail.
> 3. **Low, ramping volume.** Sending starts at ~5 messages/day and ramps slowly
>    (5 → 10 → 20 → 35 → 50 over ~4 weeks) — the opposite of bulk distribution.
> 4. **Reputation, not outreach.** The product improves deliverability of the
>    user's own legitimate mail. We provide no feature to compose or send
>    campaigns to end recipients using Gmail data.
>
> Because warm-up traffic never reaches non-consenting third parties, WarmPulse
> does not fall under the "distribute spam" prohibited use case.

### E. Privacy policy — data protection disclosures

> Our privacy policy at https://warmpulse.tech/privacy has an explicit "How we
> protect your data" section: all data is encrypted in transit with TLS
> (HTTPS); sensitive data (Gmail OAuth refresh tokens, mailbox passwords, 2FA
> secrets) is encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256);
> encryption keys are held only in server-side configuration; plaintext
> credentials exist only transiently in memory and are scrubbed immediately
> after use; production access is restricted; per-workspace data is isolated;
> and administrative actions are recorded in an append-only audit log. The
> policy also states retention/deletion practices and discloses each Gmail
> scope (send / modify / labels) and what it is used for.

### F. Test credentials + navigation steps  (FILL IN before sending)

> Test account (no phone / credit-card / 2FA blockers):
>   - URL: https://warmpulse.tech/login
>   - Email: __________________
>   - Password: __________________
>
> Steps to demonstrate all three scopes:
>   1. Sign in at the URL above with the test credentials.
>   2. Go to **Mailboxes → Connect mailbox → Gmail** and complete the Google
>      consent screen — it now requests Send, plus Read/compose/send-and-modify
>      and Manage-labels (gmail.modify + gmail.labels).
>   3. **gmail.send:** on the next warm-up cycle a message is sent from the
>      mailbox; it appears in the mailbox **Activity** log as an outbound "sent".
>   4. **gmail.modify + gmail.labels:** as the peer network sends warm-up mail
>      back to the mailbox, WarmPulse creates a "WarmPulse" label, applies it to
>      that mail, rescues any of it from Spam into the Inbox, and marks/stars it.
>      You can see the "WarmPulse" label appear in the test Gmail account and the
>      corresponding inbound engagement events (opened / starred / spam_rescued)
>      in the WarmPulse Activity log.

> ⚠️ Create a dedicated test account and REMOVE any phone-verification, payment,
> or 2FA requirement on it before sending. Google's reviewer must reach the
> mailbox-connect flow without blockers.

---

## STEP 4 — Demo video (record if asked)

One take, under ~3 minutes:
1. Site homepage → footer → Privacy Policy (show "How we protect your data" and
   "Why we use Gmail scopes").
2. Sign in with the test account.
3. The mailbox-connect Google consent screen showing all requested permissions.
4. The connected mailbox: an outbound warm-up "sent" event (gmail.send), the
   "WarmPulse" label in the Gmail account, and an inbound engagement event —
   ideally a spam-rescue (gmail.modify + gmail.labels).

Upload unlisted to YouTube/Drive and paste the link in your reply.

---

## Reality check (important, unchanged)

Scope discrepancy, the least-privilege objection, and the privacy-policy items
are fully addressed: all three scopes are now backed by real, demonstrable code,
disclosed in the privacy policy, and string-matched to the consent screen.

The **"Gmail app distribute spam"** classification is still a judgment call by
Google's reviewer about the warm-up product category. Section D is the strongest
honest case (closed-loop, consensual, low ramping volume). If Google still
declines on that basis, the fallback that needs **no** OAuth verification is to
have users connect Gmail via an **app password / SMTP+IMAP** instead of the
OAuth scopes — the warmup engine already supports password-based mailboxes.
