"""Builds the two Jasmine Recording Studio decks (slides.html + script.json each): python3 launch/studio/build.py"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))

MARK = (
    '<svg class="mark" viewBox="0 0 24 24">'
    + "".join(f'<ellipse cx="12" cy="6.2" rx="2.6" ry="5.2" fill="#f4f5f0" opacity=".94" transform="rotate({a} 12 12)"/>' for a in (0, 72, 144, 216, 288))
    + '<circle cx="12" cy="12" r="1.7" fill="#a6e86b"/></svg>'
)

CSS = """
@font-face { font-family: "Geist"; src: url("assets/fonts/Geist-Regular.woff2") format("woff2"); font-weight: 400; }
@font-face { font-family: "Geist"; src: url("assets/fonts/Geist-Medium.woff2") format("woff2"); font-weight: 500; }
@font-face { font-family: "Geist"; src: url("assets/fonts/Geist-SemiBold.woff2") format("woff2"); font-weight: 600; }
@font-face { font-family: "Geist Mono"; src: url("assets/fonts/GeistMono.woff2") format("woff2"); font-weight: 400; }
:root { --g: #070807; --ink: #f4f5f0; --ink2: #b4b9ae; --dim: #6b7068; --leaf: #a6e86b; --bud: #f0b7cc; --line: rgba(244,245,240,.1); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: var(--g); color: var(--ink); font-family: "Geist", sans-serif; }
.slide { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: var(--g); }
.slide.on { display: flex; }
.stage { position: relative; width: 1920px; height: 1080px; flex: none; transform-origin: center; overflow: hidden; }
canvas.dith { position: absolute; inset: 0; width: 1920px; height: 1080px; image-rendering: pixelated; opacity: .55; }
.pad { position: absolute; left: 150px; right: 150px; top: 130px; bottom: 110px; }
.on .rise { animation: rise .7s cubic-bezier(.22,1,.36,1) both; }
.on .rise.d1 { animation-delay: .08s } .on .rise.d2 { animation-delay: .16s } .on .rise.d3 { animation-delay: .24s } .on .rise.d4 { animation-delay: .32s }
@keyframes rise { from { opacity: 0; transform: translateY(26px) } to { opacity: 1; transform: none } }
.kick { font-family: "Geist Mono", monospace; font-size: 26px; letter-spacing: .14em; text-transform: uppercase; color: var(--leaf); margin-bottom: 30px; }
.h1 { font-size: 132px; font-weight: 600; letter-spacing: -.05em; line-height: .98; }
.h2 { font-size: 92px; font-weight: 600; letter-spacing: -.045em; line-height: 1.02; }
.sub { font-size: 38px; line-height: 1.4; color: var(--ink2); margin-top: 34px; max-width: 1300px; }
.leaf { color: var(--leaf); } .bud { color: var(--bud); } .dim { color: var(--dim); }
.lock { display: flex; align-items: center; gap: 30px; }
.mark { width: 120px; height: 120px; }
.lock span { font-size: 120px; font-weight: 600; letter-spacing: -.05em; }
.card { border: 2px solid var(--line); border-radius: 26px; background: rgba(13,15,12,.92); padding: 40px 46px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
.card h3 { font-size: 38px; font-weight: 600; letter-spacing: -.02em; margin-bottom: 16px; }
.card p { font-size: 29px; line-height: 1.45; color: var(--ink2); }
.mono, pre { font-family: "Geist Mono", monospace; }
pre { font-size: 31px; line-height: 1.6; color: #d9ddd3; white-space: pre; }
pre .p { color: var(--dim) } pre .o { color: var(--leaf) } pre .c { color: var(--dim) } pre .s { color: var(--bud) }
.bar { height: 22px; border-radius: 4px; background: #2a2e27; }
.bar.me { background: var(--leaf); }
table { border-collapse: collapse; width: 100%; font-size: 31px; }
th { text-align: right; font-weight: 500; color: var(--dim); font-size: 26px; padding: 0 0 18px 0; }
th:first-child, td:first-child { text-align: left; }
td { text-align: right; padding: 15px 0; border-top: 2px solid var(--line); font-variant-numeric: tabular-nums; }
td.w { color: var(--leaf); font-weight: 600; }
td.l { color: var(--ink2); }
.chip { display: inline-block; font-family: "Geist Mono", monospace; font-size: 24px; padding: 8px 18px; border-radius: 30px; border: 2px solid rgba(166,232,107,.35); color: var(--leaf); }
.chip.bud { border-color: rgba(240,183,204,.4); color: var(--bud); }
.flow { display: flex; align-items: center; gap: 22px; }
.flow .card { padding: 30px 34px; }
.arrow { font-family: "Geist Mono", monospace; font-size: 40px; color: var(--leaf); }
.big { font-size: 360px; font-weight: 600; letter-spacing: -.07em; line-height: .9; }
.cmd { display: inline-block; font-family: "Geist Mono", monospace; font-size: 40px; padding: 26px 40px; border-radius: 18px; border: 2px solid rgba(166,232,107,.35); background: rgba(7,8,7,.85); }
.foot { position: absolute; left: 150px; right: 150px; bottom: 64px; display: flex; justify-content: space-between; font-family: "Geist Mono", monospace; font-size: 22px; color: var(--dim); }
video { width: 100%; height: 100%; object-fit: contain; background: var(--g); }
.dl { position: absolute; right: 24px; bottom: 22px; padding: 8px 12px; border-radius: 8px; background: #121411; border: 1px solid #2a2e27; color: var(--ink); font-size: 13px; text-decoration: none; }
ul.ticks { list-style: none; } ul.ticks li { font-size: 34px; line-height: 1.4; padding: 16px 0; border-top: 2px solid var(--line); display: flex; gap: 22px; }
ul.ticks li b { font-weight: 500; color: var(--ink); } ul.ticks li span.n { font-family: "Geist Mono", monospace; color: var(--leaf); min-width: 70px; }
"""

JS = """
const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
document.querySelectorAll("canvas.dith").forEach((c, n) => {
  const g = c.getContext("2d"), W = c.width, H = c.height, mode = c.dataset.mode || "low";
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = x / W, ny = y / H;
    let v = 0.5 + 0.5 * Math.sin((nx * 3.1 - ny * 2.2) * Math.PI + n * 1.7 + Math.sin(ny * 4 + n) * 1.3);
    v = v * v * (mode === "low" ? 0.55 * Math.pow(ny, 1.6) : 0.38 * (1 - ny * 0.4));
    const lit = v > (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
    const bud = Math.sin(nx * 5 + ny * 3 + n) > 0.8;
    const i = (y * W + x) * 4;
    if (lit) { d[i] = bud ? 240 : 166; d[i + 1] = bud ? 183 : 232; d[i + 2] = bud ? 204 : 107; d[i + 3] = 150; }
  }
  g.putImageData(img, 0, 0);
});
const slides = [...document.querySelectorAll(".slide")];
function fit() {
  const k = Math.min(innerWidth / 1920, innerHeight / 1080);
  document.querySelectorAll(".stage").forEach((st) => (st.style.transform = `scale(${k})`));
}
window.show = function (i) {
  i = Math.max(0, Math.min(slides.length - 1, i));
  slides.forEach((s, n) => s.classList.toggle("on", n === i));
  const v = document.querySelector("video");
  if (v && !slides[i].contains(v) && !v.paused) v.pause();
  window.current = i;
};
addEventListener("resize", fit);
fit();
window.show(0);
"""


def page(title, slides):
    body = []
    for i, (cls, html) in enumerate(slides):
        if cls == "video":
            body.append(f'<!-- {i} -->\n<section class="slide">{html}</section>')
        else:
            body.append(f'<!-- {i} -->\n<section class="slide"><div class="stage">{html}</div></section>')
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>{title}</title>
<style>{CSS}</style>
</head>
<body>
{chr(10).join(body)}
<script>{JS}</script>
</body>
</html>
"""


def dith(mode="low"):
    return f'<canvas class="dith" data-mode="{mode}" width="480" height="270"></canvas>'


def foot(left, right="tryjasmine.dev"):
    return f'<div class="foot"><span>{left}</span><span>{right}</span></div>'


# ======================================================================
# Deck 1: launch, numbers, demos
# ======================================================================
L = []
L.append(("", dith() + f"""
<div class="pad" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  <div class="lock rise">{MARK}<span>Jasmine</span></div>
  <div class="h2 rise d1" style="margin-top:60px">Sandboxes for AI agents,<br/>ready in <span class="leaf">100 ms</span>.</div>
  <div class="sub rise d2" style="text-align:center">Open source. Firecracker microVMs. Measured in public against everyone else.</div>
</div>"""))

L.append(("", f"""
<div class="pad">
  <div class="kick rise">The problem</div>
  <div class="h1 rise d1">Agents write code.<br/>It has to run <span class="leaf">somewhere</span>.</div>
  <div class="grid3 rise d2" style="margin-top:90px">
    <div class="card"><h3 style="text-decoration:line-through;text-decoration-color:var(--leaf);text-decoration-thickness:5px">Your laptop</h3><p>One bad <span class="mono">rm</span> and it's your files.</p></div>
    <div class="card"><h3 style="text-decoration:line-through;text-decoration-color:var(--leaf);text-decoration-thickness:5px">Production</h3><p>Next to your database and your cloud credentials.</p></div>
    <div class="card"><h3 style="text-decoration:line-through;text-decoration-color:var(--leaf);text-decoration-thickness:5px">A shared container</h3><p>Shares a kernel with everything else on the host.</p></div>
  </div>
</div>{foot("01 · why")}"""))

L.append(("", dith("high") + f"""
<div class="pad">
  <div class="kick rise">What it is</div>
  <div class="h1 rise d1">A microVM for<br/>every agent task.</div>
  <div class="grid4 rise d2" style="margin-top:80px">
    <div class="card"><h3>Own kernel</h3><p>Firecracker per sandbox. Hardware isolation, not namespaces.</p></div>
    <div class="card"><h3>Never booted</h3><p>Restored from a memory snapshot of a booted template.</p></div>
    <div class="card"><h3>Internet, fenced</h3><p>pip and git work. Metadata, host and other sandboxes don't.</p></div>
    <div class="card"><h3>Pause, fork</h3><p>Pause between turns. Snapshot, then start copies.</p></div>
  </div>
</div>{foot("02 · what")}"""))

L.append(("", dith() + f"""
<div class="pad" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  <div class="kick rise">Create → first command</div>
  <div class="big rise d1"><span class="leaf">100</span><span class="dim" style="font-size:150px;letter-spacing:-.03em"> ms</span></div>
  <div class="mono rise d2" style="font-size:44px;margin-top:40px;letter-spacing:-.04em"><span class="leaf">{'█' * 40}</span></div>
  <div class="sub rise d3" style="text-align:center">0.10 s median cold start on aisandboxbench's harness. The best of 13 hosted providers: 0.38 s.</div>
</div>{foot("03 · the number")}"""))

L.append(("", f"""
<div class="pad">
  <div class="kick rise">Demo 1 · four lines of Python</div>
  <div class="grid2" style="grid-template-columns:1.25fr .75fr;align-items:start">
    <div class="card rise d1"><pre><span class="p">&gt;&gt;&gt;</span> from jasmine_sdk import Jasmine
<span class="p">&gt;&gt;&gt;</span> with Jasmine().create() as sbx:
<span class="p">...</span>     r = sbx.exec("python3 -c 'print(6*7)'")
<span class="p">...</span>     print(r.stdout, r.exit_code)
<span class="o">42
 0</span>
<span class="p">&gt;&gt;&gt;</span> <span class="c"># sandbox deleted when the block exits</span></pre></div>
    <div class="rise d2">
      <ul class="ticks">
        <li><span class="n">0</span><span><b>Zero dependencies.</b> stdlib Python, or TypeScript with no deps.</span></li>
        <li><span class="n">env</span><span><b>Two variables:</b> JASMINE_URL and JASMINE_API_KEY.</span></li>
        <li><span class="n">api</span><span><b>Plain HTTP</b> underneath, for any other language.</span></li>
      </ul>
    </div>
  </div>
</div>{foot("04 · demo")}"""))

L.append(("", dith("high") + f"""
<div class="pad">
  <div class="kick rise">Demo 2 · state you can branch</div>
  <div class="h2 rise d1">Pause it. Snapshot it.<br/>Start four copies.</div>
  <div class="flow rise d2" style="margin-top:80px">
    <div class="card"><pre style="font-size:28px">sbx_7f3a
<span class="o">running</span></pre></div><span class="arrow">→</span>
    <div class="card"><pre style="font-size:28px">sbx.pause()
<span class="s">state kept</span></pre></div><span class="arrow">→</span>
    <div class="card"><pre style="font-size:28px">sbx.snapshot()
<span class="o">template</span></pre></div><span class="arrow">→</span>
    <div class="card"><pre style="font-size:28px">start × 4
<span class="o">.1 .2 .3 .4</span></pre></div>
  </div>
  <div class="sub rise d3">Pause and resume: 0.42 s. Start from a snapshot: 0.10 s. Use it to branch an agent's work or fan out RL rollouts.</div>
</div>{foot("05 · demo")}"""))

L.append(("", f"""
<div class="pad">
  <div class="kick rise">Demo 3 · let your agent install it</div>
  <div class="grid2" style="grid-template-columns:.8fr 1.2fr;align-items:start">
    <div class="rise d1">
      <div class="h2" style="font-size:80px">One prompt.<br/>Paste it into<br/>Claude Code, Codex<br/>or Cursor.</div>
      <div style="margin-top:44px"><span class="cmd" style="font-size:30px">tryjasmine.dev/agent-setup.md</span></div>
    </div>
    <div class="card rise d2"><pre style="font-size:28px"><span class="o">1</span>  check for /dev/kvm
<span class="o">2</span>  install jasmined
<span class="o">3</span>  build a template from your image
<span class="o">4</span>  start the API with a key
<span class="o">5</span>  smoke test: create, exec, delete
<span class="o">6</span>  route your model's code into sandboxes
<span class="o">7</span>  report back what changed</pre></div>
  </div>
</div>{foot("06 · demo")}"""))

L.append(("", f"""
<div class="pad">
  <div class="kick rise">Numbers 1 · fairbench, one machine</div>
  <div class="rise d1" style="font-size:34px;color:var(--ink2);margin-bottom:34px">Same host, same <span class="mono">node:22-bookworm</span> image, 2 vCPU / 4 GiB each, interleaved rounds, seeded workload.</div>
  <table class="rise d2">
    <tr><th>median</th><th>Jasmine</th><th>Docker</th><th>gVisor</th><th>Kata</th></tr>
    <tr><td>create → first command</td><td class="w">87 ms</td><td>174</td><td>192</td><td>3,346</td></tr>
    <tr><td>run a command</td><td class="w">4.1 ms</td><td>37</td><td>28</td><td>34</td></tr>
    <tr><td>held-out agent trace (40 ops)</td><td class="w">673 ms</td><td>1,273</td><td>1,310</td><td>1,540</td></tr>
    <tr><td>25 sandboxes at once</td><td class="w">1.6 s</td><td>2.0</td><td>2.7</td><td>25.5</td></tr>
    <tr><td>CPU-bound Python</td><td class="l">109 ms</td><td class="w">74</td><td>80</td><td>141</td></tr>
    <tr><td>Vite production build</td><td class="l">4.3 s</td><td class="w">2.6</td><td>4.3</td><td>4.9</td></tr>
  </table>
</div>{foot("07 · numbers", "results/fairbench/run2-2026-11-22.md")}"""))

L.append(("", dith() + f"""
<div class="pad">
  <div class="kick rise">Numbers 2 · aisandboxbench's own harness</div>
  <div class="lock rise d1" style="gap:40px;align-items:baseline"><span class="big leaf" style="font-size:300px">#1</span><span class="h2">on 12 of 25 metrics</span></div>
  <div class="grid2 rise d2" style="margin-top:50px">
    <div class="card"><h3 class="leaf">Wins</h3><p>Cold start 0.10 s (next best 0.38) · agent tool replay 4.3 s (10.9) · pause + resume 0.42 s (0.73) · start from snapshot 0.10 s (0.55)</p></div>
    <div class="card"><h3 class="bud">Losses, also published</h3><p>25-at-once bursts: 7th of 13 · npm install: 11th · memory bandwidth and disk write: 12th of 14</p></div>
  </div>
  <div class="sub rise d3" style="font-size:28px">Self-run, not an aisandboxbench.com listing. Different client location and hardware. 0 failures in ~2,700 observations.</div>
</div>{foot("08 · numbers", "results/aisandboxbench-2026-11-21.md")}"""))

L.append(("", f"""
<div class="pad">
  <div class="kick rise">How you get it</div>
  <div class="grid3 rise d1" style="margin-top:20px">
    <div class="card"><h3>Open source</h3><div class="h2" style="font-size:84px;margin:10px 0 20px">$0</div><p>The whole engine, Apache-2.0, on any Linux box with KVM. No account, no telemetry.</p></div>
    <div class="card" style="border-color:rgba(166,232,107,.45)"><h3>Cloud <span class="chip" style="margin-left:10px">early access</span></h3><div class="h2" style="font-size:84px;margin:10px 0 20px">Soon</div><p>The same binary, run by us. Request a spot from the dashboard.</p></div>
    <div class="card"><h3>Enterprise</h3><div class="h2" style="font-size:84px;margin:10px 0 20px">Custom</div><p>In your own cloud account, or on dedicated hosts.</p></div>
  </div>
  <div class="sub rise d2">Sign in at tryjasmine.dev to create API keys. They work today as <span class="mono">JASMINE_API_KEY</span> on your own daemon.</div>
</div>{foot("09 · availability")}"""))

L.append(("", dith() + f"""
<div class="pad" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  <div class="lock rise">{MARK}<span>Jasmine</span></div>
  <div class="rise d1" style="margin-top:70px"><span class="cmd"><span class="leaf">$</span> curl -fsSL tryjasmine.dev/install | sudo sh</span></div>
  <div class="sub rise d2" style="text-align:center">tryjasmine.dev · github.com/arjunkshah12345-hash/jasmine-sandbox</div>
</div>"""))

L.append(("video", '<video controls playsinline preload="metadata" poster="assets/cover.jpg"><source src="assets/jasmine-launch.mp4" type="video/mp4" /></video><a class="dl" href="assets/jasmine-launch.mp4" download>Download MP4 ↗</a>'))

LS = [
    {"t": "01 · Opening", "n": "Unhurried. Let the title sit for a beat before you speak.", "p": [
        "This is <b>Jasmine</b>.",
        "It gives AI agents somewhere safe to run code. Each sandbox is its own virtual machine, and it's ready in about <b>a hundred milliseconds</b>.",
        "It's open source, and every number I'm about to show you, you can rerun yourself."]},
    {"t": "02 · The problem", "n": "Point at each card as you name it.", "p": [
        "Agents write code now. Lots of it. And that code has to run somewhere.",
        "Your laptop is a bad answer. Production is a worse one. And a shared container still shares a kernel with everything else on the machine."]},
    {"t": "03 · What it is", "n": "", "p": [
        "So Jasmine gives every agent task its own computer: a <b>Firecracker microVM</b> with its own kernel.",
        "It's never booted. It's restored from a snapshot of a machine that already booted. It has internet, but it can't reach your cloud metadata, your host, or other sandboxes.",
        "And you can pause it, snapshot it, and start copies of it."]},
    {"t": "04 · The number", "n": "Slow down. This is the headline.", "p": [
        "Here's the headline. From asking for a sandbox to running its first command: <b>a tenth of a second</b>.",
        "On aisandboxbench's own harness, the fastest of the thirteen hosted providers they publish was point three eight seconds."]},
    {"t": "05 · Demo: Python", "n": "Read the code aloud, slowly.", "p": [
        "Here's what using it looks like. Import it, create a sandbox, run a command, get the output. When the block ends, the sandbox is deleted.",
        "The Python SDK is standard library only. The TypeScript one has zero dependencies. Underneath it's plain HTTP."]},
    {"t": "06 · Demo: pause and fork", "n": "Trace the arrows left to right.", "p": [
        "Agents work in turns, and most of the time they're thinking, not running. So pause the sandbox between turns. It keeps all its state and uses no CPU.",
        "Or snapshot it, and start <b>four copies</b> from that exact moment. That's how you branch an agent's work, or fan out RL rollouts."]},
    {"t": "07 · Demo: agent setup", "n": "", "p": [
        "And you don't have to set any of this up by hand.",
        "There's one prompt on the site. Paste it into Claude Code, Codex or Cursor, and your agent checks for KVM, installs Jasmine, starts it with a key, runs a smoke test, and then moves your model's code into sandboxes. It tells you what it changed."]},
    {"t": "08 · Numbers: same machine", "n": "Point at the bottom two rows. Own them.", "p": [
        "Now the numbers. First, <b>fairbench</b>: Jasmine, Docker, gVisor and Kata on one machine, same image, same limits.",
        "Jasmine is ahead on starting sandboxes and on agent-loop latency: 87 milliseconds to a first command, four milliseconds per command.",
        "And look at the bottom two rows. Docker wins raw CPU and builds, because it doesn't pay for a virtual machine. We put that on the slide on purpose."]},
    {"t": "09 · Numbers: aisandboxbench", "n": "Say the caveat clearly. Don't rush it.", "p": [
        "Second, aisandboxbench's own open-source harness, against the thirteen providers they publish. Jasmine's median comes first on <b>twelve of twenty-five</b> metrics.",
        "It's weaker on big bursts, npm install and disk writes. And to be clear: these are results we ran ourselves, not a listing on their site."]},
    {"t": "10 · How you get it", "n": "", "p": [
        "The whole engine is open source, Apache two point oh, and it runs on any Linux machine with KVM.",
        "If you'd rather not run it, Jasmine Cloud is in early access. Sign in on the site, make an API key, and request a spot."]},
    {"t": "11 · Close", "n": "Look at the camera. Smile on the last line.", "p": [
        "One command to install. It's all at <b>tryjasmine.dev</b>.",
        "Give your agents their own computers."]},
    {"t": "12 · Launch film", "n": "Press play. Stay quiet for 44 seconds.", "p": ["(Play the launch film.)"]},
]

# ======================================================================
# Deck 2: technical, how we did it
# ======================================================================
T = []
T.append(("", dith() + f"""
<div class="pad" style="display:flex;flex-direction:column;justify-content:center">
  <div class="kick rise">Jasmine · engineering</div>
  <div class="h1 rise d1">How a sandbox<br/>starts in <span class="leaf">100 ms</span>.</div>
  <div class="sub rise d2">Snapshots instead of boots, reflinks instead of copies, and a PID 1 that does almost nothing.</div>
</div>{foot("tryjasmine.dev/blog/how-a-sandbox-starts-in-100ms")}"""))

T.append(("", f"""
<div class="pad">
  <div class="kick rise">Architecture</div>
  <div class="flow rise d1" style="margin-top:30px">
    <div class="card"><h3>SDK</h3><p>TypeScript, Python, curl</p></div><span class="arrow">→</span>
    <div class="card"><h3>jasmined</h3><p>HTTP :7171 · Rust<br/>templates, lifecycle</p></div><span class="arrow">→</span>
    <div class="card" style="border-color:rgba(166,232,107,.45)"><h3>Firecracker microVM</h3><p><span class="mono leaf">jasmine-agent</span> as PID 1</p></div>
  </div>
  <div class="grid3 rise d2" style="margin-top:50px">
    <div class="card"><h3>vsock</h3><p>Host ↔ guest. Framed binary, one request per connection.</p></div>
    <div class="card"><h3>XFS reflinks</h3><p>Per-sandbox disk is a copy-on-write clone of the template.</p></div>
    <div class="card"><h3>netns pool</h3><p>One network namespace per sandbox, pre-built and recycled.</p></div>
  </div>
</div>{foot("01 · the shape")}"""))

T.append(("", f"""
<div class="pad">
  <div class="kick rise">1 · Build once</div>
  <div class="h2 rise d1">A template is a VM that<br/>already booted.</div>
  <div class="flow rise d2" style="margin-top:70px">
    <div class="card"><pre style="font-size:28px">OCI image</pre></div><span class="arrow">→</span>
    <div class="card"><pre style="font-size:28px">ext4, no journal</pre></div><span class="arrow">→</span>
    <div class="card"><pre style="font-size:28px">boot once</pre></div><span class="arrow">→</span>
    <div class="card"><pre style="font-size:28px">prewarm page cache</pre></div><span class="arrow">→</span>
    <div class="card" style="border-color:rgba(166,232,107,.45)"><pre style="font-size:28px"><span class="o">snapshot</span></pre></div>
  </div>
  <div class="sub rise d3"><span class="mono">sudo jasmined build default python:3.12-slim</span>. About a minute, once. Memory and CPU state go into the snapshot.</div>
</div>{foot("02 · build")}"""))

T.append(("", dith("high") + f"""
<div class="pad">
  <div class="kick rise">2 · Copy nothing</div>
  <div class="grid2 rise d1" style="margin-top:20px">
    <div class="card"><h3>Disk: XFS reflink</h3><p>Cloning the template disk takes the same time for 50 MB as for 5 GB. Create and fork are O(1) in image size.</p></div>
    <div class="card"><h3>Memory: MAP_PRIVATE</h3><p>Snapshot memory is mapped lazily. Pages load when the guest touches them, and clean pages are shared by every sandbox through the host page cache.</p></div>
  </div>
  <div class="sub rise d2">Result: resume cost doesn't depend on how much RAM the sandbox has, and N sandboxes don't cost N copies.</div>
</div>{foot("03 · storage")}"""))

T.append(("", f"""
<div class="pad">
  <div class="kick rise">3 · Nothing to boot</div>
  <div class="grid2" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="rise d1"><div class="h2" style="font-size:84px">PID 1 is a small,<br/>static Rust binary.</div>
      <ul class="ticks" style="margin-top:40px"><li><span class="n">no</span><span>systemd, shell or async runtime</span></li><li><span class="n">yes</span><span>mounts, zombie reaping, exec, files</span></li></ul></div>
    <div class="card rise d2"><pre style="font-size:28px"><span class="c">// one request per vsock connection</span>
frame  = len | type | payload
exec   → stdout/stderr bytes, exit code
files  → raw bytes, no base64
<span class="o">no SSH handshake</span>
<span class="o">no JSON on the hot path</span></pre></div>
  </div>
</div>{foot("04 · guest")}"""))

T.append(("", f"""
<div class="pad">
  <div class="kick rise">4 · Don't be the same machine twice</div>
  <div class="h2 rise d1">One snapshot, many VMs:<br/>same RNG, same clock.</div>
  <div class="grid3 rise d2" style="margin-top:70px">
    <div class="card"><h3>Clock</h3><p>The host sets the guest clock on every restore.</p></div>
    <div class="card"><h3>Entropy</h3><p>Fresh randomness injected with <span class="mono">RNDADDENTROPY</span>.</p></div>
    <div class="card"><h3>VMGenID</h3><p>Tells the kernel to reseed. A CI test checks two sandboxes never share random bytes.</p></div>
  </div>
</div>{foot("05 · snapshot safety")}"""))

T.append(("", dith("high") + f"""
<div class="pad">
  <div class="kick rise">5 · Networking without a single ip call</div>
  <div class="h2 rise d1">Every sandbox expects<br/>the same <span class="mono leaf">tap0</span>.</div>
  <div class="sub rise d2">The snapshot has its network config baked in. So each sandbox gets its own namespace holding an identical tap, NATed out through a unique veth.</div>
  <div class="sub rise d3">Namespaces are pre-built in a pool and recycled on delete. The create path never runs <span class="mono">ip</span> or <span class="mono">iptables</span>. Networking added nothing measurable.</div>
</div>{foot("06 · network")}"""))

T.append(("", f"""
<div class="pad">
  <div class="kick rise">The bug · the first command was slow</div>
  <div class="h2 rise d1">Ready in under 40 ms,<br/>then the first exec took as long again.</div>
  <div class="rise d2" style="margin-top:70px">
    <div style="display:flex;align-items:center;gap:30px;font-size:34px"><span style="width:300px" class="dim">before</span><div class="bar" style="width:800px"></div><span class="mono">40 ms</span></div>
    <div style="display:flex;align-items:center;gap:30px;font-size:34px;margin-top:30px"><span style="width:300px" class="leaf">after prewarm</span><div class="bar me" style="width:380px"></div><span class="mono leaf">19 ms</span></div>
  </div>
  <div class="sub rise d3">Not host page faults: cold disk reads of libc and the binary. Now the build reads binaries, libraries and runtimes into the guest page cache before snapshotting.</div>
</div>{foot("07 · first exec")}"""))

T.append(("", f"""
<div class="pad">
  <div class="kick rise">How we measure</div>
  <ul class="ticks rise d1" style="margin-top:10px">
    <li><span class="n">01</span><span><b>From the client.</b> Wall-clock through the public API, never server-reported timings.</span></li>
    <li><span class="n">02</span><span><b>Same machine, or say so.</b> fairbench runs all four systems on one host, interleaved and randomly ordered.</span></li>
    <li><span class="n">03</span><span><b>Don't tune to the test.</b> Workload seeded at run time. A 40-op agent trace we never looked at while tuning.</span></li>
    <li><span class="n">04</span><span><b>Ties are ties.</b> Medians with bootstrap 95% CIs. A win needs its interval clear of every other system's.</span></li>
    <li><span class="n">05</span><span><b>Publish the losses.</b> On the homepage, next to the wins. Raw data in the repo.</span></li>
  </ul>
</div>{foot("08 · method")}"""))

T.append(("", f"""
<div class="pad">
  <div class="kick rise">Where we lose, and why</div>
  <table class="rise d1" style="margin-top:10px">
    <tr><th>fairbench median</th><th>Jasmine</th><th>Docker</th><th>gVisor</th><th>Kata</th></tr>
    <tr><td>CPU-bound Python</td><td class="l">109 ms</td><td class="w">74</td><td>80</td><td>141</td></tr>
    <tr><td>500 small fsync'd files</td><td class="l">594 ms</td><td class="w">341</td><td>454</td><td>694</td></tr>
    <tr><td>Vite production build</td><td class="l">4.3 s</td><td class="w">2.6</td><td>4.3</td><td>4.9</td></tr>
  </table>
  <div class="grid2 rise d2" style="margin-top:50px">
    <div class="card"><h3>The VM tax</h3><p>Docker shares the host kernel. Our CI runner adds nested virtualization, which inflates the tax for Jasmine and Kata.</p></div>
    <div class="card"><h3>First touch</h3><p>The first file op in a fresh restore: 5.3 ms vs 1.1 ms for the second. Fix: pre-fault guest memory at restore.</p></div>
  </div>
</div>{foot("09 · losses")}"""))

T.append(("", dith() + f"""
<div class="pad">
  <div class="kick rise">What's next</div>
  <ul class="ticks rise d1" style="margin-top:10px">
    <li><span class="n">512×</span><span><b>2 MiB huge pages</b> with a userfaultfd restore handler, to cut post-restore EPT faults under bursts.</span></li>
    <li><span class="n">fork</span><span><b>Fork a running sandbox</b> into N copies, plus PTY and streaming exec.</span></li>
    <li><span class="n">net</span><span><b>Egress allowlists</b> and a secrets proxy, so API keys never enter the VM.</span></li>
    <li><span class="n">fleet</span><span><b>Multi-host scheduler</b>, lazily pulled images, volumes, GPUs.</span></li>
    <li><span class="n">api</span><span><b>E2B-compatible API</b> and an MCP server.</span></li>
  </ul>
</div>{foot("10 · roadmap")}"""))

T.append(("", dith() + f"""
<div class="pad" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  <div class="lock rise">{MARK}<span>Jasmine</span></div>
  <div class="sub rise d1" style="text-align:center;margin-top:50px">Read the code: github.com/arjunkshah12345-hash/jasmine-sandbox</div>
  <div class="sub rise d2" style="text-align:center;margin-top:10px">Read the post: tryjasmine.dev/blog</div>
</div>"""))

TS = [
    {"t": "01 · Opening", "n": "Conversational. This one is for engineers.", "p": [
        "Jasmine starts a fresh virtual machine and runs its first command in about <b>a hundred milliseconds</b>.",
        "This is how. It mostly comes down to three ideas: don't boot, don't copy, and don't run anything you don't need."]},
    {"t": "02 · Architecture", "n": "Walk the arrow left to right.", "p": [
        "The shape is simple. The SDKs talk HTTP to one daemon, <b>jasmined</b>, written in Rust.",
        "jasmined runs a Firecracker microVM per sandbox, and inside each one our own agent is PID 1.",
        "They talk over vsock. Disks are XFS reflinks. Networking comes from a pool of namespaces."]},
    {"t": "03 · Build once", "n": "", "p": [
        "Everything starts with a template. You give jasmined any OCI image. It unpacks it to an ext4 disk with no journal, boots it once, warms the page cache, and snapshots the whole VM: memory and CPU state.",
        "That takes about a minute, once. Every sandbox after that is a restore, not a boot."]},
    {"t": "04 · Copy nothing", "n": "", "p": [
        "On create, we don't copy anything. The disk is an XFS reflink, which costs the same for fifty megabytes as for five gigabytes.",
        "Memory is mapped <b>MAP_PRIVATE</b>. Pages load only when the guest touches them, and clean pages are shared by every sandbox through the host page cache."]},
    {"t": "05 · Nothing to boot", "n": "", "p": [
        "Inside the VM there's no systemd and no shell. PID 1 is <b>jasmine-agent</b>, a small static Rust binary with no async runtime.",
        "It mounts the basics, reaps zombies, and serves requests over vsock. One connection per request, framed binary messages, raw bytes for output and files. No SSH, and no JSON on the hot path."]},
    {"t": "06 · Snapshot safety", "n": "This is the subtle one. Slow down.", "p": [
        "There's a sharp edge with restoring one snapshot into many VMs: they all wake up with the <b>same random number state</b> and the same clock.",
        "So on every restore the host sets the clock and injects fresh entropy, and VMGenID tells the kernel to reseed. A test in CI checks that two sandboxes from one snapshot never produce the same random bytes."]},
    {"t": "07 · Networking", "n": "", "p": [
        "Networking had a similar problem. The snapshot has its network config baked in, so every sandbox expects the same tap device and the same IP.",
        "So each sandbox gets its own namespace with an identical tap inside, NATed out through a unique veth. The namespaces are pre-built and recycled, so creating a sandbox never shells out to ip or iptables."]},
    {"t": "08 · The first-command bug", "n": "Tell it as a story.", "p": [
        "Here's a bug I liked. Early on, the sandbox was ready in under forty milliseconds, and then the first command took about as long again.",
        "Profiling showed it wasn't host page faults. It was cold disk reads of libc and the binary itself. So now the build reads all of that into the guest page cache before the snapshot. First exec went from <b>forty milliseconds to nineteen</b>."]},
    {"t": "09 · How we measure", "n": "", "p": [
        "None of this matters if the benchmarks are soft. So here are the rules.",
        "We measure from the client. We run everything on the same machine, or say clearly when we don't. The workload is seeded at run time, plus a trace we never tuned against. A tie is a tie unless the confidence intervals separate. And we publish the losses."]},
    {"t": "10 · Where we lose", "n": "Own it.", "p": [
        "And we do lose. Docker wins CPU-bound work, small synced writes and builds, because it shares the host kernel and pays no VM tax. Our CI runner uses nested virtualization, which makes that tax bigger than on bare metal.",
        "There's also a first-touch cost on the first file operation after a restore. Pre-faulting memory at restore is the fix."]},
    {"t": "11 · What's next", "n": "", "p": [
        "Next up: huge pages with a userfaultfd restore handler, which should cut post-restore page faults about <b>five hundred times</b> under bursts.",
        "Then forking a running sandbox, egress allowlists, a secrets proxy so keys never enter the VM, a multi-host scheduler, and an E2B-compatible API."]},
    {"t": "12 · Close", "n": "Look at the camera.", "p": [
        "It's all open source. The code's on GitHub, and the long version of this talk is on the blog at tryjasmine.dev.",
        "Thanks for watching."]},
]

assert len(L) == len(LS), (len(L), len(LS))
assert len(T) == len(TS), (len(T), len(TS))
for d, title, slides, script in (("jasmine-launch", "Jasmine · Launch", L, LS), ("jasmine-technical", "Jasmine · How we built it", T, TS)):
    p = os.path.join(HERE, d)
    open(os.path.join(p, "slides.html"), "w").write(page(title, slides))
    json.dump(script, open(os.path.join(HERE, f"{d}.script.json"), "w"), ensure_ascii=False, indent=1)
    print(d, len(slides), "slides")
