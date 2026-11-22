// Minimal ustar: one regular file in, one regular file out. Enough for Docker's
// archive API, with no dependencies.

const BLOCK = 512;

function header(name, size, mode) {
  const h = Buffer.alloc(BLOCK);
  const oct = (n, len) => n.toString(8).padStart(len - 1, "0") + "\0";
  h.write(name.slice(0, 100), 0, 100, "utf8");
  h.write(oct(mode, 8), 100, 8);
  h.write(oct(0, 8), 108, 8); // uid
  h.write(oct(0, 8), 116, 8); // gid
  h.write(oct(size, 12), 124, 12);
  h.write(oct(Math.floor(Date.now() / 1000), 12), 136, 12);
  h.write("        ", 148, 8); // checksum placeholder
  h.write("0", 156, 1); // regular file
  h.write("ustar\0", 257, 6);
  h.write("00", 263, 2);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return h;
}

export function tarOne(name, data, mode = 0o644) {
  const body = Buffer.from(data);
  const pad = Buffer.alloc((BLOCK - (body.length % BLOCK)) % BLOCK);
  return Buffer.concat([header(name, body.length, mode), body, pad, Buffer.alloc(BLOCK * 2)]);
}

export function untarFirst(buf) {
  let off = 0;
  while (off + BLOCK <= buf.length) {
    const h = buf.subarray(off, off + BLOCK);
    if (h.every((b) => b === 0)) break;
    const size = parseInt(h.subarray(124, 136).toString().replace(/\0.*$/, "").trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    off += BLOCK;
    if (type === "0" || type === "\0") return new Uint8Array(buf.subarray(off, off + size));
    off += Math.ceil(size / BLOCK) * BLOCK;
  }
  throw new Error("no regular file in tar");
}
