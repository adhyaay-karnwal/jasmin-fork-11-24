//! Per-sandbox networking.
//!
//! Every sandbox is restored from the same snapshot, so every guest has the
//! same baked-in config: eth0 = 172.16.0.2/30 via 172.16.0.1, backed by a
//! host tap device named `tap0`. To let many such guests coexist, each
//! Firecracker process runs in its own network namespace ("slot") holding its
//! own `tap0`. Each slot NATs the guest to a unique veth address, and the host
//! masquerades that out to the internet.
//!
//! Slot setup costs tens of milliseconds of `ip`/`iptables` calls, so slots are
//! built ahead of time and recycled. This keeps the create path free of
//! network plumbing; it is infrastructure, not pre-started VMs.

use anyhow::{bail, Context, Result};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use tokio::sync::{Mutex, Notify};

pub const GUEST_IP: &str = "172.16.0.2";
pub const GATEWAY_IP: &str = "172.16.0.1";
pub const GUEST_MAC: &str = "06:00:ac:10:00:02";
pub const TAP: &str = "tap0";
/// Every slot's tap gets the same MAC, so a guest restored into a different slot
/// (resume, create-from-snapshot) still has a valid ARP entry for its gateway.
pub const GATEWAY_MAC: &str = "06:00:ac:10:00:01";
/// Kernel cmdline fragment: static IP config, no DHCP.
pub const KERNEL_IP_ARG: &str = "ip=172.16.0.2::172.16.0.1:255.255.255.252::eth0:off";
const MAX_SLOTS: u32 = 16_000;

pub struct NetPool {
    free: Mutex<VecDeque<u32>>,
    next: AtomicU32,
    min_free: usize,
    wake: Notify,
}

pub struct Slot(pub u32);

impl Slot {
    pub fn netns_path(&self) -> String {
        format!("/var/run/netns/{}", ns_name(self.0))
    }
}

fn ns_name(k: u32) -> String {
    format!("wrn{k}")
}

/// Host-side /30 for slot k: 10.200.0.0/16 split into 16384 subnets.
fn veth_ips(k: u32) -> (String, String) {
    let base = k * 4;
    let (hi, lo) = (base / 256, base % 256);
    (format!("10.200.{hi}.{}", lo + 1), format!("10.200.{hi}.{}", lo + 2))
}

async fn sh(script: &str) -> Result<()> {
    let out = tokio::process::Command::new("sh").arg("-ec").arg(script).output().await?;
    if !out.status.success() {
        bail!("{}\n--- script ---\n{script}", String::from_utf8_lossy(&out.stderr));
    }
    Ok(())
}

impl NetPool {
    /// `server`: true for the long-running daemon, which owns slots 0..MAX_SLOTS and
    /// clears leftovers from a previous run. One-shot CLI builds use a private slot
    /// above that range and leave the server's slots alone.
    pub async fn new(min_free: usize, server: bool) -> Result<Arc<Self>> {
        let cleanup = if server {
            r#"
for ns in $(ip netns list | awk '{print $1}' | grep '^wrn[0-9]*$' || true); do ip netns del "$ns"; done
for l in $(ip -o link show | awk -F': ' '{print $2}' | cut -d@ -f1 | grep '^wrv[0-9]*$' || true); do ip link del "$l" 2>/dev/null || true; done
"#
        } else {
            ""
        };
        // Host: forwarding + masquerade for the slot range. Idempotent.
        sh(&format!(r#"
sysctl -qw net.ipv4.ip_forward=1
iptables -t nat -C POSTROUTING -s 10.200.0.0/16 ! -d 10.200.0.0/16 -j MASQUERADE 2>/dev/null ||
  iptables -t nat -A POSTROUTING -s 10.200.0.0/16 ! -d 10.200.0.0/16 -j MASQUERADE
iptables -C FORWARD -s 10.200.0.0/16 -j ACCEPT 2>/dev/null || iptables -I FORWARD -s 10.200.0.0/16 -j ACCEPT
iptables -C FORWARD -d 10.200.0.0/16 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT 2>/dev/null ||
  iptables -I FORWARD -d 10.200.0.0/16 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
# Isolation, inserted above the accepts: no sandbox-to-sandbox traffic, no cloud
# metadata endpoint (credential theft), no access to services on the host itself.
iptables -C FORWARD -s 10.200.0.0/16 -d 10.200.0.0/16 -j DROP 2>/dev/null || iptables -I FORWARD -s 10.200.0.0/16 -d 10.200.0.0/16 -j DROP
iptables -C FORWARD -s 10.200.0.0/16 -d 169.254.0.0/16 -j DROP 2>/dev/null || iptables -I FORWARD -s 10.200.0.0/16 -d 169.254.0.0/16 -j DROP
iptables -C INPUT -s 10.200.0.0/16 -j DROP 2>/dev/null || iptables -I INPUT -s 10.200.0.0/16 -j DROP
{cleanup}"#))
        .await
        .context("host network setup (needs root, iproute2, iptables)")?;
        let first = if server { 0 } else { MAX_SLOTS + 1 + std::process::id() % 300 };
        let pool = Arc::new(NetPool { free: Mutex::new(VecDeque::new()), next: AtomicU32::new(first), min_free, wake: Notify::new() });
        // Fill synchronously to the minimum so the first creates are fast, then keep topped up.
        for _ in 0..min_free {
            let k = pool.build_slot().await?;
            pool.free.lock().await.push_back(k);
        }
        let bg = pool.clone();
        tokio::spawn(async move {
            loop {
                while bg.free.lock().await.len() < bg.min_free {
                    match bg.build_slot().await {
                        Ok(k) => bg.free.lock().await.push_back(k),
                        Err(e) => {
                            tracing::error!("net slot build failed: {e:#}");
                            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        }
                    }
                }
                bg.wake.notified().await;
            }
        });
        Ok(pool)
    }

    async fn build_slot(&self) -> Result<u32> {
        let k = self.next.fetch_add(1, Ordering::SeqCst);
        if k == MAX_SLOTS {
            bail!("out of network slots");
        }
        let (ns, (host_ip, ns_ip)) = (ns_name(k), veth_ips(k));
        sh(&format!(
            r#"
ip netns add {ns}
ip link add wrv{k} type veth peer name veth0 netns {ns}
ip addr add {host_ip}/30 dev wrv{k}
ip link set wrv{k} up
ip -n {ns} -b - <<EOF
link set lo up
addr add {ns_ip}/30 dev veth0
link set veth0 up
route add default via {host_ip}
tuntap add {TAP} mode tap
link set {TAP} address {GATEWAY_MAC}
addr add {GATEWAY_IP}/30 dev {TAP}
link set {TAP} up
EOF
ip netns exec {ns} sh -ec '
  sysctl -qw net.ipv4.ip_forward=1
  iptables -t nat -A POSTROUTING -o veth0 -s {GUEST_IP} -j MASQUERADE
'
"#
        ))
        .await?;
        Ok(k)
    }

    pub async fn acquire(&self) -> Result<Slot> {
        let popped = self.free.lock().await.pop_front();
        self.wake.notify_one();
        match popped {
            Some(k) => Ok(Slot(k)),
            None => {
                tracing::warn!("net slot pool empty; building one inline (raise --net-pool)");
                Ok(Slot(self.build_slot().await?))
            }
        }
    }

    /// Return a slot once its VM is gone. Flushing conntrack keeps the next
    /// tenant from inheriting the previous one's NAT state.
    pub async fn release(&self, slot: Slot) {
        let ns = ns_name(slot.0);
        let _ = sh(&format!("ip netns exec {ns} conntrack -F 2>/dev/null || true")).await;
        self.free.lock().await.push_back(slot.0);
    }
}

impl NetPool {
    /// Tear a slot down entirely (CLI builds; the server recycles instead).
    pub async fn destroy(&self, slot: Slot) {
        let _ = sh(&format!("ip netns del {}; ip link del wrv{} 2>/dev/null || true", ns_name(slot.0), slot.0)).await;
    }
}
