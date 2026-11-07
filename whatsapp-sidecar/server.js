// WhatsApp sidecar for the sales agent — OPT-IN, unofficial (open-wa).
// Automating WhatsApp Web breaks WhatsApp's terms: the number can be banned.
// Use a separate number, keep volumes low, message only published business numbers.
//
// API (every route needs header X-Sidecar-Secret = SIDECAR_SECRET):
//   GET  /status -> { state, connected }
//   GET  /qr     -> { qr }   data-URL PNG of the login QR ('' once logged in)
//   POST /send   { to: "+919876543210", text } -> { ok, id }
// The Django side (backend/core/whatsapp.py) decides WHAT and WHEN to send
// (human approval, daily cap, sending window); this service only delivers.

const http = require('http');
const { create, ev } = require('@open-wa/wa-automate');

const PORT = parseInt(process.env.PORT || '8002', 10);
const SECRET = process.env.SIDECAR_SECRET || '';
const SESSION_DIR = process.env.SESSION_DIR || './session';
const LICENSE_KEY = process.env.OPENWA_LICENSE_KEY || undefined;

if (!SECRET) {
  console.error('SIDECAR_SECRET is required.');
  process.exit(1);
}

let client = null;
let state = 'STARTING';
let lastQr = '';

// the login QR, as a data-URL image (fires again whenever it refreshes)
ev.on('qr.**', (qrcode) => {
  lastQr = qrcode;
  state = 'QR_NEEDED';
});

create({
  sessionId: 'sales',
  sessionDataPath: SESSION_DIR, // mount a volume here to survive restarts
  multiDevice: true,
  headless: true,
  qrTimeout: 0, // wait for a scan forever
  authTimeout: 0,
  useChrome: !!process.env.CHROME_PATH,
  executablePath: process.env.CHROME_PATH || undefined,
  licenseKey: LICENSE_KEY,
  disableSpins: true,
  logConsole: false,
})
  .then((c) => {
    client = c;
    state = 'CONNECTED';
    lastQr = '';
    client.onStateChanged((s) => {
      state = s;
      if (s === 'CONFLICT' || s === 'UNLAUNCHED') client.forceRefocus();
    });
  })
  .catch((err) => {
    state = 'ERROR';
    console.error('open-wa failed to start:', err && err.message);
  });

function toChatId(e164) {
  const digits = String(e164 || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? `${digits}@c.us` : null;
}

function reply(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 20000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (e) { resolve({}); }
    });
  });
}

http.createServer(async (req, res) => {
  if (req.headers['x-sidecar-secret'] !== SECRET) return reply(res, 401, { error: 'bad secret' });
  const path = (req.url || '').split('?')[0];
  try {
    if (req.method === 'GET' && path === '/status') {
      return reply(res, 200, { state, connected: state === 'CONNECTED' && !!client });
    }
    if (req.method === 'GET' && path === '/qr') {
      return reply(res, 200, { qr: client && state === 'CONNECTED' ? '' : lastQr });
    }
    if (req.method === 'POST' && path === '/send') {
      if (!client || state !== 'CONNECTED') {
        return reply(res, 503, { ok: false, error: 'WhatsApp is not logged in — scan the QR in Settings.' });
      }
      const { to, text } = await readJson(req);
      const chatId = toChatId(to);
      if (!chatId || !text) return reply(res, 400, { ok: false, error: 'to and text are required' });
      const id = await client.sendText(chatId, String(text).slice(0, 4000));
      if (!id) return reply(res, 502, { ok: false, error: 'WhatsApp did not accept the message.' });
      return reply(res, 200, { ok: true, id: String(id) });
    }
    return reply(res, 404, { error: 'not found' });
  } catch (err) {
    return reply(res, 500, { ok: false, error: (err && err.message) || 'send failed' });
  }
}).listen(PORT, () => console.log(`whatsapp-sidecar on :${PORT}`));
