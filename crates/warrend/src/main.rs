mod agent;
mod api;
mod fc;
mod manager;

use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "warrend", version, about = "Warren sandbox daemon")]
struct Cli {
    /// State directory. Put it on XFS (reflink=1) so sandbox disks are copy-on-write clones.
    #[arg(long, env = "WARREN_DATA", default_value = "/var/lib/warren", global = true)]
    data: PathBuf,
    #[arg(long, env = "WARREN_FIRECRACKER", default_value = "/usr/local/bin/firecracker", global = true)]
    firecracker: PathBuf,
    #[arg(long, env = "WARREN_KERNEL", default_value = "/var/lib/warren/vmlinux", global = true)]
    kernel: PathBuf,
    /// Static guest agent binary copied into every template.
    #[arg(long, env = "WARREN_AGENT", default_value = "/usr/local/lib/warren/warren-agent", global = true)]
    agent: PathBuf,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Run the HTTP API.
    Serve {
        #[arg(long, env = "WARREN_LISTEN", default_value = "127.0.0.1:7171")]
        listen: String,
        /// Require `Authorization: Bearer <key>` on /v1.
        #[arg(long, env = "WARREN_API_KEY")]
        api_key: Option<String>,
    },
    /// Build a template (OCI image → snapshot) without running the server.
    Build {
        name: String,
        image: String,
        #[arg(long, default_value_t = 2)]
        vcpus: u32,
        #[arg(long, default_value_t = 1024)]
        mem_mib: u32,
        /// Page-cache prewarm budget before snapshotting (0 = off).
        #[arg(long, default_value_t = 256)]
        prewarm_mib: u32,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into())).init();
    let cli = Cli::parse();
    let cfg = manager::Config { data: cli.data, firecracker: cli.firecracker, kernel: cli.kernel, agent_bin: cli.agent };
    let mgr = manager::Manager::new(cfg, matches!(cli.cmd, Cmd::Serve { .. }))?;
    match cli.cmd {
        Cmd::Build { name, image, vcpus, mem_mib, prewarm_mib } => {
            let meta = mgr.build_template(&name, &image, vcpus, mem_mib, prewarm_mib).await?;
            println!("{}", serde_json::to_string_pretty(&meta)?);
        }
        Cmd::Serve { listen, api_key } => {
            let app = api::router(mgr.clone(), api_key);
            let listener = tokio::net::TcpListener::bind(&listen).await?;
            tracing::info!("warrend listening on {listen}");
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = tokio::signal::ctrl_c().await;
                })
                .await?;
            mgr.shutdown().await;
        }
    }
    Ok(())
}
