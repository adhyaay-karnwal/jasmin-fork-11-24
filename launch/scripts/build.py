"""Builds the to-camera recording scripts: python3 launch/scripts/build.py

These are for a talking-head launch video (camera, not slides). The slide talks
live in launch/studio and use the Recording Studio.
"""
import html, os, re

HERE = os.path.dirname(os.path.abspath(__file__))

# Each beat: (label, shot, [spoken lines], b-roll or None)
SCRIPTS = {
    "jasmine-launch": {
        "title": "Jasmine · Launch video",
        "sub": "Talking head, about 90 seconds. Read it once out loud, then talk it, don't recite it.",
        "beats": [
            ("Cold open", "Close-up, straight to lens", [
                "Every AI agent that writes code needs somewhere to run it.",
                "Today I'm open-sourcing that place. This is <b>Jasmine</b>.",
            ], None),
            ("The problem", "Medium", [
                "Agents write a lot of code now. Run it on your laptop, and one bad command can wreck your machine.",
                "Run it in a container, and it still shares a kernel with everything else on the box.",
            ], None),
            ("What it is", "Medium", [
                "Jasmine gives every agent task its own computer: a tiny virtual machine with its own kernel.",
                "And it's ready in about <b>a tenth of a second</b>.",
            ], "Launch film, cold-start moment (videos/jasmine-launch/renders/jasmine-launch.mp4)"),
            ("Why it's fast", "Close-up", [
                "It doesn't boot. It wakes up from a snapshot of a machine that already booted.",
                "Like opening a laptop lid instead of turning it on.",
            ], None),
            ("Proof", "Medium, then cut to cards", [
                "I ran aisandboxbench's open-source harness against the thirteen hosted providers they publish.",
                "Jasmine came first on <b>twelve of twenty-five</b> metrics.",
                "It's not first on everything. Big bursts and heavy disk writes are still weaker, and every result is on the site.",
            ], "social/card-1.png, then social/card-2.png"),
            ("Made for agents", "Medium", [
                "Pause a sandbox between an agent's turns, and it stops using CPU.",
                "Snapshot it, and start copies from that exact moment.",
            ], None),
            ("Setup", "Medium", [
                "You don't even have to set it up yourself.",
                "Paste one prompt into Claude Code, Codex or Cursor, and your agent installs it for you.",
            ], "Screen recording: pasting the setup prompt from the site"),
            ("Close", "Close-up. Smile on the last line.", [
                "It's open source, Apache two point oh, and it runs on any Linux machine with KVM.",
                "It's all at <b>tryjasmine.dev</b>.",
                "Give your agents their own computers.",
            ], None),
        ],
    },
    "jasmine-cloud": {
        "title": "Jasmine Cloud · Launch video",
        "sub": "Talking head, about 75 seconds. Optional opener before the first line: “I'm 14, and…”",
        "beats": [
            ("Hook", "Close-up, straight to lens", [
                "Two weeks ago I open-sourced Jasmine: sandboxes for AI agents that start in a tenth of a second.",
                "The number one reply was: “I don't have a server for this.”",
                "So today, you don't need one. This is <b>Jasmine Cloud</b>.",
            ], "Cut to the launch film's title card on the last line"),
            ("What it is", "Medium", [
                "Same engine, same API, running on our machines.",
                "Sign in, make a key, and you're running code in its own virtual machine in seconds.",
                "Already self-hosting? You change <b>one environment variable</b>.",
            ], "Screen recording: sign in, make a key, create a sandbox"),
            ("Price", "Close-up. Slow down here.", [
                "It's <b>three cents an hour</b> for a four-core, eight-gig sandbox.",
                "E2B and Daytona list about thirty-three cents for the same size.",
                "The cheapest I found, Boat, is three point six cents, with a twenty-dollar monthly minimum.",
            ], "Launch film, price table"),
            ("Prepaid", "Medium", [
                "It's prepaid and billed by the second. You get <b>two dollars free</b>, no card.",
                "When your balance hits zero, your sandboxes pause. Nothing gets deleted, and you can never owe money.",
            ], None),
            ("Safe by default", "Medium", [
                "Every sandbox gets its own kernel, a timeout, and a locked-down network.",
            ], None),
            ("Still open", "Medium", [
                "And it's all still open source. If you ever want to leave, run it yourself and change that one variable back.",
            ], None),
            ("Close", "Close-up. Hold two seconds at the end.", [
                "Go to <b>tryjasmine.dev</b>. Two dollars free, no card.",
                "Show me what you build.",
            ], None),
        ],
    },
}

CSS = """
@font-face { font-family: "Geist"; src: url("fonts/Geist-Regular.woff2") format("woff2"); font-weight: 400; }
@font-face { font-family: "Geist"; src: url("fonts/Geist-SemiBold.woff2") format("woff2"); font-weight: 600; }
@font-face { font-family: "Geist Mono"; src: url("fonts/GeistMono.woff2") format("woff2"); font-weight: 400; }
:root { --paper: #f6f7f2; --ink: #11130f; --ink2: #4a4f46; --dim: #8a8f85; --leaf: #5c9a1f; --line: #e2e4dc; }
* { box-sizing: border-box; margin: 0; }
body { background: var(--paper); color: var(--ink); font-family: "Geist", sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 72px 32px 120px; }
.kick { font-family: "Geist Mono", monospace; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--leaf); }
h1 { font-size: 44px; font-weight: 600; letter-spacing: -.035em; margin-top: 10px; }
.sub { color: var(--ink2); font-size: 18px; margin-top: 12px; line-height: 1.5; }
.meta { font-family: "Geist Mono", monospace; font-size: 13px; color: var(--dim); margin-top: 16px; }
.beat { display: grid; grid-template-columns: 170px 1fr; gap: 28px; padding: 34px 0; border-top: 1px solid var(--line); }
.beat:first-of-type { margin-top: 48px; }
.lab { font-weight: 600; font-size: 15px; }
.n { font-family: "Geist Mono", monospace; color: var(--dim); font-size: 13px; display: block; margin-bottom: 6px; }
.shot { color: var(--dim); font-size: 13px; margin-top: 8px; line-height: 1.4; }
.say p { font-size: 27px; line-height: 1.42; letter-spacing: -.01em; }
.say p + p { margin-top: 14px; }
.say b { font-weight: 600; color: var(--leaf); }
.broll { font-family: "Geist Mono", monospace; font-size: 13px; color: var(--ink2); margin-top: 18px; padding: 10px 14px; border-left: 3px solid var(--leaf); background: #fff; }
@media print { main { padding-top: 24px; } .beat { break-inside: avoid; } }
"""


def page(s):
    words = sum(len(re.sub("<[^>]+>", "", l).split()) for b in s["beats"] for l in b[2])
    secs = round(words / 150 * 60)  # natural talking pace
    beats = []
    for i, (lab, shot, lines, broll) in enumerate(s["beats"], 1):
        say = "".join(f"<p>{l}</p>" for l in lines)
        br = f'<div class="broll">B-roll · {html.escape(broll)}</div>' if broll else ""
        beats.append(f'<section class="beat"><div><span class="n">{i:02d}</span><div class="lab">{lab}</div><div class="shot">{shot}</div></div><div class="say">{say}{br}</div></section>')
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>{s['title']}</title><style>{CSS}</style></head>
<body><main>
<div class="kick">Recording script · to camera</div>
<h1>{s['title']}</h1>
<p class="sub">{s['sub']}</p>
<p class="meta">{words} words · about {secs} s at a natural pace</p>
{''.join(beats)}
</main></body></html>
"""


for slug, s in SCRIPTS.items():
    open(os.path.join(HERE, f"{slug}.html"), "w").write(page(s))
    print(slug)
