// Manent site: interactive playgrounds, site-wide studio theme switcher, compare filters and scroll rail.
// Progressive enhancement only: zero external dependencies, strict CSP, full keyboard & reduced-motion parity.
(() => {
  const doc = document;
  const root = doc.documentElement;
  const all = (sel, ctx = doc) => [...ctx.querySelectorAll(sel)];
  const reduced = () =>
    root.dataset.motion === "reduce" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    matchMedia("(forced-colors: active)").matches;

  // ---------- 1. Scroll-progress reading rail ----------
  const bar = doc.querySelector("[data-topbar]");
  if (bar && !bar.querySelector(".m-scroll-rail")) {
    const rail = doc.createElement("span");
    rail.className = "m-scroll-rail";
    rail.setAttribute("aria-hidden", "true");
    bar.append(rail);
    let ticking = false;
    const paint = () => {
      ticking = false;
      const max = doc.documentElement.scrollHeight - window.innerHeight;
      const ratio =
        max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      rail.style.setProperty("--m-scroll", ratio.toFixed(4));
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(paint);
        }
      },
      { passive: true },
    );
    window.addEventListener("resize", paint, { passive: true });
    paint();
  }

  // ---------- 2. Site-wide Studio Theme & Polarity Switcher ----------
  const SCHEME_KEY = "manent.site.scheme";
  const PALETTE_KEY = "manent.site.palette";
  const PALETTES = [
    {
      id: "studio",
      name: "Studio",
      l: {
        d: "#e9e6e0",
        dd: "#e1ddd5",
        r: "#f6f4f0",
        p: "#ffffff",
        f: "#1f1d1a",
        m: "#5a564f",
        ln: "#d8d3ca",
        ls: "#878178",
        a: "#2450be",
        s: "#e2e9f8",
        oa: "#ffffff",
      },
      k: {
        d: "#1f1d1a",
        dd: "#1a1918",
        r: "#272523",
        p: "#2a2826",
        f: "#efece6",
        m: "#b8b2a7",
        ln: "#423f3a",
        ls: "#7d7870",
        a: "#8daeff",
        s: "#25324f",
        oa: "#121211",
      },
    },
    {
      id: "celluloid",
      name: "Celluloid",
      l: {
        d: "#e6dfd3",
        dd: "#dcd4c5",
        r: "#f4efe6",
        p: "#fdfbf7",
        f: "#211c17",
        m: "#5c5246",
        ln: "#d4cab9",
        ls: "#877c6d",
        a: "#853910",
        s: "#f2e2cf",
        oa: "#ffffff",
      },
      k: {
        d: "#110f0d",
        dd: "#0c0a09",
        r: "#191613",
        p: "#282420",
        f: "#efe8dd",
        m: "#bdb2a2",
        ln: "#3e3831",
        ls: "#786e63",
        a: "#e8a454",
        s: "#3a2b1d",
        oa: "#110f0d",
      },
    },
    {
      id: "viridian",
      name: "Cold harbour",
      l: {
        d: "#dfe6e4",
        dd: "#d3ddda",
        r: "#eff4f2",
        p: "#fcfefd",
        f: "#162020",
        m: "#4a5b59",
        ln: "#c7d3d0",
        ls: "#6e827f",
        a: "#0c5a56",
        s: "#d4eae6",
        oa: "#ffffff",
      },
      k: {
        d: "#0d1316",
        dd: "#090e10",
        r: "#131b1f",
        p: "#1f292e",
        f: "#e5efee",
        m: "#a7bdbb",
        ln: "#2f4047",
        ls: "#5d737a",
        a: "#67d4c8",
        s: "#19393c",
        oa: "#0d1316",
      },
    },
    {
      id: "clothbound",
      name: "Clothbound",
      l: {
        d: "#e6e0d5",
        dd: "#dbd3c5",
        r: "#f4efe7",
        p: "#fdfbf6",
        f: "#1f1a15",
        m: "#595148",
        ln: "#d3cab9",
        ls: "#857b6d",
        a: "#2e5c3e",
        s: "#dcebe0",
        oa: "#ffffff",
      },
      k: {
        d: "#12100d",
        dd: "#0d0b09",
        r: "#1a1713",
        p: "#26221d",
        f: "#efe9df",
        m: "#b8afa2",
        ln: "#3d372e",
        ls: "#756d61",
        a: "#7ec896",
        s: "#1d3525",
        oa: "#12100d",
      },
    },
    {
      id: "newsdesk",
      name: "Dateline",
      l: {
        d: "#e2e4e7",
        dd: "#d6d9de",
        r: "#f2f3f5",
        p: "#fafbfc",
        f: "#141619",
        m: "#525760",
        ln: "#cfd3d9",
        ls: "#7a808a",
        a: "#902c06",
        s: "#fce6dc",
        oa: "#ffffff",
      },
      k: {
        d: "#0c0d0f",
        dd: "#08090a",
        r: "#141619",
        p: "#22252b",
        f: "#eceef2",
        m: "#a7aeb8",
        ln: "#333842",
        ls: "#676f7d",
        a: "#ff8c38",
        s: "#3a2518",
        oa: "#0c0d0f",
      },
    },
    {
      id: "nocturne",
      name: "Crossroads",
      l: {
        d: "#e4dfe8",
        dd: "#d8d1de",
        r: "#f3f0f5",
        p: "#fcfaf6",
        f: "#1d1826",
        m: "#574f66",
        ln: "#d1cad9",
        ls: "#7e758f",
        a: "#5b3896",
        s: "#e6def5",
        oa: "#ffffff",
      },
      k: {
        d: "#0f0d17",
        dd: "#0a0810",
        r: "#161322",
        p: "#252136",
        f: "#ede9f5",
        m: "#b1a8c7",
        ln: "#3b3354",
        ls: "#72688f",
        a: "#b69cff",
        s: "#312652",
        oa: "#0f0d17",
      },
    },
  ];

  const readStore = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const writeStore = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };

  let activeScheme =
    readStore(SCHEME_KEY) ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  let activePalette = readStore(PALETTE_KEY) || "studio";
  if (!PALETTES.some((p) => p.id === activePalette)) activePalette = "studio";

  const applyThemeTokens = () => {
    // design-system.html manages its full 24-palette set via design-system.js
    if (doc.getElementById("ds-theme-grid")) return;
    const pal = PALETTES.find((p) => p.id === activePalette) || PALETTES[0];
    const t = activeScheme === "dark" ? pal.k : pal.l;
    root.dataset.siteTheme = activeScheme;
    const highContrast = matchMedia("(prefers-contrast: more)").matches;
    const entries = [
      ["--desk", t.d],
      ["--desk-deep", t.dd],
      ["--raised", t.r],
      ["--paper", t.p],
      ["--fg", t.f],
      ["--fg-muted", t.m],
      ["--line", t.ln],
      ["--line-strong", t.ls],
      ["--accent", t.a],
      ["--accent-soft", t.s],
      ["--on-accent", t.oa],
    ];
    for (const [k, v] of entries) {
      if (highContrast) root.style.removeProperty(k);
      else root.style.setProperty(k, v);
    }
    syncThemeUI();
  };

  const transitionTheme = (originEl, kind, mutate) => {
    if (reduced() || typeof doc.startViewTransition !== "function") {
      mutate();
      applyThemeTokens();
      return;
    }
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    if (originEl && originEl.getBoundingClientRect) {
      const r = originEl.getBoundingClientRect();
      x = Math.max(0, Math.min(window.innerWidth, r.left + r.width / 2));
      y = Math.max(0, Math.min(window.innerHeight, r.top + r.height / 2));
    }
    const endR = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    const vt = doc.startViewTransition(() => {
      root.setAttribute("data-site-switching", "");
      mutate();
      applyThemeTokens();
    });
    const clear = () => root.removeAttribute("data-site-switching");
    vt.updateCallbackDone.then(clear, clear);
    vt.ready
      .then(() => {
        if (typeof root.animate !== "function") return;
        if (kind === "iris") {
          root.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${endR}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 420,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "both",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        } else {
          root.animate(
            { opacity: [0, 1] },
            {
              duration: 220,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
              fill: "both",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        }
      })
      .catch(() => {});
  };

  const setSiteTheme = (nextScheme, nextPalette, originEl) => {
    const schemeChanged = nextScheme && nextScheme !== activeScheme;
    transitionTheme(originEl, schemeChanged ? "iris" : "fade", () => {
      if (nextScheme) {
        activeScheme = nextScheme;
        writeStore(SCHEME_KEY, activeScheme);
      }
      if (nextPalette) {
        activePalette = nextPalette;
        writeStore(PALETTE_KEY, activePalette);
      }
    });
  };

  let themePop = null;
  let themeTrigger = null;

  const syncThemeUI = () => {
    if (!themePop || !themeTrigger) return;
    const pal = PALETTES.find((p) => p.id === activePalette) || PALETTES[0];
    const lbl = themeTrigger.querySelector(".pg-theme-label");
    if (lbl) lbl.textContent = pal.name;
    for (const btn of all("[data-pg-scheme]", themePop))
      btn.setAttribute(
        "aria-pressed",
        String(btn.dataset.pgScheme === activeScheme),
      );
    for (const sw of all("[data-pg-palette]", themePop)) {
      const p = PALETTES.find((x) => x.id === sw.dataset.pgPalette);
      sw.setAttribute(
        "aria-checked",
        String(sw.dataset.pgPalette === activePalette),
      );
      if (p) {
        const tok = activeScheme === "dark" ? p.k : p.l;
        const chip = sw.querySelector(".pg-swatch-chip");
        if (chip) {
          chip.style.setProperty("--sw-bg", tok.p);
          chip.style.setProperty("--sw-ac", tok.a);
        }
      }
    }
  };

  const themeMount = doc.querySelector("[data-theme-picker]");
  if (themeMount && !doc.getElementById("ds-theme-grid")) {
    themeMount.hidden = false;
    themeTrigger = themeMount.querySelector("button");
    themePop = themeMount.querySelector(".pg-theme-pop");
    const grid = themePop.querySelector(".pg-swatches");
    for (const p of PALETTES) {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "pg-swatch";
      btn.setAttribute("role", "radio");
      btn.dataset.pgPalette = p.id;
      const chip = doc.createElement("span");
      chip.className = "pg-swatch-chip";
      chip.setAttribute("aria-hidden", "true");
      const txt = doc.createElement("span");
      txt.textContent = p.name;
      btn.append(chip, txt);
      btn.addEventListener("click", () => setSiteTheme(null, p.id, btn));
      grid.append(btn);
    }
    for (const btn of all("[data-pg-scheme]", themePop)) {
      btn.addEventListener("click", () =>
        setSiteTheme(btn.dataset.pgScheme, null, btn),
      );
    }
    const closePop = () => {
      themePop.hidden = true;
      themeTrigger.setAttribute("aria-expanded", "false");
    };
    themeTrigger.addEventListener("click", () => {
      const open = themePop.hidden;
      themePop.hidden = !open;
      themeTrigger.setAttribute("aria-expanded", String(open));
      if (open) syncThemeUI();
    });
    doc.addEventListener("click", (e) => {
      if (!themePop.hidden && !themeMount.contains(e.target)) closePop();
    });
    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !themePop.hidden) {
        closePop();
        themeTrigger.focus();
      }
    });
    if (readStore(SCHEME_KEY) || readStore(PALETTE_KEY)) applyThemeTokens();
    else syncThemeUI();
  }

  // ---------- 3. Per-vignette pause/play micro-control ----------
  for (const stage of all(".stage")) {
    const mv = stage.querySelector(".mv[data-cycle]");
    if (!mv) continue;
    const ctl = doc.createElement("button");
    ctl.type = "button";
    ctl.className = "pg-vignette-ctl";
    ctl.setAttribute("aria-pressed", "false");
    ctl.textContent = "Pause";
    ctl.addEventListener("click", () => {
      const frozen = ctl.getAttribute("aria-pressed") === "true";
      const next = !frozen;
      ctl.setAttribute("aria-pressed", String(next));
      ctl.textContent = next ? "Play" : "Pause";
      mv.toggleAttribute("data-paused", next);
    });
    stage.prepend(ctl);
  }

  // ---------- 4. Playground 1: Cut the signal (Offline & Reconnect) ----------
  const offRoot = doc.querySelector("[data-pg-offline]");
  if (offRoot) {
    offRoot.hidden = false;
    const toggle = offRoot.querySelector("[data-off-toggle]");
    const addBtn = offRoot.querySelector("[data-off-add]");
    const resetBtn = offRoot.querySelector("[data-off-reset]");
    const form = offRoot.querySelector("[data-off-form]");
    const input = offRoot.querySelector("[data-off-input]");
    const list = offRoot.querySelector("[data-off-lines]");
    const badge = offRoot.querySelector("[data-off-badge]");
    const receipt = offRoot.querySelector("[data-off-receipt]");

    const SAMPLES = [
      "IDA: Hold the stern line. The mist is thickening.",
      "CAL: Engine room says two minutes to pressure.",
      "The harbour lantern blinks once across the black water.",
      "IDA: Cast off. We're not waiting for the ferry.",
    ];
    let offline = false;
    let sampleIdx = 0;
    let lines = [
      { text: "EXT. ARDLE SLIP - BEFORE DAWN", waiting: false },
      {
        text: "Fog sits on the water. One lamp swings over the ramp chain.",
        waiting: false,
      },
    ];

    const renderOff = (msg) => {
      list.innerHTML = "";
      for (const row of lines) {
        const el = doc.createElement("div");
        el.className = "pg-off-line";
        const span = doc.createElement("span");
        span.textContent = row.text;
        const tag = doc.createElement("span");
        tag.className = "pg-off-tag";
        if (row.waiting) {
          tag.setAttribute("data-wait", "");
          tag.textContent = "Saved · Waiting";
        } else {
          tag.textContent = "Synced";
        }
        el.append(span, tag);
        list.append(el);
      }
      const waiting = lines.filter((l) => l.waiting).length;
      toggle.setAttribute("aria-pressed", String(offline));
      toggle.textContent = offline ? "Reconnect signal" : "Cut signal";
      if (offline) {
        badge.dataset.state = "offline";
        badge.textContent =
          waiting > 0
            ? `Saved · Offline, ${waiting} waiting`
            : "Saved · Offline";
      } else {
        badge.dataset.state = "synced";
        badge.textContent = "Saved · Synced";
      }
      if (msg !== undefined) receipt.textContent = msg;
    };

    const appendLine = (text) => {
      const clean = text.trim();
      if (!clean) return;
      lines.push({ text: clean, waiting: offline });
      if (lines.length > 6) lines = lines.slice(-6);
      renderOff(
        offline
          ? "Stored on this device first — waiting to sync when signal returns."
          : "Saved locally and confirmed by the server.",
      );
    };

    toggle.addEventListener("click", () => {
      if (!offline) {
        offline = true;
        renderOff(
          "Signal cut. Keep writing — every line stays saved on your device.",
        );
        return;
      }
      offline = false;
      const waiting = lines.filter((l) => l.waiting).length;
      if (waiting === 0) {
        renderOff("Back online. Everything is already up to date.");
        return;
      }
      badge.dataset.state = "syncing";
      badge.textContent = "Saved · Syncing…";
      const finish = () => {
        lines = lines.map((l) => ({ ...l, waiting: false }));
        const plural = waiting === 1 ? "change" : "changes";
        renderOff(`${waiting} ${plural} synced · 0 lost.`);
        window.ManentMotion?.toast(`${waiting} ${plural} synced`);
      };
      if (reduced()) finish();
      else setTimeout(finish, 380);
    });

    addBtn.addEventListener("click", () => {
      appendLine(SAMPLES[sampleIdx % SAMPLES.length]);
      sampleIdx++;
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      appendLine(input.value || SAMPLES[sampleIdx++ % SAMPLES.length]);
      input.value = "";
    });

    resetBtn.addEventListener("click", () => {
      offline = false;
      sampleIdx = 0;
      lines = [
        { text: "EXT. ARDLE SLIP - BEFORE DAWN", waiting: false },
        {
          text: "Fog sits on the water. One lamp swings over the ramp chain.",
          waiting: false,
        },
      ];
      renderOff("Try cutting the signal, adding lines, then reconnecting.");
    });

    renderOff("Try cutting the signal, adding lines, then reconnecting.");
  }

  // ---------- 5. Playground 2: Book Publishing Engine 3 Studio ----------
  const bookRoot = doc.querySelector("[data-pg-book]");
  if (bookRoot) {
    bookRoot.hidden = false;
    const stage = bookRoot.querySelector("[data-book-stage]");
    const verso = bookRoot.querySelector("[data-book-verso]");
    const rectoHead = bookRoot.querySelector("[data-book-recto-head]");
    const openingP = bookRoot.querySelector("[data-book-opening]");
    const fnBtn = bookRoot.querySelector("[data-book-fn-btn]");
    const fnNote = bookRoot.querySelector("[data-book-fn-note]");
    const readout = bookRoot.querySelector("[data-book-readout]");

    let engine = "v3";
    let trim = "55x85";
    let view = "spread";
    let opening = "drop_cap";
    let fnOpen = false;

    const TRIM_LABELS = {
      letter: "US Letter · 8.5×11″",
      "5x8": "5×8″ paperback",
      "55x85": "5.5×8.5″ digest",
      "6x9": "6×9″ trade",
    };

    const renderBook = () => {
      stage.dataset.engine = engine;
      stage.dataset.trim = engine === "v3" ? trim : "letter";
      stage.dataset.view = engine === "v3" ? view : "single";
      verso.hidden = !(engine === "v3" && view === "spread");
      rectoHead.textContent =
        engine === "v3"
          ? "Chapter opening — running head suppressed"
          : "Lund / The Salt Almanac / 187";
      openingP.dataset.open = opening;
      fnNote.hidden = !fnOpen;
      fnBtn.setAttribute("aria-expanded", String(fnOpen));
      for (const b of all("[data-book-engine]", bookRoot))
        b.setAttribute("aria-pressed", String(b.dataset.bookEngine === engine));
      for (const b of all("[data-book-trim]", bookRoot)) {
        b.disabled = engine !== "v3";
        b.setAttribute("aria-pressed", String(b.dataset.bookTrim === trim));
      }
      for (const b of all("[data-book-view]", bookRoot)) {
        b.disabled = engine !== "v3";
        b.setAttribute("aria-pressed", String(b.dataset.bookView === view));
      }
      for (const b of all("[data-book-open]", bookRoot))
        b.setAttribute("aria-pressed", String(b.dataset.bookOpen === opening));
      readout.textContent =
        engine === "v3"
          ? `Engine 3 · Source Serif 4 · ${TRIM_LABELS[trim]} · Mirrored gutters · ${view === "spread" ? "Facing spreads" : "Single page"}`
          : "Engine 2 · Courier Prime · US Letter · Double-spaced manuscript";
    };

    for (const b of all("[data-book-engine]", bookRoot))
      b.addEventListener("click", () => {
        engine = b.dataset.bookEngine;
        renderBook();
      });
    for (const b of all("[data-book-trim]", bookRoot))
      b.addEventListener("click", () => {
        trim = b.dataset.bookTrim;
        renderBook();
      });
    for (const b of all("[data-book-view]", bookRoot))
      b.addEventListener("click", () => {
        view = b.dataset.bookView;
        renderBook();
      });
    for (const b of all("[data-book-open]", bookRoot))
      b.addEventListener("click", () => {
        opening = b.dataset.bookOpen;
        renderBook();
      });
    fnBtn.addEventListener("click", () => {
      fnOpen = !fnOpen;
      renderBook();
    });
    renderBook();
  }

  // ---------- 6. Playground 3: Interactive Game Script & Ink Runner ----------
  const inkRoot = doc.querySelector("[data-pg-ink]");
  if (inkRoot) {
    inkRoot.hidden = false;
    const logEl = inkRoot.querySelector("[data-ink-log]");
    const choicesEl = inkRoot.querySelector("[data-ink-choices]");
    const varsEl = inkRoot.querySelector("[data-ink-vars]");
    const backBtn = inkRoot.querySelector("[data-ink-back]");
    const restartBtn = inkRoot.querySelector("[data-ink-restart]");
    const rows = all("[data-ink-line]", inkRoot);

    const NODES = {
      start: {
        line: 3,
        text: "The lamp gutters on the harbour sill. The watch log lies open beside the brass bell.",
        choices: [
          {
            label: "Trim the wick",
            gate: (s) => s.oil > 0,
            gateHint: "Requires {oil > 0}",
            line: 5,
            run: (s) => ({
              ...s,
              oil: s.oil - 1,
              node: "trimmed",
              flash: "oil",
            }),
          },
          {
            label: "Write the time in the log",
            line: 8,
            run: (s) => ({
              ...s,
              logged: true,
              node: "logged",
              flash: "logged",
            }),
          },
          {
            label: "Sound the harbour bell",
            line: 10,
            run: (s) => ({ ...s, bell: true, node: "bell", flash: "bell" }),
          },
        ],
      },
      trimmed: {
        line: 6,
        text: "The flame steadies, clear and tall. One notch lower on the glass — enough for the ferry.",
        choices: [
          {
            label: "Write the time in the log",
            line: 8,
            run: (s) => ({
              ...s,
              logged: true,
              node: "logged",
              flash: "logged",
            }),
          },
          {
            label: "Return to the sill",
            line: 3,
            run: (s) => ({ ...s, node: "start", flash: null }),
          },
        ],
      },
      logged: {
        line: 9,
        text: "04:18. Visibility two cables. Your ink dries cleanly in the damp salt air.",
        choices: [
          {
            label: "Sound the harbour bell",
            line: 10,
            run: (s) => ({ ...s, bell: true, node: "bell", flash: "bell" }),
          },
          {
            label: "Return to the sill",
            line: 3,
            run: (s) => ({ ...s, node: "start", flash: null }),
          },
        ],
      },
      bell: {
        line: 11,
        text: "A single brass stroke carries into the fog. Seconds later, a distant foghorn answers twice.",
        choices: [
          {
            label: "Return to the sill",
            line: 3,
            run: (s) => ({ ...s, node: "start", flash: null }),
          },
        ],
      },
    };

    const initial = () => ({
      node: "start",
      oil: 1,
      logged: false,
      bell: false,
      visited: [3],
      flash: null,
    });
    let history = [initial()];

    const renderInk = () => {
      const s = history[history.length - 1];
      const def = NODES[s.node];
      logEl.textContent = def.text;
      backBtn.disabled = history.length <= 1;
      for (const r of rows) {
        const ln = Number(r.dataset.inkLine);
        r.dataset.visited = String(s.visited.includes(ln));
      }
      choicesEl.innerHTML = "";
      def.choices.forEach((c, idx) => {
        const allowed = c.gate ? c.gate(s) : true;
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "pg-choice-btn";
        btn.disabled = !allowed;
        const left = doc.createElement("span");
        left.textContent = `${idx + 1}. ${c.label}`;
        btn.append(left);
        if (!allowed && c.gateHint) {
          const hint = doc.createElement("small");
          hint.textContent = c.gateHint;
          btn.append(hint);
        }
        btn.addEventListener("click", () => {
          const next = c.run(s);
          const visited = new Set([
            ...s.visited,
            c.line,
            NODES[next.node].line,
          ]);
          history.push({ ...next, visited: [...visited] });
          renderInk();
        });
        choicesEl.append(btn);
      });
      varsEl.innerHTML = "";
      for (const [k, v] of [
        ["oil", s.oil],
        ["logged", s.logged],
        ["bell", s.bell],
      ]) {
        const chip = doc.createElement("span");
        chip.className = "pg-var-chip";
        if (s.flash === k) chip.dataset.flash = "true";
        chip.textContent = `${k} = ${v}`;
        varsEl.append(chip);
      }
    };

    backBtn.addEventListener("click", () => {
      if (history.length > 1) {
        history.pop();
        renderInk();
      }
    });
    restartBtn.addEventListener("click", () => {
      history = [initial()];
      renderInk();
    });
    inkRoot.addEventListener("keydown", (e) => {
      if (e.key >= "1" && e.key <= "3") {
        const btn = choicesEl.children[Number(e.key) - 1];
        if (btn && !btn.disabled) btn.click();
      }
    });
    renderInk();
  }

  // ---------- 7. Playground 4: Revision Colour & 12A Lock Sandbox ----------
  const revRoot = doc.querySelector("[data-pg-rev]");
  const colourList = doc.querySelector(".colours[data-rev-chips]");
  if (revRoot && colourList) {
    revRoot.hidden = false;
    const REVS = [
      { id: "white", name: "White", bg: "#ffffff", edge: "#878178" },
      { id: "blue", name: "Blue", bg: "#e7f1fc", edge: "#1f63b5" },
      { id: "pink", name: "Pink", bg: "#fcebf1", edge: "#b5366c" },
      { id: "yellow", name: "Yellow", bg: "#fcf7dc", edge: "#9e7c0c" },
      { id: "green", name: "Green", bg: "#e5f5ea", edge: "#1d7a47" },
      { id: "goldenrod", name: "Goldenrod", bg: "#faf0d4", edge: "#a86b08" },
      { id: "buff", name: "Buff", bg: "#f4eadc", edge: "#8f6538" },
      { id: "salmon", name: "Salmon", bg: "#fceae3", edge: "#bf4c2c" },
      { id: "cherry", name: "Cherry", bg: "#fae6e8", edge: "#a82438" },
    ];
    let activeRev = REVS[1]; // Blue
    let overflow = true;

    const sheet12 = revRoot.querySelector("[data-rev-p12]");
    const sheet12a = revRoot.querySelector("[data-rev-p12a]");
    const head12 = revRoot.querySelector("[data-rev-head12]");
    const head12a = revRoot.querySelector("[data-rev-head12a]");
    const addedLine = revRoot.querySelector("[data-rev-added]");
    const toggleBtn = revRoot.querySelector("[data-rev-overflow]");
    const readout = revRoot.querySelector("[data-rev-readout]");

    colourList.classList.add("is-interactive");
    colourList.setAttribute("role", "radiogroup");
    const items = all("li", colourList);
    items.forEach((li, i) => {
      const r = REVS[i];
      if (!r) return;
      li.innerHTML = "";
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "pg-rev-chip";
      btn.setAttribute("role", "radio");
      btn.dataset.revId = r.id;
      const dot = doc.createElement("span");
      dot.className = "pg-rev-swatch";
      dot.style.setProperty("--rc", r.bg);
      dot.setAttribute("aria-hidden", "true");
      const lbl = doc.createElement("span");
      lbl.textContent = r.name;
      btn.append(dot, lbl);
      btn.addEventListener("click", () => {
        activeRev = r;
        renderRev();
      });
      li.append(btn);
    });

    const renderRev = () => {
      const dark =
        root.dataset.siteTheme === "dark" ||
        (!root.dataset.siteTheme &&
          matchMedia("(prefers-color-scheme: dark)").matches);
      for (const b of all("[data-rev-id]", colourList))
        b.setAttribute(
          "aria-checked",
          String(b.dataset.revId === activeRev.id),
        );
      const stamp = `${activeRev.name} Rev. (28 Nov 2026)`;
      head12.textContent = overflow ? stamp : "White Production Draft";
      head12a.textContent = stamp;
      addedLine.hidden = !overflow;
      sheet12a.hidden = !overflow;
      toggleBtn.setAttribute("aria-pressed", String(overflow));
      toggleBtn.textContent = overflow
        ? "Undo added line (remove 12A)"
        : "Add line to locked Page 12";
      for (const s of [sheet12, sheet12a]) {
        s.style.setProperty("--rev-edge", activeRev.edge);
        if (dark) s.style.removeProperty("--rev-bg");
        else
          s.style.setProperty("--rev-bg", overflow ? activeRev.bg : "#ffffff");
      }
      readout.textContent = overflow
        ? `Page 12 revised (${activeRev.name}) → overflow pushed to 12A · Page 13 stays 13.`
        : "Undone: asterisk cleared and 12A removed · Page 13 stays 13.";
    };

    toggleBtn.addEventListener("click", () => {
      overflow = !overflow;
      renderRev();
    });
    renderRev();
  }

  // ---------- 8. Playground 5: Dedicated Version History & Minimap Scrubber ----------
  const histRoot = doc.querySelector("[data-pg-hist]");
  if (histRoot) {
    histRoot.hidden = false;
    const sheet = histRoot.querySelector("[data-hist-sheet]");
    const map = histRoot.querySelector("[data-hist-map]");
    const readout = histRoot.querySelector("[data-hist-readout]");

    const SNAPS = {
      now: {
        label: "Working · Now",
        changed: [],
        was: "IDA: Then I'll be the first. Cast off when I say.",
        now: "IDA: Then I'll be the first. Cast off when I say.",
        summary:
          "Read-only preview of Working · Now — live editor stays preserved underneath.",
      },
      morning: {
        label: "Today 11:40",
        changed: [2, 5],
        was: "IDA: Then I'll be the first.",
        now: "IDA: Then I'll be the first. Cast off when I say.",
        summary:
          "2 scenes changed since Today 11:40 — green Minimap ticks jump straight to each edit.",
      },
      studio: {
        label: "★ Studio",
        changed: [1, 2, 4, 5, 7],
        was: "MAREN: No one has crossed since the fog.  IDA: Then I'll be the first.",
        now: "MAREN: Nobody's logged a crossing since the fog came in.  IDA: Then I'll be the first. Cast off when I say.",
        summary:
          "5 scenes changed since ★ Studio — Restore saves today's script first as 'Before restore'.",
      },
    };
    let snapKey = "studio";
    let mode = "page";

    const renderHist = () => {
      const s = SNAPS[snapKey];
      for (const b of all("[data-hist-snap]", histRoot))
        b.setAttribute("aria-pressed", String(b.dataset.histSnap === snapKey));
      for (const b of all("[data-hist-mode]", histRoot))
        b.setAttribute("aria-pressed", String(b.dataset.histMode === mode));

      sheet.innerHTML = "";
      if (mode === "side") {
        const split = doc.createElement("div");
        split.className = "pg-hist-split";
        const a = doc.createElement("div");
        a.innerHTML = `<strong>${s.label}</strong><p>${s.was}</p>`;
        const b = doc.createElement("div");
        b.innerHTML = `<strong>Working · Now</strong><p>${s.now}</p>`;
        split.append(a, b);
        sheet.append(split);
      } else if (mode === "aswas") {
        sheet.innerHTML = `<strong>${s.label} (read-only)</strong><p>${s.was}</p>`;
      } else if (mode === "asterisks") {
        const mark =
          s.changed.length > 0 ? '<span class="pg-rev-ast">*</span>' : "";
        sheet.innerHTML = `<strong>Asterisks only</strong><p>${mark}${s.now}</p>`;
      } else if (snapKey === "now") {
        sheet.innerHTML = `<strong>On the page</strong><p>${s.now}</p>`;
      } else if (snapKey === "morning") {
        sheet.innerHTML =
          '<strong>On the page</strong><p>IDA: Then I\'ll be the first. <span class="pg-diff-add">Cast off when I say.</span></p>';
      } else {
        sheet.innerHTML =
          '<strong>On the page</strong><p>MAREN: <span class="pg-diff-del">No one has crossed since the fog.</span> <span class="pg-diff-add">Nobody\'s logged a crossing since the fog came in.</span> IDA: Then I\'ll be the first. <span class="pg-diff-add">Cast off when I say.</span></p>';
      }

      map.innerHTML = "";
      for (let i = 1; i <= 8; i++) {
        const tick = doc.createElement("span");
        tick.className = "pg-tick";
        if (i === 1 || i === 5) tick.dataset.wide = "true";
        if (s.changed.includes(i)) tick.dataset.changed = "true";
        map.append(tick);
      }
      readout.textContent = s.summary;
    };

    for (const b of all("[data-hist-snap]", histRoot))
      b.addEventListener("click", () => {
        snapKey = b.dataset.histSnap;
        renderHist();
      });
    for (const b of all("[data-hist-mode]", histRoot))
      b.addEventListener("click", () => {
        mode = b.dataset.histMode;
        renderHist();
      });
    renderHist();
  }

  // ---------- 9. Playground 6: Live Contextual ⌘K Command Palette Dialog ----------
  const palDialog = doc.getElementById("pg-palette-dialog");
  if (palDialog) {
    const openers = all("[data-pg-palette-open]");
    for (const op of openers) op.hidden = false;
    const input = palDialog.querySelector("[data-pal-input]");
    const list = palDialog.querySelector("[data-pal-list]");
    const status = palDialog.querySelector("[data-pal-status]");
    const closeBtn = palDialog.querySelector("[data-pal-close]");

    const CONTEXTS = {
      dialogue: {
        caption: "Screenplay · Scene 4 · Dialogue",
        suggested: [
          {
            id: "jump-next",
            group: "Jump to",
            scope: "goto",
            label: "MARA's next line (p. 7)",
            hint: "3 more lines",
            run: () => toastPal("Jumped to MARA's next line on page 7"),
          },
          {
            id: "dual",
            group: "Suggested here",
            scope: "commands",
            label: "Dual dialogue",
            hint: "⌘D",
            run: () => toastPal("Dual dialogue applied · Undo"),
          },
          {
            id: "rename",
            group: "Suggested here",
            scope: "commands",
            label: "Rename character…",
            hint: "Single undo",
            run: () =>
              toastPal(
                "Rename character updates cues, dialogue and action in one undo",
              ),
          },
        ],
      },
      book: {
        caption: "Book · Chapter 12 · Engine 3",
        suggested: [
          {
            id: "spread",
            group: "Suggested here",
            scope: "commands",
            label: "Export facing spreads (PDF / EPUB 3)",
            hint: "Whole book",
            run: () => jumpSection("#write-books"),
          },
          {
            id: "checks",
            group: "Suggested here",
            scope: "commands",
            label: "Open Book checks",
            hint: "Footnotes & targets",
            run: () =>
              toastPal(
                "Book checks: 0 empty footnotes, all chapters on target",
              ),
          },
          {
            id: "dropcap",
            group: "Suggested here",
            scope: "commands",
            label: "Toggle Drop cap on opening",
            hint: "Book Format Bar",
            run: () => jumpSection("#write-books"),
          },
        ],
      },
      locked: {
        caption: "Locked · Blue Revision",
        suggested: [
          {
            id: "issue",
            group: "Suggested here",
            scope: "commands",
            label: "Issue Blue…",
            hint: "14 pages revised",
            run: () => jumpSection("#revisions"),
          },
          {
            id: "sides",
            group: "Suggested here",
            scope: "commands",
            label: "Export Sides PDF…",
            hint: "Locked pages",
            run: () =>
              toastPal(
                "Sides PDF keeps locked page numbers with other scenes struck through",
              ),
          },
          {
            id: "omit",
            group: "Suggested here",
            scope: "commands",
            label: "Omit scene 18",
            hint: "Keeps number",
            run: () => toastPal("Scene 18 marked OMITTED — number preserved"),
          },
        ],
      },
      rundown: {
        caption: "News Rundown · Inside Air Window",
        suggested: [
          {
            id: "send-p",
            group: "Suggested here",
            scope: "commands",
            label: "Send story to prompter",
            hint: "Air window held",
            run: () => jumpSection("#write-news"),
          },
          {
            id: "take",
            group: "Suggested here",
            scope: "commands",
            label: "Take control of Prompter",
            hint: "Operator lease",
            run: () =>
              toastPal(
                "Operator lease active · Play / Pause / Slow-Fast ready",
              ),
          },
          {
            id: "rhist",
            group: "Suggested here",
            scope: "commands",
            label: "Open Rundown History",
            hint: "In the grid",
            run: () => jumpSection("#history"),
          },
        ],
      },
    };

    let ctxKey = "dialogue";
    let scope = "all";
    let selIdx = 0;
    let lastOpener = null;

    const toastPal = (msg) => {
      window.ManentMotion?.toast(msg, { tone: "info" });
    };
    const jumpSection = (hash) => {
      palDialog.close();
      const target = doc.querySelector(hash);
      if (target) target.scrollIntoView();
    };

    const buildRows = () => {
      let raw = input.value.trim();
      let effScope = scope;
      if (raw.startsWith(">")) {
        effScope = "commands";
        raw = raw.slice(1).trim();
      } else if (raw.startsWith(",")) {
        effScope = "settings";
        raw = raw.slice(1).trim();
      } else if (raw.startsWith("#")) {
        effScope = "goto";
        raw = raw.slice(1).trim();
      } else if (raw.startsWith("/")) {
        effScope = "scripts";
        raw = raw.slice(1).trim();
      }
      const q = raw.toLowerCase();

      const items = [
        ...CONTEXTS[ctxKey].suggested,
        {
          id: "set-dark",
          group: "Settings here",
          scope: "settings",
          label: "Dark mode (live on this page)",
          toggle: activeScheme === "dark",
          run: () => {
            setSiteTheme(
              activeScheme === "dark" ? "light" : "dark",
              null,
              palDialog,
            );
            renderPal();
          },
        },
        {
          id: "set-pal",
          group: "Settings here",
          scope: "settings",
          label: "Cycle Studio palette (live on this page)",
          hint: PALETTES.find((p) => p.id === activePalette)?.name || "Studio",
          run: () => {
            const idx = PALETTES.findIndex((p) => p.id === activePalette);
            const next = PALETTES[(idx + 1) % PALETTES.length];
            setSiteTheme(null, next.id, palDialog);
            renderPal();
          },
        },
        {
          id: "num-lines",
          group: "Settings here",
          scope: "settings",
          label: "Lines per page",
          hint: "Try typing: lines 52",
          keywords: "lines 52 54 55",
          run: (val) => toastPal(`Lines per page set to ${val || 54} · Undo`),
        },
        {
          id: "num-target",
          group: "Settings here",
          scope: "settings",
          label: "Target length",
          hint: "Try typing: target 110",
          keywords: "target 110 pages",
          run: (val) =>
            toastPal(`Target length set to ${val || 110} pages · Undo`),
        },
        {
          id: "go-offline",
          group: "Go to",
          scope: "goto",
          label: "Jump to: Never lose a word (Offline)",
          hint: "#never-lose",
          run: () => jumpSection("#never-lose"),
        },
        {
          id: "go-books",
          group: "Go to",
          scope: "goto",
          label: "Jump to: Book publishing (Engine 3)",
          hint: "#write-books",
          run: () => jumpSection("#write-books"),
        },
        {
          id: "go-compare",
          group: "Go to",
          scope: "goto",
          label: "Open: Compare 11 script tools",
          hint: "compare.html",
          run: () => (location.href = "compare.html"),
        },
        {
          id: "go-ds",
          group: "Go to",
          scope: "goto",
          label: "Open: Design system & 24 themes",
          hint: "design-system.html",
          run: () => (location.href = "design-system.html"),
        },
        {
          id: "scr-1",
          group: "Scripts",
          scope: "scripts",
          label: "The Long Night (Feature · Blue Rev.)",
          hint: "104 pp.",
          run: () => jumpSection("#revisions"),
        },
        {
          id: "scr-2",
          group: "Scripts",
          scope: "scripts",
          label: "The Salt Almanac (Book · Engine 3)",
          hint: "412 pp.",
          run: () => jumpSection("#write-books"),
        },
      ];

      // Power-user trailing numeric prefill (e.g. "lines 52", "target 110")
      const numMatch = /^(lines|target)\s+(\d+)$/i.exec(q);
      if (numMatch) {
        const [, kind, num] = numMatch;
        const isLines = kind.toLowerCase() === "lines";
        return [
          {
            id: "num-prefill",
            group: "Inline prompt",
            scope: "settings",
            label: isLines
              ? `Set Lines per page to ${num}`
              : `Set Target length to ${num} pages`,
            hint: "Press Enter · Undoable",
            run: () => {
              palDialog.close();
              toastPal(
                isLines
                  ? `Lines per page set to ${num} · Undo`
                  : `Target length set to ${num} pages · Undo`,
              );
            },
          },
        ];
      }

      // Exact page / scene jumps ("page 12", "scene 4")
      const jumpMatch = /^(page|p|scene|sc)\s+(\d+)$/i.exec(q);
      if (jumpMatch) {
        const [, kind, num] = jumpMatch;
        const label = /^p/i.test(kind)
          ? `Go to Page ${num}`
          : `Go to Scene ${num}`;
        return [
          {
            id: "exact-jump",
            group: "Go to",
            scope: "goto",
            label,
            hint: "Exact match",
            run: () => {
              palDialog.close();
              toastPal(`Jumped directly to ${label.slice(6)}`);
            },
          },
        ];
      }

      return items.filter((it) => {
        if (effScope !== "all" && it.scope !== effScope) return false;
        if (!q) return true;
        const hay =
          `${it.label} ${it.hint || ""} ${it.keywords || ""} ${it.group}`.toLowerCase();
        return q.split(/\s+/).every((part) => hay.includes(part));
      });
    };

    let currentRows = [];

    const renderPal = () => {
      for (const b of all("[data-pal-ctx]", palDialog))
        b.setAttribute("aria-pressed", String(b.dataset.palCtx === ctxKey));
      for (const b of all("[data-pal-scope]", palDialog))
        b.setAttribute("aria-selected", String(b.dataset.palScope === scope));
      currentRows = buildRows();
      if (selIdx >= currentRows.length) selIdx = 0;
      list.innerHTML = "";
      let lastGroup = "";
      currentRows.forEach((row, i) => {
        if (row.group !== lastGroup) {
          lastGroup = row.group;
          const g = doc.createElement("li");
          g.className = "pg-pal-group";
          g.setAttribute("role", "presentation");
          g.textContent = row.group;
          list.append(g);
        }
        const li = doc.createElement("li");
        li.id = `pg-pal-opt-${i}`;
        li.className = "pg-pal-item";
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === selIdx));
        const left = doc.createElement("span");
        left.textContent = row.label;
        const right = doc.createElement("span");
        right.className = "pg-pal-meta";
        if (typeof row.toggle === "boolean") {
          const pill = doc.createElement("span");
          pill.className = "pg-pal-pill";
          pill.dataset.on = String(row.toggle);
          pill.textContent = row.toggle ? "On" : "Off";
          right.append(pill);
        } else if (row.hint) {
          right.textContent = row.hint;
        }
        li.append(left, right);
        li.addEventListener("mouseenter", () => {
          selIdx = i;
          updatePalSelection();
        });
        li.addEventListener("click", () => row.run());
        list.append(li);
      });
      if (currentRows.length === 0) {
        const empty = doc.createElement("li");
        empty.className = "pg-pal-group";
        empty.textContent =
          "No matching commands — try 'lines 52', 'page 12', or 'dark'";
        list.append(empty);
      }
      updatePalSelection();
      status.textContent = `${CONTEXTS[ctxKey].caption} · ${currentRows.length} shown`;
    };

    const updatePalSelection = () => {
      const opts = all('[role="option"]', list);
      opts.forEach((el, i) =>
        el.setAttribute("aria-selected", String(i === selIdx)),
      );
      if (opts[selIdx]) {
        input.setAttribute("aria-activedescendant", opts[selIdx].id);
        opts[selIdx].scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    };

    const openPalette = (opener) => {
      lastOpener = opener || doc.activeElement;
      input.value = "";
      selIdx = 0;
      palDialog.showModal();
      renderPal();
      input.focus();
    };

    for (const op of openers)
      op.addEventListener("click", () => openPalette(op));
    closeBtn.addEventListener("click", () => palDialog.close());
    palDialog.addEventListener("click", (e) => {
      if (e.target === palDialog) palDialog.close();
    });
    palDialog.addEventListener("close", () => lastOpener?.focus?.());
    for (const b of all("[data-pal-ctx]", palDialog))
      b.addEventListener("click", () => {
        ctxKey = b.dataset.palCtx;
        selIdx = 0;
        renderPal();
      });
    for (const b of all("[data-pal-scope]", palDialog))
      b.addEventListener("click", () => {
        scope = b.dataset.palScope;
        selIdx = 0;
        renderPal();
      });
    input.addEventListener("input", () => {
      selIdx = 0;
      renderPal();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" && currentRows.length) {
        e.preventDefault();
        selIdx = (selIdx + 1) % currentRows.length;
        updatePalSelection();
      } else if (e.key === "ArrowUp" && currentRows.length) {
        e.preventDefault();
        selIdx = (selIdx - 1 + currentRows.length) % currentRows.length;
        updatePalSelection();
      } else if (e.key === "Enter" && currentRows[selIdx]) {
        e.preventDefault();
        currentRows[selIdx].run();
      } else if (e.key === "Tab") {
        e.preventDefault();
        const order = ["all", "commands", "settings", "goto", "scripts"];
        const i = order.indexOf(scope);
        scope = order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length];
        selIdx = 0;
        renderPal();
      }
    });
    doc.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (palDialog.open) palDialog.close();
        else openPalette(doc.activeElement);
      }
    });
  }

  // ---------- 10. Compare.html progressive filter & expand-notes toolbar ----------
  const cmpTools = doc.querySelector("[data-cmp-tools]");
  if (cmpTools) {
    cmpTools.hidden = false;
    const search = cmpTools.querySelector("[data-cmp-search]");
    const diffBtn = cmpTools.querySelector("[data-cmp-diff]");
    const countEl = cmpTools.querySelector("[data-cmp-count]");
    const tables = all(".compare-table");
    let diffOnly = false;

    const filterRows = () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      let total = 0;
      for (const table of tables) {
        const rows = all("tbody tr", table);
        for (const tr of rows) {
          total++;
          const hay = tr.textContent.toLowerCase();
          const matchText = !q || hay.includes(q);
          let matchDiff = true;
          if (diffOnly) {
            const marks = all("td summary[data-mark]", tr).map(
              (s) => s.dataset.mark,
            );
            const us = marks[0];
            const others = marks.slice(1);
            matchDiff = us === "yes" && others.some((m) => m !== "yes");
          }
          const visible = matchText && matchDiff;
          tr.hidden = !visible;
          if (visible) shown++;
        }
      }
      diffBtn.setAttribute("aria-pressed", String(diffOnly));
      countEl.textContent =
        shown === total
          ? `${total} feature rows across 5 categories`
          : `Showing ${shown} of ${total} rows`;
    };

    search.addEventListener("input", filterRows);
    diffBtn.addEventListener("click", () => {
      diffOnly = !diffOnly;
      filterRows();
    });

    for (const section of all("section.named")) {
      const sheet = section.querySelector(".sheet-table");
      if (!sheet) continue;
      const barWrap = doc.createElement("div");
      barWrap.className = "cmp-table-bar";
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "pg-pill-btn";
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "Show all notes in this table";
      btn.addEventListener("click", () => {
        const open = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", String(open));
        btn.textContent = open
          ? "Hide notes in this table"
          : "Show all notes in this table";
        for (const d of all("details.m-note", section)) d.open = open;
      });
      barWrap.append(btn);
      sheet.before(barWrap);
    }

    filterRows();
  }
})();
