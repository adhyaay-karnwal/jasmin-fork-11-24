use std::ffi::CString;
use std::io;

fn mount(src: &str, target: &str, fstype: &str, flags: libc::c_ulong, data: Option<&str>) {
    let _ = std::fs::create_dir_all(target);
    let (s, t, f) = (CString::new(src).unwrap(), CString::new(target).unwrap(), CString::new(fstype).unwrap());
    let d = data.map(|d| CString::new(d).unwrap());
    let rc = unsafe {
        libc::mount(s.as_ptr(), t.as_ptr(), f.as_ptr(), flags, d.as_ref().map_or(std::ptr::null(), |d| d.as_ptr().cast()))
    };
    if rc != 0 {
        let e = io::Error::last_os_error();
        // EBUSY = already mounted (e.g. devtmpfs automount); harmless.
        if e.raw_os_error() != Some(libc::EBUSY) {
            eprintln!("warren-agent: mount {target}: {e}");
        }
    }
}

pub fn init_system() {
    let nodev = libc::MS_NOSUID | libc::MS_NODEV | libc::MS_NOEXEC;
    mount("proc", "/proc", "proc", nodev, None);
    mount("sysfs", "/sys", "sysfs", nodev, None);
    mount("devtmpfs", "/dev", "devtmpfs", libc::MS_NOSUID, Some("mode=0755"));
    mount("devpts", "/dev/pts", "devpts", libc::MS_NOSUID | libc::MS_NOEXEC, Some("gid=5,mode=620,ptmxmode=666"));
    mount("tmpfs", "/dev/shm", "tmpfs", libc::MS_NOSUID | libc::MS_NODEV, None);
    mount("tmpfs", "/run", "tmpfs", libc::MS_NOSUID | libc::MS_NODEV, Some("mode=0755"));
    mount("cgroup2", "/sys/fs/cgroup", "cgroup2", nodev, None);
    for (link, target) in [("/dev/fd", "/proc/self/fd"), ("/dev/stdin", "/proc/self/fd/0"), ("/dev/stdout", "/proc/self/fd/1"), ("/dev/stderr", "/proc/self/fd/2")] {
        let _ = std::os::unix::fs::symlink(target, link);
    }
    let _ = std::fs::remove_file("/dev/ptmx");
    let _ = std::os::unix::fs::symlink("pts/ptmx", "/dev/ptmx");
    let host = b"warren";
    unsafe { libc::sethostname(host.as_ptr().cast(), host.len()) };
    if let Err(e) = link_up("lo") {
        eprintln!("warren-agent: lo up: {e}");
    }
    unsafe { libc::setsid() };
}

/// Reap every child (we are PID 1, orphans land on us) until `server` exits.
pub fn reap_until(server: libc::pid_t) {
    loop {
        let mut status = 0;
        let pid = unsafe { libc::waitpid(-1, &mut status, 0) };
        if pid == server {
            return;
        }
        if pid < 0 && io::Error::last_os_error().raw_os_error() == Some(libc::ECHILD) {
            return;
        }
    }
}

fn link_up(name: &str) -> io::Result<()> {
    unsafe {
        let fd = libc::socket(libc::AF_INET, libc::SOCK_DGRAM | libc::SOCK_CLOEXEC, 0);
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        let mut req: libc::ifreq = std::mem::zeroed();
        for (i, b) in name.bytes().enumerate() {
            req.ifr_name[i] = b as libc::c_char;
        }
        let mut rc = libc::ioctl(fd, libc::SIOCGIFFLAGS as _, &mut req);
        if rc == 0 {
            req.ifr_ifru.ifru_flags |= libc::IFF_UP as libc::c_short;
            rc = libc::ioctl(fd, libc::SIOCSIFFLAGS as _, &mut req);
        }
        let err = io::Error::last_os_error();
        libc::close(fd);
        if rc != 0 {
            return Err(err);
        }
    }
    Ok(())
}

pub fn vsock_listen(port: u32) -> io::Result<libc::c_int> {
    unsafe {
        let fd = libc::socket(libc::AF_VSOCK, libc::SOCK_STREAM | libc::SOCK_CLOEXEC, 0);
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        let mut addr: libc::sockaddr_vm = std::mem::zeroed();
        addr.svm_family = libc::AF_VSOCK as libc::sa_family_t;
        addr.svm_port = port;
        addr.svm_cid = libc::VMADDR_CID_ANY;
        if libc::bind(fd, (&addr as *const libc::sockaddr_vm).cast(), std::mem::size_of::<libc::sockaddr_vm>() as u32) != 0
            || libc::listen(fd, 1024) != 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(fd)
    }
}

pub fn set_clock(unix_ns: u64) {
    let ts = libc::timespec { tv_sec: (unix_ns / 1_000_000_000) as _, tv_nsec: (unix_ns % 1_000_000_000) as _ };
    unsafe { libc::clock_settime(libc::CLOCK_REALTIME, &ts) };
}

/// Credit host-provided randomness to the guest RNG (RNDADDENTROPY).
/// Without this, every sandbox restored from one snapshot would start with
/// identical RNG state.
pub fn add_entropy(bytes: &[u8]) {
    const RNDADDENTROPY: libc::c_ulong = 0x4008_5203;
    let mut buf = Vec::with_capacity(8 + bytes.len());
    buf.extend_from_slice(&((bytes.len() * 8) as i32).to_ne_bytes());
    buf.extend_from_slice(&(bytes.len() as i32).to_ne_bytes());
    buf.extend_from_slice(bytes);
    unsafe {
        let fd = libc::open(c"/dev/urandom".as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC);
        if fd >= 0 {
            libc::ioctl(fd, RNDADDENTROPY as _, buf.as_ptr());
            libc::close(fd);
        }
    }
}
