#!/bin/sh
# Install the Jasmine Cloud gateway (the public API) behind Caddy with automatic TLS.
#
#   sudo DOMAIN=api.tryjasmine.dev HOSTS="h1=http://10.0.0.2:7171" HOST_KEY=... \
#        FIREBASE_SA=/root/firebase-sa.json \
#        STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... ./gateway.sh
#
# Run from a checkout of the repo (it installs ../gateway). Point DOMAIN's DNS
# A record at this machine first so Caddy can get a certificate.
set -eu
: "${DOMAIN:?}" "${HOSTS:?}" "${HOST_KEY:?}" "${FIREBASE_SA:?path to a Firebase service-account JSON}"
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v caddy >/dev/null || apt-get install -y caddy

id jasmine-gw >/dev/null 2>&1 || useradd --system --home /opt/jasmine-gateway --shell /usr/sbin/nologin jasmine-gw
rm -rf /opt/jasmine-gateway && cp -r "$HERE/../gateway" /opt/jasmine-gateway
(cd /opt/jasmine-gateway && npm install --omit=dev --no-audit --no-fund)
install -d -m 750 -o root -g jasmine-gw /etc/jasmine-gateway
install -m 640 -o root -g jasmine-gw "$FIREBASE_SA" /etc/jasmine-gateway/firebase-sa.json

umask 027
cat > /etc/jasmine-gateway/env <<ENV
PORT=8080
JASMINE_HOSTS=$HOSTS
JASMINE_HOST_KEY=$HOST_KEY
JASMINE_STORE=firestore
GOOGLE_APPLICATION_CREDENTIALS=/etc/jasmine-gateway/firebase-sa.json
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}
SITE_URL=${SITE_URL:-https://tryjasmine.dev}
ENV
chgrp jasmine-gw /etc/jasmine-gateway/env

cat > /etc/systemd/system/jasmine-gateway.service <<UNIT
[Unit]
Description=Jasmine Cloud gateway
After=network-online.target
Wants=network-online.target

[Service]
User=jasmine-gw
EnvironmentFile=/etc/jasmine-gateway/env
WorkingDirectory=/opt/jasmine-gateway
ExecStart=/usr/bin/node src/server.mjs
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  reverse_proxy 127.0.0.1:8080 {
    flush_interval -1
  }
}
CADDY

systemctl daemon-reload
systemctl enable --now jasmine-gateway
systemctl restart jasmine-gateway caddy
sleep 2
curl -fsS http://127.0.0.1:8080/healthz && echo && echo "gateway up: https://$DOMAIN"
