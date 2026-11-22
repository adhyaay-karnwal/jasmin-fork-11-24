import { Jasmine } from "./typescript/dist/index.js";
const jasmine = new Jasmine();
const sbx = await jasmine.create();
const r = await sbx.exec("python3 -c 'print(6*7)'");
await sbx.files.write("/tmp/hello.txt", "hi from ts", { mode: 0o600 });
const txt = await sbx.files.readText("/tmp/hello.txt");
if (r.stdout !== "42\n" || txt !== "hi from ts") throw new Error(JSON.stringify({ r, txt }));

// pause keeps state; the next call resumes on its own
await sbx.exec("echo kept > /tmp/state");
await sbx.pause();
const kept = await sbx.exec("cat /tmp/state");
if (kept.stdout !== "kept\n") throw new Error(`pause/resume lost state: ${JSON.stringify(kept)}`);

// snapshot -> template -> a copy carries the file
const t = await sbx.snapshot();
const copy = await jasmine.create({ template: t.name });
const fromCopy = await copy.exec("cat /tmp/state");
await copy.delete();
await jasmine.request("DELETE", `/v1/templates/${encodeURIComponent(t.name)}`);
if (fromCopy.stdout !== "kept\n") throw new Error(`snapshot copy missing state: ${JSON.stringify(fromCopy)}`);

// preview URL proxies into the sandbox
await sbx.exec("mkdir -p /tmp/www && echo preview-ok > /tmp/www/index.html && (setsid python3 -m http.server 3000 --bind 127.0.0.1 -d /tmp/www >/dev/null 2>&1 < /dev/null &) && sleep 1");
const page = await (await fetch(sbx.previewUrl(3000))).text();
await sbx.delete();
if (page.trim() !== "preview-ok") throw new Error(`preview: ${page}`);
console.log("PASS  typescript sdk (exec, files, pause, snapshot, preview)", r.durationMs, "ms exec,", sbx.timings.total_ms, "ms create (server)");
