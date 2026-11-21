//! Host <-> guest wire protocol, spoken over virtio-vsock.
//!
//! Every connection carries exactly one request. A frame is
//! `[u32 little-endian length of (kind + payload)][u8 kind][payload]`.
//! The first frame on a connection is always `REQ` (a JSON [`Request`]).
//! Bulk bytes (stdout, file contents) travel as raw binary frames, never JSON.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::{self, Read, Write};

pub const AGENT_PORT: u32 = 1024;
pub const MAX_FRAME: usize = 4 << 20;
pub const CHUNK: usize = 256 << 10;

pub mod kind {
    pub const REQ: u8 = 1;
    pub const STDOUT: u8 = 2;
    pub const STDERR: u8 = 3;
    pub const STDIN: u8 = 4;
    pub const STDIN_EOF: u8 = 5;
    pub const EXIT: u8 = 6;
    pub const DATA: u8 = 7;
    pub const END: u8 = 8;
    pub const ERROR: u8 = 9;
    pub const OK: u8 = 10;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Request {
    /// Liveness check. After a snapshot restore the host also uses it to set the
    /// guest clock and to inject fresh entropy, so that sandboxes restored from
    /// the same snapshot never share RNG state.
    Ping {
        #[serde(default)]
        unix_time_ns: Option<u64>,
        #[serde(default)]
        entropy: Option<Vec<u8>>,
    },
    Exec(ExecRequest),
    ReadFile { path: String },
    /// Followed by DATA frames and a final END frame.
    WriteFile {
        path: String,
        #[serde(default = "default_mode")]
        mode: u32,
    },
    /// Flush guest filesystems to the block device (before snapshot or fork).
    Sync,
    /// Open a TCP connection to 127.0.0.1:`port` inside the guest. After the
    /// agent answers OK the connection carries raw bytes both ways (no frames).
    Connect { port: u16 },
}

fn default_mode() -> u32 {
    0o644
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExecRequest {
    pub argv: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    /// If true the host will send STDIN frames followed by STDIN_EOF.
    #[serde(default)]
    pub stdin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExitStatus {
    pub code: Option<i32>,
    pub signal: Option<i32>,
    pub timed_out: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PingReply {
    pub agent_version: String,
    pub uptime_ms: u64,
}

pub fn write_frame<W: Write>(w: &mut W, kind: u8, payload: &[u8]) -> io::Result<()> {
    let len = (payload.len() + 1) as u32;
    let mut hdr = [0u8; 5];
    hdr[..4].copy_from_slice(&len.to_le_bytes());
    hdr[4] = kind;
    // One write for small frames keeps vsock packet count (and latency) down.
    if payload.len() <= 4096 {
        let mut buf = Vec::with_capacity(5 + payload.len());
        buf.extend_from_slice(&hdr);
        buf.extend_from_slice(payload);
        w.write_all(&buf)?;
    } else {
        w.write_all(&hdr)?;
        w.write_all(payload)?;
    }
    w.flush()
}

pub fn write_json<W: Write, T: Serialize>(w: &mut W, kind: u8, v: &T) -> io::Result<()> {
    let body = serde_json::to_vec(v).map_err(io::Error::other)?;
    write_frame(w, kind, &body)
}

/// Returns `None` on clean EOF at a frame boundary.
pub fn read_frame<R: Read>(r: &mut R) -> io::Result<Option<(u8, Vec<u8>)>> {
    let mut len = [0u8; 4];
    match r.read_exact(&mut len) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_le_bytes(len) as usize;
    if len == 0 || len > MAX_FRAME + 1 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "bad frame length"));
    }
    let mut kind = [0u8; 1];
    r.read_exact(&mut kind)?;
    let mut buf = vec![0u8; len - 1];
    r.read_exact(&mut buf)?;
    Ok(Some((kind[0], buf)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let mut buf = Vec::new();
        let req = Request::Exec(ExecRequest { argv: vec!["echo".into(), "hi".into()], ..Default::default() });
        write_json(&mut buf, kind::REQ, &req).unwrap();
        write_frame(&mut buf, kind::STDOUT, &vec![7u8; 10_000]).unwrap();
        let mut r = &buf[..];
        let (k, body) = read_frame(&mut r).unwrap().unwrap();
        assert_eq!(k, kind::REQ);
        let back: Request = serde_json::from_slice(&body).unwrap();
        assert!(matches!(back, Request::Exec(e) if e.argv == ["echo", "hi"]));
        let (k, body) = read_frame(&mut r).unwrap().unwrap();
        assert_eq!((k, body.len()), (kind::STDOUT, 10_000));
        assert!(read_frame(&mut r).unwrap().is_none());
    }
}
