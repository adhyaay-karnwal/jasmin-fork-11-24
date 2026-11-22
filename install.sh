#!/bin/sh
# Install Jasmine on a Linux host with KVM:
#   curl -fsSL https://raw.githubusercontent.com/arjunkshah12345-hash/jasmine-sandbox/master/install.sh | sudo sh
# Then: jasmined build default python:3.12-slim && systemctl enable --now jasmined
set -eu
REPO=arjunkshah12345-hash/jasmine-sandbox
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
[ -e /dev/kvm ] || { echo "no /dev/kvm: this host cannot run microVMs" >&2; exit 1; }
case "$(uname -m)" in x86_64|aarch64) ARCH=$(uname -m) ;; *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;; esac
VER=${JASMINE_VERSION:-$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/$REPO/releases/latest | sed 's#.*/##')}
NAME=jasmine-$VER-$ARCH-linux
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/$NAME.tar.gz" "https://github.com/$REPO/releases/download/$VER/$NAME.tar.gz"
curl -fsSL -o "$TMP/$NAME.tar.gz.sha256" "https://github.com/$REPO/releases/download/$VER/$NAME.tar.gz.sha256"
(cd "$TMP" && sha256sum -c "$NAME.tar.gz.sha256")
tar -xzf "$TMP/$NAME.tar.gz" -C "$TMP"
install -m 0755 "$TMP/$NAME/jasmined" /usr/local/bin/jasmined
install -D -m 0755 "$TMP/$NAME/jasmine-agent" /usr/local/lib/jasmine/jasmine-agent
install -D -m 0755 "$TMP/$NAME/setup-host.sh" /usr/local/lib/jasmine/setup-host.sh
install -D -m 0644 "$TMP/$NAME/jasmined.service" /etc/systemd/system/jasmined.service
/usr/local/lib/jasmine/setup-host.sh
systemctl daemon-reload
echo "Jasmine $VER installed. Next:"
echo "  jasmined build default python:3.12-slim"
echo "  systemctl enable --now jasmined"
