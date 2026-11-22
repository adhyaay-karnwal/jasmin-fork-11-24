import { Azami } from "./typescript/dist/index.js";
const azami = new Azami();
const sbx = await azami.create();
const r = await sbx.exec("python3 -c 'print(6*7)'");
await sbx.files.write("/tmp/hello.txt", "hi from ts", { mode: 0o600 });
const txt = await sbx.files.readText("/tmp/hello.txt");
await sbx.delete();
if (r.stdout !== "42\n" || txt !== "hi from ts") throw new Error(JSON.stringify({ r, txt }));
console.log("PASS  typescript sdk", r.durationMs, "ms exec,", sbx.timings.total_ms, "ms create (server)");
