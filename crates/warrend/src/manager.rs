use crate::agent::AgentClient;
use crate::fc::{clone_file, Vm, ROOTFS};
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

pub struct Config {
    pub data: PathBuf,
    pub firecracker: PathBuf,
    pub kernel: PathBuf,
    pub agent_bin: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateMeta {
    pub name: String,
    pub image: String,
    pub vcpus: u32,
    pub mem_mib: u32,
    #[serde(default)]
    pub prewarm_mib: u32,
    pub rootfs_bytes: u64,
    pub boot_ms: u64,
    pub built_unix: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateTimings {
    pub clone_disk_ms: f64,
    pub reflink: bool,
    pub spawn_vmm_ms: f64,
    pub restore_ms: f64,
    pub agent_ready_ms: f64,
    pub total_ms: f64,
}

pub struct Sandbox {
    pub id: String,
    pub template: String,
    pub created_unix: u64,
    pub agent: AgentClient,
    vm: Mutex<Option<Vm>>,
    dir: PathBuf,
}

#[derive(Serialize)]
pub struct SandboxInfo {
    pub id: String,
    pub template: String,
    pub created_unix: u64,
}

impl Sandbox {
    pub fn info(&self) -> SandboxInfo {
        SandboxInfo { id: self.id.clone(), template: self.template.clone(), created_unix: self.created_unix }
    }
}

pub struct Manager {
    pub cfg: Config,
    sandboxes: Mutex<HashMap<String, Arc<Sandbox>>>,
}

fn ms(d: Duration) -> f64 {
    (d.as_secs_f64() * 1e6).round() / 1e3
}

fn now_ns() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64
}

pub fn random_bytes(n: usize) -> Vec<u8> {
    let mut b = vec![0u8; n];
    std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut b)).expect("read /dev/urandom");
    b
}

fn valid_name(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

async fn run(cmd: &str) -> Result<()> {
    let out = tokio::process::Command::new("sh").arg("-c").arg(cmd).output().await?;
    if !out.status.success() {
        bail!("`{cmd}` failed: {}", String::from_utf8_lossy(&out.stderr));
    }
    Ok(())
}

fn shell_quote(p: &Path) -> String {
    format!("'{}'", p.display().to_string().replace('\'', r"'\''"))
}

impl Manager {
    /// `owns_sandboxes`: true for the server, which clears sandboxes left by a
    /// previous run (they do not survive restarts). False for one-shot CLI use.
    pub fn new(cfg: Config, owns_sandboxes: bool) -> Result<Arc<Self>> {
        std::fs::create_dir_all(cfg.data.join("templates"))?;
        let sbx = cfg.data.join("sandboxes");
        if owns_sandboxes {
            let _ = std::fs::remove_dir_all(&sbx);
        }
        std::fs::create_dir_all(&sbx)?;
        Ok(Arc::new(Manager { cfg, sandboxes: Mutex::new(HashMap::new()) }))
    }

    fn template_dir(&self, name: &str) -> PathBuf {
        self.cfg.data.join("templates").join(name)
    }

    pub fn templates(&self) -> Vec<TemplateMeta> {
        let mut out = Vec::new();
        if let Ok(rd) = std::fs::read_dir(self.cfg.data.join("templates")) {
            for e in rd.flatten() {
                if let Ok(s) = std::fs::read(e.path().join("meta.json")) {
                    if let Ok(m) = serde_json::from_slice(&s) {
                        out.push(m);
                    }
                }
            }
        }
        out.sort_by(|a: &TemplateMeta, b| a.name.cmp(&b.name));
        out
    }

    /// OCI image → ext4 rootfs → cold boot → snapshot. Requires root and `crane`.
    pub async fn build_template(&self, name: &str, image: &str, vcpus: u32, mem_mib: u32, prewarm_mib: u32) -> Result<TemplateMeta> {
        if !valid_name(name) {
            bail!("invalid template name");
        }
        let dir = self.template_dir(name);
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir)?;
        let tree = dir.join("rootfs.d");
        std::fs::create_dir_all(&tree)?;
        let image_q = format!("'{}'", image.replace('\'', ""));
        run(&format!("crane export --platform linux/{} {image_q} - | tar -x -C {}", go_arch(), shell_quote(&tree)))
            .await
            .context("export image")?;
        std::fs::create_dir_all(tree.join(".warren"))?;
        std::fs::copy(&self.cfg.agent_bin, tree.join(".warren/agent")).context("install agent")?;
        std::fs::create_dir_all(tree.join("root"))?;
        std::fs::create_dir_all(tree.join("etc"))?;
        let _ = std::fs::remove_file(tree.join("etc/resolv.conf"));
        std::fs::write(tree.join("etc/resolv.conf"), "nameserver 1.1.1.1\nnameserver 8.8.8.8\n")?;
        std::fs::write(tree.join("etc/hostname"), "warren\n")?;

        let used: u64 = {
            let out = tokio::process::Command::new("du").args(["-sb"]).arg(&tree).output().await?;
            String::from_utf8_lossy(&out.stdout).split_whitespace().next().unwrap_or("0").parse().unwrap_or(0)
        };
        // Sparse file: unused space costs nothing on disk, and reflink clones share the rest.
        let size_mib = ((used as f64 * 1.2) as u64 / (1 << 20) + 2048).max(4096);
        let rootfs = dir.join(ROOTFS);
        run(&format!(
            "truncate -s {size_mib}M {r} && mkfs.ext4 -q -F -L warren -E root_owner=0:0 -d {t} {r}",
            r = shell_quote(&rootfs),
            t = shell_quote(&tree)
        ))
        .await
        .context("mkfs.ext4")?;
        std::fs::remove_dir_all(&tree)?;

        let t0 = Instant::now();
        let vm = Vm::spawn(&self.cfg.firecracker, &dir).await?;
        let res: Result<u64> = async {
            vm.boot(&self.cfg.kernel, vcpus, mem_mib).await?;
            let agent = AgentClient::new(&dir);
            agent.wait_ready(Duration::from_secs(30)).await.with_context(|| format!("console: {}", vm.console_tail()))?;
            let boot_ms = t0.elapsed().as_millis() as u64;
            if prewarm_mib > 0 {
                let out = agent
                    .exec(
                        warren_proto::ExecRequest {
                            argv: vec!["/bin/sh".into(), "-c".into(), PREWARM.into(), "prewarm".into(), prewarm_mib.to_string()],
                            timeout_ms: Some(60_000),
                            ..Default::default()
                        },
                        None,
                    )
                    .await?;
                tracing::info!(template = name, "prewarm: {}", out.stdout.trim());
            }
            agent.sync().await?;
            vm.pause().await?;
            vm.snapshot(&dir.join("vm.snap"), &dir.join("mem.snap")).await?;
            Ok(boot_ms)
        }
        .await;
        vm.kill().await;
        let boot_ms = res?;
        let meta = TemplateMeta {
            name: name.into(),
            image: image.into(),
            vcpus,
            mem_mib,
            prewarm_mib,
            rootfs_bytes: used,
            boot_ms,
            built_unix: now_ns() / 1_000_000_000,
        };
        std::fs::write(dir.join("meta.json"), serde_json::to_vec_pretty(&meta)?)?;
        Ok(meta)
    }

    pub async fn create(&self, template: &str) -> Result<(Arc<Sandbox>, CreateTimings)> {
        if !valid_name(template) {
            bail!("invalid template name");
        }
        let tdir = self.template_dir(template);
        if !tdir.join("meta.json").exists() {
            bail!("template {template:?} not found");
        }
        let id = format!("sbx_{}", random_bytes(8).iter().map(|b| format!("{b:02x}")).collect::<String>());
        let dir = self.cfg.data.join("sandboxes").join(&id);
        std::fs::create_dir_all(&dir)?;

        let t0 = Instant::now();
        let result: Result<(Vm, CreateTimings)> = async {
            let reflink = clone_file(&tdir.join(ROOTFS), &dir.join(ROOTFS))?;
            let t1 = Instant::now();
            let vm = Vm::spawn(&self.cfg.firecracker, &dir).await?;
            let t2 = Instant::now();
            if let Err(e) = vm.restore(&tdir.join("vm.snap"), &tdir.join("mem.snap")).await {
                vm.kill().await;
                return Err(e);
            }
            let t3 = Instant::now();
            // Fresh clock and entropy: every restore of a snapshot must diverge.
            if let Err(e) = AgentClient::new(&dir).ping(Some(now_ns()), Some(random_bytes(64))).await {
                vm.kill().await;
                return Err(e);
            }
            let t4 = Instant::now();
            Ok((
                vm,
                CreateTimings {
                    clone_disk_ms: ms(t1 - t0),
                    reflink,
                    spawn_vmm_ms: ms(t2 - t1),
                    restore_ms: ms(t3 - t2),
                    agent_ready_ms: ms(t4 - t3),
                    total_ms: ms(t4 - t0),
                },
            ))
        }
        .await;
        let (vm, timings) = match result {
            Ok(v) => v,
            Err(e) => {
                let _ = std::fs::remove_dir_all(&dir);
                return Err(e);
            }
        };
        let sbx = Arc::new(Sandbox {
            id: id.clone(),
            template: template.into(),
            created_unix: now_ns() / 1_000_000_000,
            agent: AgentClient::new(&dir),
            vm: Mutex::new(Some(vm)),
            dir,
        });
        self.sandboxes.lock().await.insert(id, sbx.clone());
        Ok((sbx, timings))
    }

    pub async fn get(&self, id: &str) -> Option<Arc<Sandbox>> {
        self.sandboxes.lock().await.get(id).cloned()
    }

    pub async fn list(&self) -> Vec<SandboxInfo> {
        self.sandboxes.lock().await.values().map(|s| s.info()).collect()
    }

    pub async fn delete(&self, id: &str) -> bool {
        let Some(sbx) = self.sandboxes.lock().await.remove(id) else { return false };
        if let Some(vm) = sbx.vm.lock().await.take() {
            vm.kill().await;
        }
        let _ = tokio::fs::remove_dir_all(&sbx.dir).await;
        true
    }

    pub async fn shutdown(&self) {
        let ids: Vec<String> = self.sandboxes.lock().await.keys().cloned().collect();
        for id in ids {
            self.delete(&id).await;
        }
    }
}

/// Pull the image's executables, shared libraries and language runtimes into the
/// guest page cache before snapshotting, up to `$1` MiB. Not tailored to any
/// benchmark command: it is whatever the image ships in standard paths,
/// binaries and libraries first. The pages live in the snapshot memory file,
/// which all sandboxes share read-only through the host page cache.
const PREWARM: &str = r#"
budget=$(( $1 * 1024 * 1024 )); used=0; n=0
list() {
  for d in /lib /lib64 /usr/lib /usr/lib64 /usr/libexec /bin /sbin /usr/bin /usr/sbin /usr/local/bin /usr/local/lib; do
    [ -d "$d" ] && find "$d" -xdev -type f -size -64M "$@" 2>/dev/null
  done
}
{ list \( -perm -u+x -o -name '*.so' -o -name '*.so.*' \); list -name '*.pyc'; list -name '*.js' -path '*node_modules*'; } |
while IFS= read -r f; do
  s=$(stat -c %s "$f" 2>/dev/null || echo 0)
  [ $((used + s)) -gt "$budget" ] && continue
  cat "$f" > /dev/null 2>&1 && used=$((used + s)) && n=$((n + 1))
  echo "$n $used" > /run/prewarm.stat
done
for py in python3 python; do command -v $py >/dev/null && $py -c 'import os, sys, json, re, subprocess, pathlib, typing, asyncio' && break; done
command -v node >/dev/null && node -e '0'
sh -c true
read n used < /run/prewarm.stat 2>/dev/null; echo "files=$n bytes=$used"
"#;

fn go_arch() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "amd64"
    }
}
