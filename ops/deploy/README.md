# WarmPulse — VPS one-time setup

Target: Hostinger VPS shared with SashaLMS (Ubuntu 22.04+). Run these once
before the first `ops/deploy/deploy.sh` invocation.

## 1. System user and directories

```bash
sudo useradd --system --create-home --home-dir /var/www/warmpulse --shell /bin/bash warmpulse
sudo mkdir -p /var/www/warmpulse /var/log/warmpulse /etc/warmpulse
sudo chown -R warmpulse:warmpulse /var/www/warmpulse /var/log/warmpulse
```

## 2. Clone repo and bootstrap Python venv

```bash
sudo -u warmpulse git clone https://github.com/yourorg/warmpulse.git /var/www/warmpulse
sudo -u warmpulse python3 -m venv /var/www/warmpulse/backend/.venv
sudo -u warmpulse /var/www/warmpulse/backend/.venv/bin/pip install --upgrade pip
```

## 3. Node + pnpm (frontend build)

```bash
# Install Node 20 via NodeSource or nvm, then:
sudo npm install -g pnpm
```

## 4. Database

```bash
sudo -u postgres createdb warmpulse_db
sudo -u postgres createuser --pwprompt warmpulse   # paste a strong password
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE warmpulse_db TO warmpulse;"
```

SashaLMS's existing Postgres server is reused — do NOT install a second one.

## 5. Environment file

```bash
sudo cp ops/env/warmpulse.env.example /etc/warmpulse/warmpulse.env
sudo chown warmpulse:warmpulse /etc/warmpulse/warmpulse.env
sudo chmod 0600 /etc/warmpulse/warmpulse.env
sudoedit /etc/warmpulse/warmpulse.env   # fill every REPLACE_ME_* value
```

Generate secrets inline:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"   # FERNET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(64))"                                # JWT_SECRET
```

## 6. systemd units

```bash
sudo cp ops/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now warmpulse-api warmpulse-worker warmpulse-zai-worker warmpulse-beat
sudo systemctl status warmpulse-api --no-pager
```

Grant the `warmpulse` user NOPASSWD sudo for just these four units (so
`deploy.sh` can restart them). Put in `/etc/sudoers.d/warmpulse`:

```
warmpulse ALL=(root) NOPASSWD: /bin/systemctl restart warmpulse-api, /bin/systemctl restart warmpulse-worker, /bin/systemctl restart warmpulse-zai-worker, /bin/systemctl restart warmpulse-beat, /bin/systemctl status warmpulse-api
```

## 7. Nginx

Include the snippet inside the existing `server { listen 443 ssl; ... }`
block that already fronts SashaLMS:

```nginx
include /var/www/warmpulse/ops/nginx/warmpulse.conf;
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 8. First deploy

```bash
# From your workstation:
ops/deploy/deploy.sh yourdomain.com
```
