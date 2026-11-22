//! Firecracker process management and a minimal HTTP/1.1 client for its API socket.
//!
//! Every VM runs with its working directory set to its own sandbox directory and
//! all paths it records (drives, vsock socket) are relative. That is what lets
//! one snapshot be restored into many sandboxes at once: each restore resolves
//! `rootfs.ext4` and `v.sock` inside its own directory.

use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;
use tokio::process::{Child, Command};

pub const API_SOCK: &str = "api.sock";
pub const VSOCK_SOCK: &str = "v.sock";
pub const ROOTFS: &str = "rootfs.ext4";

pub struct Vm {
    pub dir: PathBuf,
    pub child: Child,
}

impl Vm {
    /// Start a Firecracker process in `dir` and wait for its API socket.
    /// `netns`: path of the network namespace to run in (`/var/run/netns/...`).
    pub async fn spawn(firecracker: &Path, dir: &Path, netns: Option<&str>) -> Result<Vm> {
        let _ = std::fs::remove_file(dir.join(API_SOCK));
        let _ = std::fs::remove_file(dir.join(VSOCK_SOCK));
        let console = std::fs::File::create(dir.join("console.log"))?;
        let mut cmd = Command::new(firecracker);
        if let Some(ns) = netns {
            use std::os::fd::AsRawFd;
            let nsf = std::fs::File::open(ns).with_context(|| format!("open netns {ns}"))?;
            // Enter the slot's netns between fork and exec: no `ip netns exec` hop.
            unsafe {
                cmd.pre_exec(move || {
                    if libc::setns(nsf.as_raw_fd(), libc::CLONE_NEWNET) != 0 {
                        return Err(std::io::Error::last_os_error());
                    }
                    Ok(())
                });
            }
        }
        let child = cmd
            .args(["--api-sock", API_SOCK, "--level", "Warning"])
            .current_dir(dir)
            .stdin(Stdio::null())
            .stdout(console.try_clone()?)
            .stderr(console)
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("spawn {}", firecracker.display()))?;
        let vm = Vm { dir: dir.to_path_buf(), child };
        let sock = dir.join(API_SOCK);
        let deadline = Instant::now() + Duration::from_secs(5);
        while UnixStream::connect(&sock).await.is_err() {
            if Instant::now() > deadline {
                bail!("firecracker API socket never came up; console: {}", vm.console_tail());
            }
            tokio::time::sleep(Duration::from_micros(500)).await;
        }
        Ok(vm)
    }

    pub async fn api(&self, method: &str, path: &str, body: Value) -> Result<()> {
        api_call(&self.dir.join(API_SOCK), method, path, &body)
            .await
            .with_context(|| format!("{method} {path}; console: {}", self.console_tail()))
    }

    /// Last ~1500 chars of the VMM's console/log, minus known-benign noise
    /// (vCPU resume notices, unhandled legacy port I/O), so real errors survive.
    pub fn console_tail(&self) -> String {
        let s = std::fs::read_to_string(self.dir.join("console.log")).unwrap_or_default();
        let kept: Vec<&str> = s
            .lines()
            .filter(|l| !l.contains("immediate_exit") && !l.contains("IO read @") && !l.contains("IO write @") && !l.trim().is_empty())
            .collect();
        let joined = kept.join("\n");
        joined.chars().rev().take(1500).collect::<String>().chars().rev().collect()
    }

    pub async fn kill(mut self) {
        let _ = self.child.start_kill();
        let _ = self.child.wait().await;
    }

    /// Cold boot (template builds only; sandboxes are always restored).
    pub async fn boot(&self, kernel: &Path, vcpus: u32, mem_mib: u32) -> Result<()> {
        let args = format!(
            "console=ttyS0 reboot=k panic=1 pci=off quiet loglevel=1 root=/dev/vda rw rootfstype=ext4 init=/.jasmine/agent {}",
            crate::net::KERNEL_IP_ARG
        );
        self.api("PUT", "/boot-source", json!({"kernel_image_path": kernel, "boot_args": args})).await?;
        self.api("PUT", "/drives/rootfs", json!({"drive_id": "rootfs", "path_on_host": ROOTFS, "is_root_device": true, "is_read_only": false})).await?;
        self.api("PUT", "/machine-config", json!({"vcpu_count": vcpus, "mem_size_mib": mem_mib})).await?;
        self.api("PUT", "/vsock", json!({"guest_cid": 3, "uds_path": VSOCK_SOCK})).await?;
        self.api(
            "PUT",
            "/network-interfaces/eth0",
            json!({"iface_id": "eth0", "host_dev_name": crate::net::TAP, "guest_mac": crate::net::GUEST_MAC}),
        )
        .await?;
        self.api("PUT", "/actions", json!({"action_type": "InstanceStart"})).await
    }

    pub async fn pause(&self) -> Result<()> {
        self.api("PATCH", "/vm", json!({"state": "Paused"})).await
    }

    /// Write only the pages dirtied since the last restore/snapshot, as a sparse file.
    pub async fn snapshot_diff(&self, vmstate: &Path, mem: &Path) -> Result<()> {
        self.api("PUT", "/snapshot/create", json!({"snapshot_type": "Diff", "snapshot_path": vmstate, "mem_file_path": mem})).await
    }

    pub async fn resume(&self) -> Result<()> {
        self.api("PATCH", "/vm", json!({"state": "Resumed"})).await
    }

    pub async fn snapshot(&self, vmstate: &Path, mem: &Path) -> Result<()> {
        self.api("PUT", "/snapshot/create", json!({"snapshot_type": "Full", "snapshot_path": vmstate, "mem_file_path": mem})).await
    }

    /// Restore a snapshot. The memory file is mapped privately (copy-on-write),
    /// so pages load lazily and clean pages are shared through the page cache.
    pub async fn restore(&self, vmstate: &Path, mem: &Path) -> Result<()> {
        self.api(
            "PUT",
            "/snapshot/load",
            // (Block devices use the stable Sync engine: the Async/io_uring engine is a
            // Firecracker dev preview and made VMMs exit under 25-way bursts.)
            // Dirty-page tracking makes later snapshots/pauses write only what changed.
            json!({"snapshot_path": vmstate, "mem_backend": {"backend_type": "File", "backend_path": mem}, "track_dirty_pages": true, "resume_vm": true}),
        )
        .await
    }
}

async fn api_call(sock: &Path, method: &str, path: &str, body: &Value) -> Result<()> {
    let body = serde_json::to_vec(body)?;
    let mut s = UnixStream::connect(sock).await?;
    let head = format!(
        "{method} {path} HTTP/1.1\r\nHost: localhost\r\nAccept: application/json\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        body.len()
    );
    let mut req = head.into_bytes();
    req.extend_from_slice(&body);
    s.write_all(&req).await?;

    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 4096];
    let (header_end, content_len) = loop {
        let n = s.read(&mut chunk).await?;
        if n == 0 {
            bail!("firecracker closed the API connection");
        }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            let head = std::str::from_utf8(&buf[..i])?;
            let len = head
                .lines()
                .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap_or(0)))
                .unwrap_or(0);
            break (i + 4, len);
        }
    };
    while buf.len() < header_end + content_len {
        let n = s.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let status_line = std::str::from_utf8(&buf[..buf.iter().position(|&b| b == b'\r').unwrap_or(0)])?;
    let code: u16 = status_line.split_whitespace().nth(1).and_then(|c| c.parse().ok()).ok_or_else(|| anyhow!("bad status line"))?;
    if !(200..300).contains(&code) {
        let body = String::from_utf8_lossy(&buf[header_end..]);
        bail!("firecracker API returned {code}: {body}");
    }
    Ok(())
}

/// Copy-on-write clone (FICLONE) with a plain-copy fallback for filesystems
/// without reflink support. Returns true if the clone was a reflink.
pub fn clone_file(src: &Path, dst: &Path) -> Result<bool> {
    use std::os::fd::AsRawFd;
    const FICLONE: libc::c_ulong = 0x4004_9409;
    let s = std::fs::File::open(src).with_context(|| format!("open {}", src.display()))?;
    let d = std::fs::File::create(dst).with_context(|| format!("create {}", dst.display()))?;
    if unsafe { libc::ioctl(d.as_raw_fd(), FICLONE as _, s.as_raw_fd()) } == 0 {
        return Ok(true);
    }
    drop(d);
    std::fs::copy(src, dst)?;
    Ok(false)
}

/// Copy every data extent of the sparse file `diff` into `dst` at the same
/// offsets (holes are skipped). Returns bytes copied.
pub fn merge_sparse(diff: &Path, dst: &Path) -> Result<u64> {
    use std::os::fd::AsRawFd;
    let src = std::fs::File::open(diff)?;
    let out = std::fs::OpenOptions::new().write(true).open(dst)?;
    let len = src.metadata()?.len() as i64;
    let (sfd, dfd) = (src.as_raw_fd(), out.as_raw_fd());
    let mut pos: i64 = 0;
    let mut copied = 0u64;
    while pos < len {
        let data = unsafe { libc::lseek(sfd, pos, libc::SEEK_DATA) };
        if data < 0 {
            break; // ENXIO: no more data
        }
        let hole = unsafe { libc::lseek(sfd, data, libc::SEEK_HOLE) }.min(len);
        let (mut off_in, mut off_out) = (data, data);
        let mut remaining = (hole - data) as usize;
        while remaining > 0 {
            let n = unsafe { libc::copy_file_range(sfd, &mut off_in, dfd, &mut off_out, remaining, 0) };
            if n <= 0 {
                anyhow::bail!("copy_file_range: {}", std::io::Error::last_os_error());
            }
            remaining -= n as usize;
            copied += n as u64;
        }
        pos = hole;
    }
    Ok(copied)
}
