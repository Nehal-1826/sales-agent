# WhatsApp sidecar (opt-in, unofficial)

> **Warning.** This uses [open-wa](https://github.com/open-wa/wa-automate-nodejs)
> to drive WhatsApp Web. That is against WhatsApp's terms and **the number can
> be banned**. Use a separate number, keep volumes low (Settings → WhatsApp →
> daily limit, default 20), and only message businesses that published the
> number. The zero-risk alternative is the "Open in WhatsApp" (wa.me) task the
> app creates when this sidecar is off.

The Django backend decides what is sent and when: every WhatsApp message needs a
human approval (never auto-approved), goes out only inside the email sending
window, under the daily limit, 60–240 s apart, and never to an opted-out number.
This service only delivers.

## API

All routes need the header `X-Sidecar-Secret: <SIDECAR_SECRET>`.

| Route | Result |
|---|---|
| `GET /status` | `{ state, connected }` |
| `GET /qr` | `{ qr }` — data-URL image of the login QR (`''` once logged in) |
| `POST /send` `{ to: "+9198…", text }` | `{ ok, id }`; 503 when not logged in |

## Run locally

```bash
cd whatsapp-sidecar
npm install                       # downloads Chromium via puppeteer
SIDECAR_SECRET=change-me SESSION_DIR=./session npm start
```

Then in the app: Settings → WhatsApp → turn on, helper address
`http://127.0.0.1:8002`, the same secret, and scan the QR with the phone
(WhatsApp → Linked devices). The session is saved in `SESSION_DIR`.

Env: `PORT` (8002), `SIDECAR_SECRET` (required), `SESSION_DIR` (`./session`),
`CHROME_PATH` (optional system Chrome), `OPENWA_LICENSE_KEY` (optional).

## Docker compose (snippet — not added to docker-compose.yml)

```yaml
  whatsapp-sidecar:
    image: node:20-bookworm
    working_dir: /app
    command: sh -c "npm install --omit=dev && npm start"
    environment:
      SIDECAR_SECRET: ${WHATSAPP_SIDECAR_SECRET}
      SESSION_DIR: /data/session
    volumes:
      - ./whatsapp-sidecar:/app
      - whatsapp_session:/data
    restart: unless-stopped
    # no published port: the backend reaches it at http://whatsapp-sidecar:8002

volumes:
  whatsapp_session:
```

Chromium needs its shared libraries in the image (`node:20-bookworm` plus
`apt-get install chromium` and `CHROME_PATH=/usr/bin/chromium` is the simplest).

## Licensing notes (open-wa)

* `@open-wa/wa-automate` 4.x (pinned here, `create()` / `ev.on('qr.**')` /
  `client.sendText(chatId, text)` / `client.onStateChanged`) is distributed
  under the Hippocratic License; the GitHub master is now a v5 rewrite
  (`createClient`, Node ≥ 22.21.1) — re-check the API before upgrading.
* Plain `sendText` to an existing contact needs no license key. open-wa's
  licensing page says sending to a number that is **not already a contact**
  needs a paid "Restricted"/"Premium" key — which is exactly cold outreach.
  Set `OPENWA_LICENSE_KEY` if you buy one; without it first messages may fail
  (the app keeps them queued with the error shown).
