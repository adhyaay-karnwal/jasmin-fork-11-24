// Talking to jasmined hosts.

import http from "node:http";
import { config } from "./config.mjs";
import { HttpError } from "./util.mjs";

const byId = new Map(config.hosts.map((h) => [h.id, h]));

export function host(id) {
  const h = byId.get(id);
  if (!h) throw new HttpError(503, `host ${id} is not available`);
  return h;
}

export const hosts = () => config.hosts;

function authHeaders() {
  return config.hostKey ? { authorization: `Bearer ${config.hostKey}` } : {};
}

/** JSON request to a host. Returns { status, body }. */
export async function call(h, method, path, body, timeoutMs = 120_000) {
  const r = await fetch(h.url + path, {
    method,
    headers: { ...authHeaders(), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await r.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = { error: text };
  }
  return { status: r.status, body: parsed };
}

/**
 * Stream a request through to a host unchanged (exec, files, preview ports),
 * with the customer's credentials swapped for the host key.
 */
export function pipe(h, req, res, path) {
  const target = new URL(h.url + path);
  const headers = { ...req.headers, ...authHeaders(), host: target.host };
  if (!config.hostKey) delete headers.authorization;
  delete headers["x-forwarded-for"];
  const up = http.request(
    { hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  up.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `host unreachable: ${e.message}` }));
  });
  req.pipe(up);
}

/** Forward a WebSocket upgrade (dev-server hot reload on preview ports). */
export function pipeUpgrade(h, req, socket, head, path) {
  const target = new URL(h.url + path);
  const headers = { ...req.headers, ...authHeaders(), host: target.host };
  if (!config.hostKey) delete headers.authorization;
  const up = http.request({ hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers });
  up.on("upgrade", (r, upSocket, upHead) => {
    const lines = [`HTTP/1.1 ${r.statusCode} ${r.statusMessage}`];
    for (let i = 0; i < r.rawHeaders.length; i += 2) lines.push(`${r.rawHeaders[i]}: ${r.rawHeaders[i + 1]}`);
    socket.write(lines.join("\r\n") + "\r\n\r\n");
    if (upHead?.length) socket.write(upHead);
    if (head?.length) upSocket.write(head);
    upSocket.pipe(socket).pipe(upSocket);
    upSocket.on("error", () => socket.destroy());
    socket.on("error", () => upSocket.destroy());
  });
  up.on("response", (r) => {
    socket.end(`HTTP/1.1 ${r.statusCode} ${r.statusMessage}\r\n\r\n`);
  });
  up.on("error", () => socket.destroy());
  up.end();
}
