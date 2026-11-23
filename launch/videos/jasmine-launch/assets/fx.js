// Shared, deterministic helpers for the Jasmine film. Everything is a function of timeline time.
(function () {
  const GLYPHS = "░▒▓█▚▞▖▗▘▝";
  const hash = (a, b) => {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // Resolve `text` into `el` out of dither glyphs, left to right, over `dur` seconds from `at` on `tl`.
  function scramble(tl, el, text, at, dur) {
    const node = typeof el === "string" ? document.querySelector(el) : el;
    const p = { v: 0 };
    const paint = () => {
      const settled = Math.floor(p.v * (text.length + 3));
      const step = Math.floor(p.v * 48);
      let s = "";
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === " " || i < settled - 3) s += c;
        else if (i < settled) s += GLYPHS[Math.floor(hash(i, step) * GLYPHS.length)];
        else s += " ";
      }
      node.textContent = s;
    };
    paint();
    tl.fromTo(p, { v: 0 }, { v: 1, duration: dur, ease: "none", onUpdate: paint, immediateRender: false }, at);
    tl.set(p, { v: 1, onComplete: paint }, at + dur);
  }
  // Type `text` into `el`, one character per `cps`-th of a second.
  function type(tl, el, text, at, cps) {
    const node = typeof el === "string" ? document.querySelector(el) : el;
    const p = { n: 0 };
    tl.fromTo(p, { n: 0 }, { n: text.length, duration: text.length / cps, ease: "none", immediateRender: false,
      onUpdate: () => { node.textContent = text.slice(0, Math.round(p.n)); } }, at);
  }
  window.JX = { hash, scramble, type, GLYPHS };
})();
