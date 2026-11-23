# Jasmine launch film: SPEC

40.0 s · 1920×1080 · 30 fps · music-clocked at 120 bpm (beat 0.5 s, bar 2.0 s, 20 bars).

## Look (numbers, not adjectives)
- Ground `#070807`. Ink `#f4f5f0`. Dim `#6b7068`. Leaf `#a6e86b`. Bud `#f0b7cc`. Nothing else.
- Type: Geist 500/600, headlines 120–220 px at −0.045em; JetBrains Mono 34–44 px for terminal lines. Nothing under 28 px.
- Texture: one full-frame canvas, 4×4 Bayer ordered dither of a drifting two-tone field, drawn at 480×270 and scaled ×4 with nearest-neighbour. Its opacity is scored: 0.18 at rest, up to 1.0 on the wipe (7.0–8.0 s) and the drop (34 s).
- Text arrives by **dither scramble** (glyphs ░▒▓█▚▞ resolve left to right, seeded, ~0.5 s) or a 0.35 s expo-out lift. No blur-ins, no bounce, no 3D tilt.
- Every cut sits on a beat. Moves are 0.35–0.6 s, expo.out in, power3.in out.

## Banned
Typing into a prompt box as the opener; three feature cards; a logo docked in a corner; invented dashboards; stock "glitch" RGB split; numbers that aren't in README.md / results/.

## Shots
| t (s) | Scene | Picture | Sound |
|---|---|---|---|
| 0–4 | s1 hook | "Your agent writes code." scrambles in; at 2.0 cuts to "Where does it run?" with a blinking block cursor | sub pulse, closed hats |
| 4–8 | s2 tension | On beats: "Your laptop?" 4.0, "Production?" 5.0, "A shared container?" 6.0, each struck with a leaf dither bar; 7.0–8.0 dither floods the frame | kick enters at 4.0; noise riser 7–8 |
| 8–12 | s3 reveal | Dither drains into the five-petal mark blooming (petals rotate in 72° apart); "Jasmine" wipes in; "A microVM for every agent task." | drop: bass + pluck arp at 8.0 |
| 12–18 | s4 speed | Counter 000→100 ms over a 40-cell block bar; then real REPL: `sbx = Jasmine().create()` → `ready in 0.10 s`, `sbx.exec(...)` → `42` | pops on 13.5 and 16.5 |
| 18–25 | s5 fairbench | Bars, same machine: create→first command 87 / 174 / 192 / 3,346 ms; at 21.5 morph to run a command 4.1 / 37 / 28 / 34 ms | tick per bar |
| 25–29 | s6 fork | One sandbox card: pause (state kept) → snapshot → splits into 4 forks | whoosh on split |
| 29–32 | s7 honest | "#1 on 12 of 25 metrics" · small: "aisandboxbench's harness, self-run" · "We publish where we lose, too." | |
| 32–35 | s8 claim | "Open source." "Apache-2.0." "Any Linux box with KVM." on beats | riser 33–34 |
| 35–40 | s9 end | Mark blooms centre (impact at 35.0), wordmark wipes, `curl -fsSL tryjasmine.dev/install \| sudo sh`, tryjasmine.dev; hold 2.5 s | impact, then 2-bar tail fade |
