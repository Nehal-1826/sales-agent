# Backend — Django API + agent worker
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=UTC

WORKDIR /app

# System deps: libxml2/runtime for lxml (wheels need no compiler), tzdata for ZoneInfo,
# ca-certificates + Let's Encrypt Gen-Y/Gen-E intermediates (for mail servers sending leaf-only cert chains)
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata curl ca-certificates openssl \
    && for n in yr yr1 yr2 ye ye1 ye2 r10 r11 r12 r13 r14 e5 e6 e7 e8 e9; do \
         curl -fsSL "http://${n}.i.lencr.org/" -o "/tmp/${n}.der" \
         && openssl x509 -inform DER -in "/tmp/${n}.der" -out "/usr/local/share/ca-certificates/lencr-${n}.crt" \
         && rm -f "/tmp/${n}.der"; \
       done \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x /app/entrypoint.sh
EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
