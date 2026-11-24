"""Builds the Jasmine Cloud launch talk (slides.html + script.json): python3 launch/studio/build_cloud.py

Prices compared are list prices for a 4 vCPU / 8 GiB sandbox, checked 2026-11-23:
  Jasmine Cloud  4 x 0.0045 + 8 x 0.0015                      = $0.030/h
  Boat           "default" size, docs.boat.dev/pricing         = $0.036/h  (+ $20/mo minimum)
  E2B, Daytona   4 x 0.0504 + 8 x 0.0162 (their pricing pages) = $0.331/h
"""
import json, os, shutil

from build import MARK, dith, foot, page

HERE = os.path.dirname(os.path.abspath(__file__))
D = "jasmine-cloud"

PRICES = [("Jasmine Cloud", 0.030, "no minimum · no start fees"), ("Boat", 0.036, "+ $20/month minimum"), ("E2B", 0.331, ""), ("Daytona", 0.331, "")]


def price_rows():
    top = max(p for _, p, _ in PRICES)
    rows = []
    for name, p, note in PRICES:
        me = name == "Jasmine Cloud"
        w = max(1.2, p / top * 100)
        rows.append(
            f'<div style="display:grid;grid-template-columns:330px 1fr 230px;align-items:center;gap:30px;padding:20px 0;border-top:2px solid var(--line)">'
            f'<span style="font-size:38px;{"font-weight:600" if me else "color:var(--ink2)"}">{name}</span>'
            f'<div><div class="bar{" me" if me else ""}" style="width:{w:.1f}%;height:30px"></div>'
            f'<div class="mono" style="font-size:22px;color:var(--dim);margin-top:10px">{note}</div></div>'
            f'<span class="mono" style="font-size:40px;text-align:right;{"color:var(--leaf)" if me else "color:var(--ink2)"}">${p:.3f}</span></div>'
        )
    return "".join(rows)


S = []
# 0 · hook
S.append(("", dith() + f"""
<div class="pad" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  <div class="lock rise">{MARK}<span>Jasmine Cloud</span></div>
  <div class="h2 rise d1" style="margin-top:60px">The fastest sandboxes I could build.<br/>Now <span class="leaf">without a server</span>.</div>
</div>"""))
# 1 · recap
S.append(("", f"""
<div class="pad">
  <div class="kick rise">Two weeks ago</div>
  <div class="h2 rise d1">Jasmine: open-source sandboxes<br/>for AI agents.</div>
  <div class="grid3 rise d2" style="margin-top:80px">
    <div class="card"><h3 class="leaf">0.09 s</h3><p>to a ready sandbox. Restored from a memory snapshot, never booted.</p></div>
    <div class="card"><h3 class="leaf">#1 on 12 of 25</h3><p>metrics against 13 hosted providers, on aisandboxbench's harness (self-run).</p></div>
    <div class="card"><h3 class="leaf">Its own kernel</h3><p>Every sandbox is a Firecracker microVM, not a container.</p></div>
  </div>
</div>{foot("results/aisandboxbench-2026-11-21.md")}"""))
# 2 · the problem
S.append(("", dith("high") + """
<div class="pad" style="display:flex;flex-direction:column;justify-content:center">
  <div class="kick rise">What people told me</div>
  <div class="h1 rise d1">"I don't have a<br/>Linux box with KVM."</div>
  <div class="sub rise d2">Self-hosting is free, but you need bare metal or nested virtualization. Most people just want an API key.</div>
</div>"""))
# 3 · introducing
S.append(("", f"""
<div class="pad" style="display:flex;flex-direction:column;justify-content:center">
  <div class="kick rise">Today</div>
  <div class="h1 rise d1">Jasmine Cloud.</div>
  <div class="sub rise d2">Same engine, same API, same SDKs, on our machines. You change one environment variable.</div>
  <div class="rise d3" style="margin-top:70px"><span class="cmd"><span class="dim">export</span> JASMINE_URL=<span class="leaf">https://api.tryjasmine.dev</span></span></div>
</div>"""))
# 4 · demo
S.append(("", """
<div class="pad">
  <div class="kick rise">Demo</div>
  <div class="card rise d1" style="padding:50px 56px"><pre><span class="p">$</span> pip install jasmine-sdk
<span class="p">$</span> python
<span class="p">>>></span> from jasmine_sdk import Jasmine
<span class="p">>>></span> sbx = Jasmine().create()          <span class="c"># ready in ~0.1 s</span>
<span class="p">>>></span> sbx.exec("python3 -c 'print(2**64)'").stdout
<span class="o">'18446744073709551616\\n'</span>
<span class="p">>>></span> sbx.pause()                       <span class="c"># memory kept, compute billing stops</span>
<span class="p">>>></span> fork = Jasmine().create(template=sbx.snapshot()["name"])</pre></div>
</div>"""))
# 5 · price
S.append(("", f"""
<div class="pad">
  <div class="kick rise">Price · 4 vCPU · 8 GiB · per hour</div>
  <div class="h2 rise d1">The cheapest I could find.</div>
  <div class="rise d2" style="margin-top:60px">{price_rows()}</div>
</div>{foot("List prices checked 2026-11-23: docs.boat.dev/pricing, e2b.dev/docs/pricing, daytona.io/pricing")}"""))
# 6 · prepaid
S.append(("", """
<div class="pad">
  <div class="kick rise">Billing</div>
  <div class="h2 rise d1">Prepaid. Per second.<br/><span class="leaf">No surprise bills.</span></div>
  <div class="grid3 rise d2" style="margin-top:70px">
    <div class="card"><h3>$2 free</h3><p>Every account. No card needed to try it.</p></div>
    <div class="card"><h3>Never owe money</h3><p>Top up from $10. At $0, sandboxes pause. Nothing is deleted.</p></div>
    <div class="card"><h3>Paused = storage</h3><p>A paused sandbox keeps its memory and running processes, and costs only storage.</p></div>
  </div>
</div>"""))
# 7 · safety
S.append(("", """
<div class="pad">
  <div class="kick rise">Running strangers' code</div>
  <div class="h2 rise d1">Built to be boring<br/>when it goes wrong.</div>
  <ul class="ticks rise d2" style="margin-top:60px">
    <li><span class="n">01</span><b>Own kernel per sandbox.</b> A microVM boundary, not a shared kernel.</li>
    <li><span class="n">02</span><b>No root on the host.</b> Each VM's process runs as its own unprivileged user.</li>
    <li><span class="n">03</span><b>Timeouts on everything.</b> A forgotten sandbox stops itself after an hour.</li>
    <li><span class="n">04</span><b>Locked-down network.</b> The internet works; other sandboxes, the host and email relays don't.</li>
  </ul>
</div>"""))
# 8 · open source
S.append(("", dith() + """
<div class="pad" style="display:flex;flex-direction:column;justify-content:center">
  <div class="kick rise">No lock-in</div>
  <div class="h1 rise d1">Same binary.<br/>Your hardware or ours.</div>
  <div class="sub rise d2">The engine and the Cloud gateway are both open source, Apache-2.0. Leave whenever you want: run jasmined yourself and change one variable back.</div>
</div>"""))
# 9 · who it's for
S.append(("", """
<div class="pad">
  <div class="kick rise">Made for</div>
  <div class="grid2 rise d1" style="margin-top:30px">
    <div class="card"><h3>Coding agents</h3><p>A fresh computer per task, so nothing touches your laptop or your keys.</p></div>
    <div class="card"><h3>RL rollouts</h3><p>Snapshot once, start thousands of identical copies, fork mid-episode.</p></div>
    <div class="card"><h3>Code interpreters</h3><p>Run model-written code in 0.1 s, pause between turns for storage cost.</p></div>
    <div class="card"><h3>Previews</h3><p>Start a dev server and open its URL in the browser.</p></div>
  </div>
</div>"""))
# 10 · close
S.append(("", dith() + f"""
<div class="pad" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  <div class="lock rise">{MARK}<span>Jasmine Cloud</span></div>
  <div class="h2 rise d1" style="margin-top:60px">tryjasmine.dev</div>
  <div class="sub rise d2" style="text-align:center">Sign in, make a key, get $2 to try it.</div>
</div>"""))

SCRIPT = [
    {"t": "01 · Hook", "n": "Look at the camera. Optional opener: \"I'm 14, and…\"", "p": [
        "Two weeks ago I open-sourced the fastest sandbox for AI agents I could build.",
        "Today you can use it <b>without running a single server</b>. This is Jasmine Cloud."]},
    {"t": "02 · Recap", "n": "Quick. Ten seconds.", "p": [
        "Quick recap. Jasmine gives every agent task its own Firecracker microVM, with its own kernel.",
        "It restores from a memory snapshot instead of booting, so a sandbox is ready in about <b>ninety milliseconds</b>. On aisandboxbench's open-source harness it came first on 12 of 25 metrics against 13 hosted providers."]},
    {"t": "03 · The problem", "n": "", "p": [
        "And the number one thing people told me was: I don't have a Linux box with KVM.",
        "Self-hosting is free, but you need bare metal or nested virtualization. Most people just want an API key."]},
    {"t": "04 · Introducing", "n": "Slow down on the one-liner.", "p": [
        "So: Jasmine Cloud. Same engine, same API, same SDKs, running on our machines.",
        "If you already use Jasmine, you change <b>one environment variable</b>. That's the whole migration."]},
    {"t": "05 · Demo", "n": "Cut to screen recording here if you have one.", "p": [
        "Here it is. Install the SDK, create a sandbox. It's ready in about a tenth of a second.",
        "Run some code. Pause it: the memory and running processes are kept, and compute billing stops. Snapshot it, and start a copy from that exact moment."]},
    {"t": "06 · Price", "n": "This is the headline. Let it land.", "p": [
        "Now the price. For a 4 vCPU, 8 gig sandbox, Jasmine Cloud is <b>three cents an hour</b>.",
        "Boat, the cheapest I could find, is three point six cents, with a twenty dollar monthly minimum. E2B and Daytona list about thirty-three cents for the same machine. So that's around eleven times cheaper."]},
    {"t": "07 · Prepaid", "n": "", "p": [
        "Billing is prepaid and per second. Every account gets two dollars free, no card.",
        "After that you top up from ten dollars. When you hit zero, your sandboxes pause. Nothing gets deleted, and you can <b>never owe money</b>. No minimum, no fee per start."]},
    {"t": "08 · Safety", "n": "", "p": [
        "Running strangers' code means being careful. Every sandbox has its own kernel. The VM process on the host isn't root; it runs as its own unprivileged user.",
        "Every sandbox has a timeout, so a forgotten loop stops itself. And the network is locked down: the internet works, but other sandboxes, the host and email relays don't."]},
    {"t": "09 · Open source", "n": "", "p": [
        "And it's still open source. The engine and the Cloud gateway are both Apache-2.0.",
        "Same binary on your hardware or ours. If you ever want to leave, run it yourself and change that one variable back."]},
    {"t": "10 · Who it's for", "n": "", "p": [
        "It's built for coding agents that need a fresh computer per task, for RL rollouts that start thousands of copies from one snapshot, for code interpreters, and for live previews."]},
    {"t": "11 · Close", "n": "Smile. Hold for two seconds at the end.", "p": [
        "Go to <b>tryjasmine.dev</b>, sign in, make a key, and you've got two dollars to try it.",
        "I'd love to hear what you build. Thanks for watching."]},
]

assert len(S) == len(SCRIPT), (len(S), len(SCRIPT))
if __name__ == "__main__":
    out = os.path.join(HERE, D)
    os.makedirs(os.path.join(out, "assets"), exist_ok=True)
    if not os.path.isdir(os.path.join(out, "assets", "fonts")):
        shutil.copytree(os.path.join(HERE, "jasmine-launch", "assets", "fonts"), os.path.join(out, "assets", "fonts"))
    open(os.path.join(out, "slides.html"), "w").write(page("Jasmine Cloud · Launch", S))
    json.dump(SCRIPT, open(os.path.join(HERE, f"{D}.script.json"), "w"), ensure_ascii=False, indent=1)
    print(D, len(S), "slides")
