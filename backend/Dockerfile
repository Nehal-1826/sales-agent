FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
        ca-certificates \
        openssl \
    && for n in yr yr1 yr2 ye ye1 ye2 r10 r11 r12 r13 r14 e5 e6 e7 e8 e9; do \
         curl -fsSL "http://${n}.i.lencr.org/" -o "/tmp/${n}.der" \
         && openssl x509 -inform DER -in "/tmp/${n}.der" -out "/usr/local/share/ca-certificates/lencr-${n}.crt" \
         && rm -f "/tmp/${n}.der"; \
       done \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt && pip install 'bcrypt<5'

COPY . .

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips=*"]
