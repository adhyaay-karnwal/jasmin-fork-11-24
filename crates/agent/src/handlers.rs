use crate::sys;
use std::io::{self, Read, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::net::UnixStream;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use jasmine_proto::{kind, read_frame, write_frame, write_json, ExecRequest, ExitStatus, PingReply, Request, CHUNK};

/// Shared write half. `closed` is set once the terminal frame is sent so that
/// stragglers (e.g. a backgrounded grandchild still holding stdout) never write
/// frames after EXIT.
struct Out {
    w: UnixStream,
    closed: bool,
}

pub fn handle(mut conn: UnixStream) -> io::Result<()> {
    let Some((k, body)) = read_frame(&mut conn)? else { return Ok(()) };
    if k != kind::REQ {
        return write_frame(&mut conn, kind::ERROR, b"expected request frame");
    }
    let req: Request = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => return write_frame(&mut conn, kind::ERROR, format!("bad request: {e}").as_bytes()),
    };
    match req {
        Request::Ping { unix_time_ns, entropy } => {
            if let Some(ns) = unix_time_ns {
                sys::set_clock(ns);
            }
            if let Some(e) = entropy {
                sys::add_entropy(&e);
            }
            #[allow(static_mut_refs)]
            let uptime_ms = unsafe { crate::BOOT.map(|b| b.elapsed().as_millis() as u64).unwrap_or(0) };
            write_json(&mut conn, kind::OK, &PingReply { agent_version: env!("CARGO_PKG_VERSION").into(), uptime_ms })
        }
        Request::Sync => {
            unsafe { libc::sync() };
            write_frame(&mut conn, kind::OK, b"{}")
        }
        Request::ReadFile { path } => read_file(conn, &path),
        Request::WriteFile { path, mode } => write_file(conn, &path, mode),
        Request::Exec(e) => exec(conn, e),
        Request::Connect { port } => connect(conn, port),
    }
}

fn read_file(mut conn: UnixStream, path: &str) -> io::Result<()> {
    let mut f = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) => return write_frame(&mut conn, kind::ERROR, format!("{path}: {e}").as_bytes()),
    };
    // Size the buffer to the file (capped at CHUNK): zeroing a 1 MiB buffer for a
    // 1 KiB read touches 256 fresh pages, which is expensive under nested virt.
    let len = f.metadata().map(|m| m.len() as usize).unwrap_or(CHUNK);
    let mut buf = vec![0u8; len.clamp(4096, CHUNK)];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            return write_frame(&mut conn, kind::END, b"");
        }
        write_frame(&mut conn, kind::DATA, &buf[..n])?;
    }
}

fn write_file(mut conn: UnixStream, path: &str, mode: u32) -> io::Result<()> {
    if let Some(parent) = std::path::Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut f = match std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(mode).open(path) {
        Ok(f) => f,
        Err(e) => return write_frame(&mut conn, kind::ERROR, format!("{path}: {e}").as_bytes()),
    };
    while let Some((k, data)) = read_frame(&mut conn)? {
        match k {
            kind::DATA => f.write_all(&data)?,
            kind::END => return write_frame(&mut conn, kind::OK, b"{}"),
            _ => return write_frame(&mut conn, kind::ERROR, b"unexpected frame"),
        }
    }
    Ok(())
}

fn exec(conn: UnixStream, req: ExecRequest) -> io::Result<()> {
    let out = Arc::new(Mutex::new(Out { w: conn.try_clone()?, closed: false }));
    let send = |out: &Arc<Mutex<Out>>, k: u8, data: &[u8]| -> bool {
        let mut o = out.lock().unwrap();
        !o.closed && write_frame(&mut o.w, k, data).is_ok()
    };

    if req.argv.is_empty() {
        send(&out, kind::ERROR, b"empty argv");
        return Ok(());
    }
    let mut cmd = Command::new(&req.argv[0]);
    cmd.args(&req.argv[1..])
        .env_clear()
        .env("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
        .env("HOME", "/root")
        .env("LANG", "C.UTF-8")
        .env("TERM", "xterm-256color")
        .envs(&req.env)
        .current_dir(req.cwd.as_deref().unwrap_or(if std::path::Path::new("/root").is_dir() { "/root" } else { "/" }))
        .stdin(if req.stdin { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // Own process group so timeouts / disconnects kill the whole tree.
        .process_group(0);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            send(&out, kind::ERROR, format!("spawn {}: {e}", req.argv[0]).as_bytes());
            return Ok(());
        }
    };
    let pgid = child.id() as i32;
    let done = Arc::new(AtomicBool::new(false));
    let timed_out = Arc::new(AtomicBool::new(false));
    let kill_tree = move || unsafe {
        libc::kill(-pgid, libc::SIGKILL);
    };

    // Output pumps. Each reports on `fin` when its pipe hits EOF.
    let (fin_tx, fin_rx) = mpsc::channel::<()>();
    for (pipe, k) in [
        (child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>), kind::STDOUT),
        (child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>), kind::STDERR),
    ] {
        let (out, fin) = (out.clone(), fin_tx.clone());
        let mut pipe = pipe.unwrap();
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 64 << 10];
            while let Ok(n) = pipe.read(&mut buf) {
                if n == 0 || !send(&out, k, &buf[..n]) {
                    break;
                }
            }
            let _ = fin.send(());
        });
    }
    drop(fin_tx);

    // Input pump: stdin frames, and kill the tree if the host goes away mid-run.
    {
        let mut stdin = child.stdin.take();
        let mut rd = conn;
        let done = done.clone();
        std::thread::spawn(move || {
            loop {
                match read_frame(&mut rd) {
                    Ok(Some((kind::STDIN, data))) => {
                        if let Some(s) = stdin.as_mut() {
                            let _ = s.write_all(&data);
                        }
                    }
                    Ok(Some((kind::STDIN_EOF, _))) => stdin = None,
                    Ok(Some(_)) => {}
                    Ok(None) | Err(_) => break,
                }
            }
            if !done.load(Ordering::SeqCst) {
                kill_tree();
            }
        });
    }

    if let Some(ms) = req.timeout_ms {
        let (done, timed_out) = (done.clone(), timed_out.clone());
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(ms));
            if !done.load(Ordering::SeqCst) {
                timed_out.store(true, Ordering::SeqCst);
                kill_tree();
            }
        });
    }

    let status = child.wait()?;
    done.store(true, Ordering::SeqCst);
    // Drain output, but don't hang forever on pipes inherited by background jobs.
    for _ in 0..2 {
        if fin_rx.recv_timeout(Duration::from_millis(200)).is_err() {
            break;
        }
    }
    let exit = ExitStatus { code: status.code(), signal: status.signal(), timed_out: timed_out.load(Ordering::SeqCst) };
    let mut o = out.lock().unwrap();
    o.closed = true;
    let body = serde_json::to_vec(&exit).unwrap();
    write_frame(&mut o.w, kind::EXIT, &body)
}

/// Splice a host connection to a TCP port inside the guest (preview URLs).
fn connect(mut conn: UnixStream, port: u16) -> io::Result<()> {
    let tcp = match std::net::TcpStream::connect(("127.0.0.1", port)).or_else(|_| std::net::TcpStream::connect(("::1", port))) {
        Ok(t) => t,
        Err(e) => return write_frame(&mut conn, kind::ERROR, format!("connect 127.0.0.1:{port}: {e}").as_bytes()),
    };
    let _ = tcp.set_nodelay(true);
    write_frame(&mut conn, kind::OK, b"{}")?;
    let (mut c2, mut t2) = (conn.try_clone()?, tcp.try_clone()?);
    let up = std::thread::spawn(move || {
        let _ = io::copy(&mut c2, &mut t2);
        let _ = t2.shutdown(std::net::Shutdown::Write);
    });
    let (mut t1, mut c1) = (tcp, conn);
    let _ = io::copy(&mut t1, &mut c1);
    let _ = c1.shutdown(std::net::Shutdown::Write);
    let _ = up.join();
    Ok(())
}
