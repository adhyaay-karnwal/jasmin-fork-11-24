use crate::manager::Manager;
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Path, Query, Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Instant;
use warren_proto::ExecRequest;

#[derive(Clone)]
struct AppState {
    mgr: Arc<Manager>,
    api_key: Option<String>,
}

struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}"))
    }
}

type ApiResult<T> = Result<T, ApiError>;

fn not_found() -> ApiError {
    ApiError(StatusCode::NOT_FOUND, "sandbox not found".into())
}

pub fn router(mgr: Arc<Manager>, api_key: Option<String>) -> Router {
    let state = AppState { mgr, api_key };
    Router::new()
        .route("/v1/templates", get(list_templates).post(build_template))
        .route("/v1/sandboxes", get(list_sandboxes).post(create_sandbox))
        .route("/v1/sandboxes/{id}", get(get_sandbox).delete(delete_sandbox))
        .route("/v1/sandboxes/{id}/exec", post(exec))
        .route("/v1/sandboxes/{id}/files", get(read_file).put(write_file))
        .layer(middleware::from_fn_with_state(state.clone(), auth))
        .route("/healthz", get(|| async { "ok" }))
        .layer(DefaultBodyLimit::max(1 << 30))
        .with_state(state)
}

async fn auth(State(st): State<AppState>, req: Request, next: Next) -> Response {
    if let Some(key) = &st.api_key {
        let ok = req
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .is_some_and(|t| constant_time_eq(t.as_bytes(), key.as_bytes()));
        if !ok {
            return ApiError(StatusCode::UNAUTHORIZED, "missing or invalid API key".into()).into_response();
        }
    }
    next.run(req).await
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[derive(Deserialize)]
struct BuildTemplate {
    name: String,
    image: String,
    #[serde(default = "default_vcpus")]
    vcpus: u32,
    #[serde(default = "default_mem")]
    mem_mib: u32,
}
fn default_vcpus() -> u32 {
    2
}
fn default_mem() -> u32 {
    1024
}

async fn list_templates(State(st): State<AppState>) -> impl IntoResponse {
    Json(st.mgr.templates())
}

async fn build_template(State(st): State<AppState>, Json(b): Json<BuildTemplate>) -> ApiResult<impl IntoResponse> {
    let meta = st.mgr.build_template(&b.name, &b.image, b.vcpus, b.mem_mib).await?;
    Ok((StatusCode::CREATED, Json(meta)))
}

#[derive(Deserialize)]
struct CreateSandbox {
    #[serde(default = "default_template")]
    template: String,
}
fn default_template() -> String {
    "default".into()
}

async fn create_sandbox(State(st): State<AppState>, body: Option<Json<CreateSandbox>>) -> ApiResult<impl IntoResponse> {
    let template = body.map(|b| b.0.template).unwrap_or_else(default_template);
    let (sbx, timings) = st.mgr.create(&template).await?;
    let mut v = serde_json::to_value(sbx.info()).unwrap();
    v["timings"] = serde_json::to_value(timings).unwrap();
    Ok((StatusCode::CREATED, Json(v)))
}

async fn list_sandboxes(State(st): State<AppState>) -> impl IntoResponse {
    Json(st.mgr.list().await)
}

async fn get_sandbox(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<impl IntoResponse> {
    Ok(Json(st.mgr.get(&id).await.ok_or_else(not_found)?.info()))
}

async fn delete_sandbox(State(st): State<AppState>, Path(id): Path<String>) -> ApiResult<StatusCode> {
    if st.mgr.delete(&id).await {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(not_found())
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Cmd {
    Shell(String),
    Argv(Vec<String>),
}

#[derive(Deserialize)]
struct Exec {
    cmd: Cmd,
    #[serde(default)]
    env: BTreeMap<String, String>,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
    stdin: Option<String>,
}

async fn exec(State(st): State<AppState>, Path(id): Path<String>, Json(e): Json<Exec>) -> ApiResult<impl IntoResponse> {
    let sbx = st.mgr.get(&id).await.ok_or_else(not_found)?;
    let argv = match e.cmd {
        Cmd::Shell(s) => vec!["/bin/sh".into(), "-c".into(), s],
        Cmd::Argv(a) => a,
    };
    let t = Instant::now();
    let out = sbx
        .agent
        .exec(ExecRequest { argv, env: e.env, cwd: e.cwd, timeout_ms: e.timeout_ms, stdin: false }, e.stdin.map(String::into_bytes))
        .await?;
    let mut v = serde_json::to_value(out).unwrap();
    v["duration_ms"] = json!((t.elapsed().as_secs_f64() * 1e6).round() / 1e3);
    Ok(Json(v))
}

#[derive(Deserialize)]
struct FileQuery {
    path: String,
    mode: Option<String>,
}

async fn read_file(State(st): State<AppState>, Path(id): Path<String>, Query(q): Query<FileQuery>) -> ApiResult<impl IntoResponse> {
    let sbx = st.mgr.get(&id).await.ok_or_else(not_found)?;
    let data = sbx.agent.read_file(&q.path).await.map_err(|e| ApiError(StatusCode::NOT_FOUND, format!("{e:#}")))?;
    Ok(([(header::CONTENT_TYPE, "application/octet-stream")], data))
}

async fn write_file(State(st): State<AppState>, Path(id): Path<String>, Query(q): Query<FileQuery>, body: Bytes) -> ApiResult<StatusCode> {
    let sbx = st.mgr.get(&id).await.ok_or_else(not_found)?;
    let mode = match q.mode.as_deref() {
        Some(m) => u32::from_str_radix(m, 8).map_err(|_| ApiError(StatusCode::BAD_REQUEST, "mode must be octal".into()))?,
        None => 0o644,
    };
    sbx.agent.write_file(&q.path, mode, &body).await?;
    Ok(StatusCode::NO_CONTENT)
}
