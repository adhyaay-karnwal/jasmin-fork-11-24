#!/bin/sh
# Install Warren on a Linux host with KVM:
#   curl -fsSL https://raw.githubusercontent.com/arjunkshah12345-hash/warren/master/install.sh | sudo sh
# Then: warrend build default python:3.12-slim && systemctl enable --now warrend
set -eu
REPO=arjunkshah12345-hash/warren
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
[ -e /dev/kvm ] || { echo "no /dev/kvm: this host cannot run microVMs" >&2; exit 1; }
case "$(uname -m)" in x86_64|aarch64) ARCH=$(uname -m) ;; *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;; esac
VER=${WARREN_VERSION:-$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/$REPO/releases/latest | sed 's#.*/##')}
NAME=warren-$VER-$ARCH-linux
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/$NAME.tar.gz" "https://github.com/$REPO/releases/download/$VER/$NAME.tar.gz"
curl -fsSL -o "$TMP/$NAME.tar.gz.sha256" "https://github.com/$REPO/releases/download/$VER/$NAME.tar.gz.sha256"
(cd "$TMP" && sha256sum -c "$NAME.tar.gz.sha256")
tar -xzf "$TMP/$NAME.tar.gz" -C "$TMP"
install -m 0755 "$TMP/$NAME/warrend" /usr/local/bin/warrend
install -D -m 0755 "$TMP/$NAME/warren-agent" /usr/local/lib/warren/warren-agent
install -D -m 0755 "$TMP/$NAME/setup-host.sh" /usr/local/lib/warren/setup-host.sh
install -D -m 0644 "$TMP/$NAME/warrend.service" /etc/systemd/system/warrend.service
/usr/local/lib/warren/setup-host.sh
systemctl daemon-reload
echo "Warren $VER installed. Next:"
echo "  warrend build default python:3.12-slim"
echo "  systemctl enable --now warrend"
