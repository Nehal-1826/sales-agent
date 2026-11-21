# WhatsApp sidecar — open-wa needs a real Chromium; the system one is used
# (PUPPETEER_SKIP_CHROMIUM_DOWNLOAD) to keep the image lean.
# node:22 — open-wa 5.x requires it (node:sqlite / newer builtins).
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
      libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
      libnspr4 libnss3 libx11-6 libxcomposite1 libxdamage1 libxrandr2 \
      xdg-utils zstd \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
# open-wa 5's ScriptLoader resolves `transport/assets` from the CWD — link it
RUN mkdir -p /app/transport && ln -s /app/node_modules/@open-wa/core/dist/transport/assets /app/transport/assets

# session survives restarts via a mounted volume (SESSION_DIR)
ENV SESSION_DIR=/data/session PORT=8002
RUN mkdir -p /data/session
VOLUME /data/session

# open-wa 5 passes its default chromium args as ONE shell-quoted string, so
# chromium sees a stray `"` positional next to about:blank ("Multiple targets
# are not supported in headless mode") — the wrapper strips quotes per arg and
# re-splits. open-wa 5's create() also never forwards browserArgs, so the
# sandbox flags are injected HERE (root container, chromium refuses otherwise).
RUN printf '%s\n' \
  '#!/bin/sh' \
  'clean=""' \
  'for a in "$@"; do' \
  '  a=${a#\"}; a=${a%\"}' \
  '  clean="$clean $a"' \
  'done' \
  'exec /usr/bin/chromium --no-sandbox --disable-setuid-sandbox $clean' \
  > /usr/local/bin/chromium-clean && chmod +x /usr/local/bin/chromium-clean

ENV CHROME_PATH=/usr/local/bin/chromium-clean \
    PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium-clean

CMD ["node", "server.js"]
