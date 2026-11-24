import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function send(res, status, body, headers = {}) {
  const data = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data), ...headers });
  res.end(data);
}

export async function readBody(req, max = 1 << 20) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > max) throw new HttpError(413, "request body too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req) {
  const b = await readBody(req);
  if (!b.length) return {};
  try {
    return JSON.parse(b.toString("utf8"));
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

export const month = (d = new Date()) => d.toISOString().slice(0, 7);
export const day = (d = new Date()) => d.toISOString().slice(0, 10);
export const nowS = () => Math.floor(Date.now() / 1000);

/** Verify a Stripe-Signature header (t=...,v1=...) without the Stripe SDK. */
export function verifyStripeSignature(raw, header, secret, toleranceS = 300) {
  const parts = Object.fromEntries(
    String(header || "")
      .split(",")
      .map((p) => p.split("=")),
  );
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(nowS() - t) > toleranceS) return false;
  const want = createHmac("sha256", secret).update(`${t}.${raw}`).digest();
  const got = Buffer.from(parts.v1, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}
