#!/bin/sh
# Install Azami on a Linux host with KVM:
#   curl -fsSL https://raw.githubusercontent.com/arjunkshah12345-hash/azami/master/install.sh | sudo sh
# Then: azamid build default python:3.12-slim && systemctl enable --now azamid
set -eu
REPO=arjunkshah12345-hash/azami
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
[ -e /dev/kvm ] || { echo "no /dev/kvm: this host cannot run microVMs" >&2; exit 1; }
case "$(uname -m)" in x86_64|aarch64) ARCH=$(uname -m) ;; *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;; esac
VER=${AZAMI_VERSION:-$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/$REPO/releases/latest | sed 's#.*/##')}
NAME=azami-$VER-$ARCH-linux
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/$NAME.tar.gz" "https://github.com/$REPO/releases/download/$VER/$NAME.tar.gz"
curl -fsSL -o "$TMP/$NAME.tar.gz.sha256" "https://github.com/$REPO/releases/download/$VER/$NAME.tar.gz.sha256"
(cd "$TMP" && sha256sum -c "$NAME.tar.gz.sha256")
tar -xzf "$TMP/$NAME.tar.gz" -C "$TMP"
install -m 0755 "$TMP/$NAME/azamid" /usr/local/bin/azamid
install -D -m 0755 "$TMP/$NAME/azami-agent" /usr/local/lib/azami/azami-agent
install -D -m 0755 "$TMP/$NAME/setup-host.sh" /usr/local/lib/azami/setup-host.sh
install -D -m 0644 "$TMP/$NAME/azamid.service" /etc/systemd/system/azamid.service
/usr/local/lib/azami/setup-host.sh
systemctl daemon-reload
echo "Azami $VER installed. Next:"
echo "  azamid build default python:3.12-slim"
echo "  systemctl enable --now azamid"
