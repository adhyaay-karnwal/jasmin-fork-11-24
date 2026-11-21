//! Host-side client for the guest agent, reached through Firecracker's
//! vsock-over-unix-socket bridge (`CONNECT <port>\n` → `OK <port>\n`).

use anyhow::{anyhow, bail, Context, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use warren_proto::{kind, ExecRequest, ExitStatus, PingReply, Request, AGENT_PORT, CHUNK, MAX_FRAME};

#[derive(Clone)]
pub struct AgentClient {
    sock: PathBuf,
}

type Conn = BufReader<UnixStream>;

#[derive(Debug, Serialize)]
pub struct ExecOutput {
    pub exit_code: Option<i32>,
    pub signal: Option<i32>,
    pub timed_out: bool,
    pub stdout: String,
    pub stderr: String,
    pub truncated: bool,
}

const MAX_OUTPUT: usize = 64 << 20;

impl AgentClient {
    pub fn new(vm_dir: &Path) -> Self {
        AgentClient { sock: vm_dir.join(crate::fc::VSOCK_SOCK) }
    }

    async fn connect(&self) -> Result<Conn> {
        let mut s = UnixStream::connect(&self.sock).await.context("connect vsock bridge")?;
        s.write_all(format!("CONNECT {AGENT_PORT}\n").as_bytes()).await?;
        let mut r = BufReader::new(s);
        let mut line = String::new();
        r.read_line(&mut line).await?;
        if !line.starts_with("OK ") {
            bail!("vsock handshake failed: {line:?}");
        }
        Ok(r)
    }

    async fn request(&self, req: &Request) -> Result<Conn> {
        let mut c = self.connect().await?;
        write_frame(&mut c, kind::REQ, &serde_json::to_vec(req)?).await?;
        Ok(c)
    }

    pub async fn ping(&self, unix_time_ns: Option<u64>, entropy: Option<Vec<u8>>) -> Result<PingReply> {
        let mut c = self.request(&Request::Ping { unix_time_ns, entropy }).await?;
        let body = expect(&mut c, kind::OK).await?;
        Ok(serde_json::from_slice(&body)?)
    }

    /// Retry ping until the agent answers (used right after a cold boot).
    pub async fn wait_ready(&self, timeout: Duration) -> Result<PingReply> {
        let deadline = Instant::now() + timeout;
        loop {
            match tokio::time::timeout(Duration::from_millis(500), self.ping(None, None)).await {
                Ok(Ok(p)) => return Ok(p),
                _ if Instant::now() > deadline => bail!("agent did not become ready within {timeout:?}"),
                _ => tokio::time::sleep(Duration::from_millis(5)).await,
            }
        }
    }

    pub async fn sync(&self) -> Result<()> {
        let mut c = self.request(&Request::Sync).await?;
        expect(&mut c, kind::OK).await.map(|_| ())
    }

    pub async fn exec(&self, req: ExecRequest, stdin: Option<Vec<u8>>) -> Result<ExecOutput> {
        let has_stdin = stdin.is_some();
        let mut c = self.request(&Request::Exec(ExecRequest { stdin: has_stdin, ..req })).await?;
        if let Some(data) = stdin {
            for chunk in data.chunks(CHUNK) {
                write_frame(&mut c, kind::STDIN, chunk).await?;
            }
            write_frame(&mut c, kind::STDIN_EOF, &[]).await?;
        }
        let (mut out, mut err, mut truncated) = (Vec::new(), Vec::new(), false);
        // Keep the connection open until EXIT: the agent kills the process tree
        // if the host hangs up early.
        loop {
            let (k, data) = read_frame(&mut c).await?.ok_or_else(|| anyhow!("agent closed connection mid-exec"))?;
            match k {
                kind::STDOUT | kind::STDERR => {
                    let buf = if k == kind::STDOUT { &mut out } else { &mut err };
                    if buf.len() + data.len() > MAX_OUTPUT {
                        truncated = true;
                    } else {
                        buf.extend_from_slice(&data);
                    }
                }
                kind::EXIT => {
                    let st: ExitStatus = serde_json::from_slice(&data)?;
                    return Ok(ExecOutput {
                        exit_code: st.code,
                        signal: st.signal,
                        timed_out: st.timed_out,
                        stdout: String::from_utf8_lossy(&out).into_owned(),
                        stderr: String::from_utf8_lossy(&err).into_owned(),
                        truncated,
                    });
                }
                kind::ERROR => bail!("{}", String::from_utf8_lossy(&data)),
                _ => bail!("unexpected frame kind {k}"),
            }
        }
    }

    pub async fn read_file(&self, path: &str) -> Result<Vec<u8>> {
        let mut c = self.request(&Request::ReadFile { path: path.into() }).await?;
        let mut out = Vec::new();
        loop {
            match read_frame(&mut c).await?.ok_or_else(|| anyhow!("agent closed connection"))? {
                (kind::DATA, d) => out.extend_from_slice(&d),
                (kind::END, _) => return Ok(out),
                (kind::ERROR, e) => bail!("{}", String::from_utf8_lossy(&e)),
                (k, _) => bail!("unexpected frame kind {k}"),
            }
        }
    }

    pub async fn write_file(&self, path: &str, mode: u32, data: &[u8]) -> Result<()> {
        let mut c = self.request(&Request::WriteFile { path: path.into(), mode }).await?;
        for chunk in data.chunks(CHUNK) {
            write_frame(&mut c, kind::DATA, chunk).await?;
        }
        write_frame(&mut c, kind::END, &[]).await?;
        expect(&mut c, kind::OK).await.map(|_| ())
    }
}

async fn expect(c: &mut Conn, want: u8) -> Result<Vec<u8>> {
    match read_frame(c).await?.ok_or_else(|| anyhow!("agent closed connection"))? {
        (k, d) if k == want => Ok(d),
        (kind::ERROR, e) => bail!("{}", String::from_utf8_lossy(&e)),
        (k, _) => bail!("unexpected frame kind {k}"),
    }
}

async fn write_frame(c: &mut Conn, k: u8, payload: &[u8]) -> Result<()> {
    let mut buf = Vec::with_capacity(5 + payload.len());
    buf.extend_from_slice(&((payload.len() + 1) as u32).to_le_bytes());
    buf.push(k);
    buf.extend_from_slice(payload);
    c.get_mut().write_all(&buf).await?;
    Ok(())
}

async fn read_frame(c: &mut Conn) -> Result<Option<(u8, Vec<u8>)>> {
    let mut len = [0u8; 4];
    match c.read_exact(&mut len).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.into()),
    }
    let len = u32::from_le_bytes(len) as usize;
    if len == 0 || len > MAX_FRAME + 1 {
        bail!("bad frame length {len}");
    }
    let mut buf = vec![0u8; len];
    c.read_exact(&mut buf).await?;
    let k = buf[0];
    Ok(Some((k, buf.split_off(1))))
}
