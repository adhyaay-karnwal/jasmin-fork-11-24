#!/usr/bin/env bash
# Prepare a Linux KVM host for warrend: Firecracker, guest kernel, crane, and an
# XFS (reflink) data directory. Idempotent. Run as root.
set -euo pipefail
ARCH="$(uname -m)"
DATA="${WARREN_DATA:-/var/lib/warren}"
FC_VERSION="${FC_VERSION:-}"

[ -e /dev/kvm ] || { echo "no /dev/kvm: this host cannot run microVMs" >&2; exit 1; }
chmod 666 /dev/kvm || true

if ! command -v firecracker >/dev/null; then
  if [ -z "$FC_VERSION" ]; then
    FC_VERSION="$(basename "$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/firecracker-microvm/firecracker/releases/latest)")"
  fi
  curl -fsSL "https://github.com/firecracker-microvm/firecracker/releases/download/${FC_VERSION}/firecracker-${FC_VERSION}-${ARCH}.tgz" | tar -xz -C /tmp
  install -m 0755 "/tmp/release-${FC_VERSION}-${ARCH}/firecracker-${FC_VERSION}-${ARCH}" /usr/local/bin/firecracker
fi
firecracker --version | head -1

if ! command -v crane >/dev/null; then
  GOARCH=$([ "$ARCH" = aarch64 ] && echo arm64 || echo x86_64)
  curl -fsSL "https://github.com/google/go-containerregistry/releases/latest/download/go-containerregistry_Linux_${GOARCH}.tar.gz" | tar -xz -C /usr/local/bin crane
fi

# XFS with reflink so every sandbox disk is an O(1) copy-on-write clone.
mkdir -p "$DATA"
if [ "$(stat -f -c %T "$DATA")" != "xfs" ]; then
  IMG="${WARREN_XFS_IMG:-/var/warren-xfs.img}"
  [ -f "$IMG" ] || { truncate -s "${WARREN_XFS_SIZE:-20G}" "$IMG"; mkfs.xfs -q -m reflink=1 "$IMG"; }
  mount -o loop "$IMG" "$DATA"
fi

if [ ! -f "$DATA/vmlinux" ]; then
  # Firecracker's CI kernels. Path-style S3 URL (the bucket name has dots, which breaks TLS
  # with virtual-hosted URLs). Fall back to earlier minors if this release has none yet.
  MAJOR_MINOR="$(firecracker --version | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)"
  MINOR="${MAJOR_MINOR#*.}"; KEY=""
  for m in $(seq "$MINOR" -1 10); do
    KEY="$(curl -fsSL "https://s3.amazonaws.com/spec.ccfc.min/?prefix=firecracker-ci/v1.${m}/${ARCH}/vmlinux-&list-type=2" \
      | grep -oE "firecracker-ci/v1\.${m}/${ARCH}/vmlinux-[0-9]+\.[0-9]+\.[0-9]{1,3}<" | tr -d '<' | sort -V | tail -1 || true)"
    [ -n "$KEY" ] && break
  done
  [ -n "$KEY" ] || { echo "could not find a Firecracker CI kernel" >&2; exit 1; }
  curl -fsSL -o "$DATA/vmlinux" "https://s3.amazonaws.com/spec.ccfc.min/${KEY}"
  echo "kernel: $KEY"
fi
echo "host ready: data=$DATA ($(stat -f -c %T "$DATA"))"
