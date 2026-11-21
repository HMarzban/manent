// Plays the page's vignettes while they are on screen. Inside a root with data-cycle (seconds), an element with
// data-at / data-off (seconds) carries data-on while the cycle's time is in [at, off); data-count-from / -to count
// during [at, at + data-dur]; data-clock="hh:mm:ss" ticks. With motion reduced nothing runs and the still frame stays.
(() => {
  const runs = new WeakMap();
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;
  const reduced = () => media.matches || root.dataset.motion === "reduce";
  const ease = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2); // cubic-bezier(0.65, 0, 0.35, 1)
  const count = (n) => Math.round(n).toLocaleString("en-GB");
  const seconds = (text) =>
    text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  const two = (n) => String(Math.floor(n)).padStart(2, "0");
  const clock = (s) =>
    `${two((s / 3600) % 24)}:${two((s / 60) % 60)}:${two(s % 60)}`;
  const sec = (v, none) => (v === undefined ? none : Number(v) * 1000);
  // typing widths and speeds arrive as data-n, data-key and data-u: the page's policy refuses style attributes
  const TYPING = ["n", "key", "u"];

  const start = (vignette) => {
    if (runs.has(vignette) || reduced()) return;
    const cycle = Number(vignette.dataset.cycle) * 1000;
    for (const el of vignette.querySelectorAll("[data-n]"))
      for (const name of TYPING)
        if (el.dataset[name])
          el.style.setProperty(`--${name}`, el.dataset[name]);
    const timed = [...vignette.querySelectorAll("[data-at], [data-off]")].map(
      (el) => ({
        el,
        at: sec(el.dataset.at, 0),
        off: sec(el.dataset.off, Infinity),
      }),
    );
    const counters = [...vignette.querySelectorAll("[data-count-to]")].map(
      (el) => ({
        el,
        still: el.textContent,
        from: Number(el.dataset.countFrom),
        to: Number(el.dataset.countTo),
        at: sec(el.dataset.at, 0),
        dur: sec(el.dataset.dur, 1000),
      }),
    );
    const clocks = [...vignette.querySelectorAll("[data-clock]")].map((el) => ({
      el,
      still: el.textContent,
      from: seconds(el.dataset.clock),
    }));
    const run = { t: 0, last: 0, frame: 0, counters, clocks };
    const frame = (now) => {
      run.t += Math.min(now - run.last, 100);
      run.last = now;
      if (run.t >= cycle) run.t = 0;
      const t = run.t;
      vignette.toggleAttribute("data-reset", t > cycle - 400);
      for (const { el, at, off } of timed)
        el.toggleAttribute("data-on", t >= at && t < off);
      for (const c of counters) {
        const p = Math.min(Math.max((t - c.at) / c.dur, 0), 1);
        c.el.textContent = count(c.from + (c.to - c.from) * ease(p));
      }
      for (const c of clocks) c.el.textContent = clock(c.from + t / 1000);
      run.frame = requestAnimationFrame(frame);
    };
    run.resume = () => {
      cancelAnimationFrame(run.frame);
      if (vignette.hasAttribute("data-paused")) return;
      run.frame = requestAnimationFrame((now) => {
        run.last = now;
        frame(now);
      });
    };
    runs.set(vignette, run);
    vignette.setAttribute("data-play", "");
    run.resume();
  };

  // puts the still frame back
  const stop = (vignette) => {
    const run = runs.get(vignette);
    if (!run) return;
    cancelAnimationFrame(run.frame);
    runs.delete(vignette);
    for (const c of [...run.counters, ...run.clocks])
      c.el.textContent = c.still;
    for (const el of vignette.querySelectorAll("[data-on]"))
      el.removeAttribute("data-on");
    vignette.removeAttribute("data-play");
    vignette.removeAttribute("data-reset");
  };

  const vignettes = [...document.querySelectorAll(".mv[data-cycle]")];
  // a vignette starts the first time it comes on screen, and pauses where it is whenever it leaves
  const seen = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        target.toggleAttribute("data-paused", !isIntersecting);
        if (isIntersecting) start(target);
        runs.get(target)?.resume();
      }
    },
    { rootMargin: "80px" },
  );
  for (const vignette of vignettes) {
    vignette.setAttribute("data-paused", "");
    seen.observe(vignette);
  }

  const follow = () => {
    for (const vignette of vignettes)
      if (reduced()) stop(vignette);
      else if (!vignette.hasAttribute("data-paused")) start(vignette);
  };
  media.addEventListener("change", follow);
  new MutationObserver(follow).observe(root, {
    attributeFilter: ["data-motion"],
  });
})();
