// Manent site: Studio Instruments (Book Engine 3, Ink Play Beside, Revisions 12A),
// compact studio theme switcher, contextual ⌘K palette dialog, compare filter and scroll rail.
// Progressive enhancement only: zero external dependencies, strict CSP, full keyboard & reduced-motion parity.
(() => {
  const doc = document;
  const root = doc.documentElement;
  const all = (sel, ctx = doc) => [...ctx.querySelectorAll(sel)];
  const reduced = () =>
    root.dataset.motion === "reduce" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    matchMedia("(forced-colors: active)").matches;

  // ---------- 1. Subtle scroll-progress reading rail ----------
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

  // Close mobile nav drawer when a link is chosen or Escape is pressed
  for (const drawer of all(".nav-drawer")) {
    for (const link of all("a", drawer)) {
      link.addEventListener("click", () => {
        drawer.open = false;
      });
    }
    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.open) drawer.open = false;
    });
    doc.addEventListener("click", (e) => {
      if (drawer.open && !drawer.contains(e.target)) drawer.open = false;
    });
  }

  // ---------- 2. Compact Studio Theme & Polarity Switcher ----------
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
        d: "#121211",
        dd: "#1a1918",
        r: "#1f1d1a",
        p: "#2a2826",
        f: "#efece6",
        m: "#b8b2a7",
        ln: "#34322e",
        ls: "#6b665f",
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
        d: "#e8e3d9",
        dd: "#dcd5c8",
        r: "#f6f3ec",
        p: "#fdfbf6",
        f: "#1b1d21",
        m: "#52565e",
        ln: "#d4cec3",
        ls: "#857b6d",
        a: "#1a4875",
        s: "#dee8f2",
        oa: "#ffffff",
      },
      k: {
        d: "#0f141c",
        dd: "#0a0e14",
        r: "#151b26",
        p: "#232a36",
        f: "#efede6",
        m: "#adb5c4",
        ln: "#344054",
        ls: "#65748c",
        a: "#d8ca9c",
        s: "#24344c",
        oa: "#0f141c",
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

  let activeScheme = readStore(SCHEME_KEY) || "dark";
  let activePalette = readStore(PALETTE_KEY) || "newsdesk";
  if (!PALETTES.some((p) => p.id === activePalette)) activePalette = "newsdesk";

  const onThemeChangeListeners = [];

  const applyThemeTokens = () => {
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
    for (const fn of onThemeChangeListeners) fn();
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
    themeTrigger.title = `Theme: ${pal.name} (${activeScheme})`;
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

  // ---------- 3. Instrument 1: Book Engine 3 Studio (replaces static vignette in #write-books) ----------
  const bookRoot = doc.querySelector("[data-inst-book]");
  if (bookRoot) {
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
      letter: "US Letter",
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
        engine === "v3" ? "Chapter opening" : "Lund / The Salt Road / 187";
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
          ? `Engine 3 · Source Serif 4 · ${TRIM_LABELS[trim]} · ${view === "spread" ? "Facing spreads" : "Single page"}`
          : "Engine 2 · Courier Prime · US Letter manuscript";
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

  // ---------- 4. Instrument 2: Interactive Ink & Game Script Studio (replaces static vignette in #write-games) ----------
  const inkRoot = doc.querySelector("[data-inst-ink]");
  if (inkRoot) {
    const logEl = inkRoot.querySelector("[data-ink-log]");
    const choicesEl = inkRoot.querySelector("[data-ink-choices]");
    const varsEl = inkRoot.querySelector("[data-ink-vars]");
    const backBtn = inkRoot.querySelector("[data-ink-back]");
    const restartBtn = inkRoot.querySelector("[data-ink-restart]");
    const countEl = inkRoot.querySelector("[data-ink-visited]");
    const rows = all("[data-ink-line]", inkRoot);

    const NODES = {
      start: {
        line: 3,
        text: "The lamp gutters on the harbour sill. The watch log lies open beside the brass bell.",
        choices: [
          {
            label: "Trim the wick",
            gate: (s) => s.oil > 0,
            gateHint: "{oil > 0}",
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
        text: "A single brass stroke carries into the fog. A moment later, a distant foghorn answers twice.",
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
      if (countEl) countEl.textContent = `${s.visited.length} lines visited`;
      choicesEl.innerHTML = "";
      def.choices.forEach((c, idx) => {
        const allowed = c.gate ? c.gate(s) : true;
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "inst-choice-btn";
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
        const item = doc.createElement("span");
        item.className = "inst-var-item";
        if (s.flash === k) item.dataset.flash = "true";
        item.textContent = `${k}=${v}`;
        varsEl.append(item);
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

  // ---------- 5. Instrument 3: Locked Page & Revision Colour Studio (sole stage in #revisions) ----------
  const revRoot = doc.querySelector("[data-inst-rev]");
  const colourList = doc.querySelector(".colours[data-rev-chips]");
  if (revRoot && colourList) {
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
    const banner = revRoot.querySelector("[data-rev-banner]");
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
      btn.className = "inst-rev-chip";
      btn.setAttribute("role", "radio");
      btn.dataset.revId = r.id;
      const dot = doc.createElement("span");
      dot.className = "inst-rev-swatch";
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
      if (banner)
        banner.textContent = `The Long Night · ${activeRev.name.toUpperCase()} revision · ${overflow ? "14" : "13"} pages revised`;
      head12.textContent = overflow ? stamp : "White Production Draft";
      head12a.textContent = stamp;
      addedLine.hidden = !overflow;
      sheet12a.hidden = !overflow;
      toggleBtn.setAttribute("aria-pressed", String(overflow));
      toggleBtn.textContent = overflow ? "Undo added line" : "Add line → 12A";
      for (const s of [sheet12, sheet12a]) {
        s.style.setProperty("--rev-edge", activeRev.edge);
        if (dark) s.style.removeProperty("--rev-bg");
        else
          s.style.setProperty("--rev-bg", overflow ? activeRev.bg : "#ffffff");
      }
      readout.textContent = overflow
        ? `Page 12 · ${activeRev.name} → overflow pushed to 12A`
        : "Undone · Asterisk cleared, 12A removed";
    };

    toggleBtn.addEventListener("click", () => {
      overflow = !overflow;
      renderRev();
    });
    onThemeChangeListeners.push(renderRev);
    renderRev();
  }

  // ---------- 6. Instrument 4: Dedicated Version History & Minimap Studio ----------
  const histRoot = doc.querySelector("[data-inst-hist]");
  if (histRoot) {
    const mapEl = histRoot.querySelector("[data-hist-map]");
    const splitEl = histRoot.querySelector("[data-hist-split]");
    const listEl = histRoot.querySelector("[data-hist-list]");
    const restoreBtn = histRoot.querySelector("[data-hist-restore]");
    const readout = histRoot.querySelector("[data-hist-readout]");

    const BASE_SNAPS = [
      {
        id: "working",
        title: "Working draft",
        meta: "You · Today 14:10",
        changes: 0,
        map: [0, 0, 0, 0, 0, 0, 0, 0],
        asWas: [
          { cls: "inst-hist-sh", text: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            text: "IDA folds the tide table and puts it away. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", text: "MAREN" },
          {
            cls: "inst-hist-di",
            text: "Nobody's logged a crossing since the fog came in.",
          },
          { cls: "inst-hist-ch", text: "IDA" },
          {
            cls: "inst-hist-di",
            text: "Then I'll be the first. Cast off when I say.",
          },
        ],
        diff: [
          { cls: "inst-hist-sh", html: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            html: "IDA folds the tide table and puts it away. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", html: "MAREN" },
          {
            cls: "inst-hist-di",
            html: "Nobody's logged a crossing since the fog came in.",
          },
          { cls: "inst-hist-ch", html: "IDA" },
          {
            cls: "inst-hist-di",
            html: "Then I'll be the first. Cast off when I say.",
          },
        ],
      },
      {
        id: "1140",
        title: "Today 11:40",
        meta: "DR, SO · 1 change · 1 scene",
        changes: 1,
        removed: 0,
        added: 1,
        map: [0, 0, 0, 0, 1, 0, 0, 0],
        asWas: [
          { cls: "inst-hist-sh", text: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            text: "IDA folds the tide table and puts it away. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", text: "MAREN" },
          {
            cls: "inst-hist-di",
            text: "Nobody's logged a crossing since the fog came in.",
          },
          { cls: "inst-hist-ch", text: "IDA" },
          { cls: "inst-hist-di", text: "Then I'll be the first." },
        ],
        sideLeft: [
          { cls: "inst-hist-sh", html: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            html: "IDA folds the tide table and puts it away. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", html: "MAREN" },
          {
            cls: "inst-hist-di",
            html: "Nobody's logged a crossing since the fog came in.",
          },
          { cls: "inst-hist-ch", html: "IDA" },
          { cls: "inst-hist-di", html: "Then I'll be the first." },
        ],
        sideRight: [
          { cls: "inst-hist-sh", html: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            html: "IDA folds the tide table and puts it away. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", html: "MAREN" },
          {
            cls: "inst-hist-di",
            html: "Nobody's logged a crossing since the fog came in.",
          },
          { cls: "inst-hist-ch", html: "IDA" },
          {
            cls: "inst-hist-di",
            diff: "add",
            html: "Then I'll be the first. <ins>Cast off when I say.</ins>",
          },
        ],
        diff: [
          { cls: "inst-hist-sh", html: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            html: "IDA folds the tide table and puts it away. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", html: "MAREN" },
          {
            cls: "inst-hist-di",
            html: "Nobody's logged a crossing since the fog came in.",
          },
          { cls: "inst-hist-ch", html: "IDA" },
          {
            cls: "inst-hist-di",
            diff: "add",
            html: "Then I'll be the first. <ins>Cast off when I say.</ins>",
          },
        ],
      },
      {
        id: "0902",
        title: "Today 09:02",
        meta: "SO · 2 changes · 2 scenes",
        changes: 2,
        removed: 0,
        added: 2,
        map: [0, 1, 0, 1, 2, 0, 0, 0],
        asWas: [
          { cls: "inst-hist-sh", text: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            text: "IDA folds the tide table. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", text: "MAREN" },
          {
            cls: "inst-hist-di",
            text: "Nobody's logged a crossing since the fog came in.",
          },
          { cls: "inst-hist-ch", text: "IDA" },
          { cls: "inst-hist-di", text: "Then I'll be the first." },
        ],
        sideLeft: [
          { cls: "inst-hist-sh", html: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            html: "IDA folds the tide table. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", html: "MAREN" },
          {
            cls: "inst-hist-di",
            html: "Nobody's logged a crossing since the fog came in.",
          },
          { cls: "inst-hist-ch", html: "IDA" },
          { cls: "inst-hist-di", html: "Then I'll be the first." },
        ],
        sideRight: [
          { cls: "inst-hist-sh", html: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            diff: "add",
            html: "IDA folds the tide table <ins>and puts it away</ins>. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", html: "MAREN" },
          {
            cls: "inst-hist-di",
            html: "Nobody's logged a crossing since the fog came in.",
          },
          { cls: "inst-hist-ch", html: "IDA" },
          {
            cls: "inst-hist-di",
            diff: "add",
            html: "Then I'll be the first. <ins>Cast off when I say.</ins>",
          },
        ],
        diff: [
          { cls: "inst-hist-sh", html: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            diff: "add",
            html: "IDA folds the tide table <ins>and puts it away</ins>. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", html: "MAREN" },
          {
            cls: "inst-hist-di",
            html: "Nobody's logged a crossing since the fog came in.",
          },
          { cls: "inst-hist-ch", html: "IDA" },
          {
            cls: "inst-hist-di",
            diff: "add",
            html: "Then I'll be the first. <ins>Cast off when I say.</ins>",
          },
        ],
      },
      {
        id: "studio",
        title: "★ Studio",
        meta: "Named by Dana · Mon 16 Nov",
        changes: 4,
        removed: 1,
        added: 3,
        map: [1, 1, 0, 2, 2, 1, 0, 1],
        asWas: [
          { cls: "inst-hist-sh", text: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            text: "IDA folds the tide table. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", text: "MAREN" },
          {
            cls: "inst-hist-di",
            text: "No one has crossed since the fog.",
          },
          { cls: "inst-hist-ch", text: "IDA" },
          { cls: "inst-hist-di", text: "Then I'll be the first." },
        ],
        sideLeft: [
          { cls: "inst-hist-sh", html: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            html: "IDA folds the tide table. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", html: "MAREN" },
          {
            cls: "inst-hist-di",
            diff: "del",
            html: "<del>No one has crossed since the fog.</del>",
          },
          { cls: "inst-hist-ch", html: "IDA" },
          { cls: "inst-hist-di", html: "Then I'll be the first." },
        ],
        sideRight: [
          { cls: "inst-hist-sh", html: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            diff: "add",
            html: "IDA folds the tide table <ins>and puts it away</ins>. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", html: "MAREN" },
          {
            cls: "inst-hist-di",
            diff: "add",
            html: "<ins>Nobody's logged a crossing since the fog came in.</ins>",
          },
          { cls: "inst-hist-ch", html: "IDA" },
          {
            cls: "inst-hist-di",
            diff: "add",
            html: "Then I'll be the first. <ins>Cast off when I say.</ins>",
          },
        ],
        diff: [
          { cls: "inst-hist-sh", html: "18 EXT. EAST CHANNEL - NIGHT" },
          {
            cls: "",
            diff: "add",
            html: "IDA folds the tide table <ins>and puts it away</ins>. The fog sits low along the slip.",
          },
          { cls: "inst-hist-ch", html: "MAREN" },
          {
            cls: "inst-hist-di",
            diff: "del",
            html: "<del>No one has crossed since the fog.</del> <ins>Nobody's logged a crossing since the fog came in.</ins>",
          },
          { cls: "inst-hist-ch", html: "IDA" },
          {
            cls: "inst-hist-di",
            diff: "add",
            html: "Then I'll be the first. <ins>Cast off when I say.</ins>",
          },
        ],
      },
    ];

    let activeId = "studio";
    let mode = "page";
    let restoredFrom = null;

    const makeSheet = (tagLeft, tagRight, lines, isHtml, statTone) => {
      const sheet = doc.createElement("div");
      sheet.className = "inst-hist-sheet";
      const tag = doc.createElement("div");
      tag.className = "inst-hist-sheet-tag";
      const l = doc.createElement("span");
      l.textContent = tagLeft;
      const r = doc.createElement("span");
      if (statTone) {
        r.className = "inst-diff-stat";
        r.dataset.tone = statTone;
      }
      r.textContent = tagRight;
      tag.append(l, r);
      sheet.append(tag);
      for (const line of lines) {
        const p = doc.createElement("p");
        if (line.cls) p.className = line.cls;
        if (line.diff) p.dataset.diff = line.diff;
        if (isHtml) p.innerHTML = line.html;
        else p.textContent = line.text;
        sheet.append(p);
      }
      return sheet;
    };

    const renderHist = () => {
      const snap = BASE_SNAPS.find((s) => s.id === activeId) || BASE_SNAPS[3];
      for (const b of all("[data-hist-mode]", histRoot))
        b.setAttribute("aria-pressed", String(b.dataset.histMode === mode));

      // Minimap
      mapEl.innerHTML = '<span class="inst-map-label">Map</span>';
      snap.map.forEach((level, idx) => {
        const cell = doc.createElement("div");
        cell.className = "inst-map-scene";
        if (idx === 4) cell.dataset.active = "true";
        const b1 = doc.createElement("span");
        b1.className = "inst-map-bar";
        if (level >= 1) b1.dataset.change = "add";
        const b2 = doc.createElement("span");
        b2.className = "inst-map-bar";
        if (level >= 2) b2.dataset.change = "del";
        cell.append(b1, b2);
        mapEl.append(cell);
      });

      // Script sheet(s)
      splitEl.dataset.mode = mode;
      splitEl.innerHTML = "";
      if (mode === "page") {
        splitEl.append(
          makeSheet(
            snap.id === "working"
              ? "Working draft"
              : `Changes since ${snap.title}`,
            "Page 12 · Scene 18",
            snap.diff,
            true,
          ),
        );
      } else if (mode === "side") {
        const compareSnap = snap.id === "working" ? BASE_SNAPS[1] : snap;
        splitEl.append(
          makeSheet(
            compareSnap.title,
            compareSnap.removed
              ? `−${compareSnap.removed} removed`
              : "Snapshot",
            compareSnap.sideLeft,
            true,
            compareSnap.removed ? "del" : null,
          ),
          makeSheet(
            "Working draft",
            `+${compareSnap.added} added`,
            compareSnap.sideRight,
            true,
            "add",
          ),
        );
      } else {
        splitEl.append(
          makeSheet(snap.title, "As it was · Read-only", snap.asWas, false),
        );
      }

      // Timeline list
      listEl.innerHTML = "";
      const entries = restoredFrom
        ? [
            {
              id: "before-restore",
              title: "Before restore",
              meta: "Auto-saved · 14:10",
            },
            ...BASE_SNAPS,
          ]
        : BASE_SNAPS;
      for (const item of entries) {
        const li = doc.createElement("li");
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "inst-hist-snap";
        const targetId = item.id === "before-restore" ? "working" : item.id;
        btn.setAttribute("aria-current", String(targetId === activeId));
        const st = doc.createElement("strong");
        st.textContent = item.title;
        const sm = doc.createElement("small");
        sm.textContent = item.meta;
        btn.append(st, sm);
        btn.addEventListener("click", () => {
          activeId = targetId;
          renderHist();
        });
        li.append(btn);
        listEl.append(li);
      }

      restoreBtn.disabled = activeId === "working" && !restoredFrom;
      restoreBtn.textContent = restoredFrom
        ? "Undo restore ('Before restore')"
        : `Restore ${snap.title}`;

      readout.textContent = restoredFrom
        ? `Restored '${restoredFrom}' · Previous draft saved as 'Before restore'`
        : snap.id === "working"
          ? "Viewing current working draft · Pick any snapshot to compare"
          : `Comparing against ${snap.title} · ${snap.changes} changes across script`;
    };

    for (const b of all("[data-hist-mode]", histRoot))
      b.addEventListener("click", () => {
        mode = b.dataset.histMode;
        renderHist();
      });

    restoreBtn.addEventListener("click", () => {
      if (restoredFrom) {
        restoredFrom = null;
      } else {
        const snap = BASE_SNAPS.find((s) => s.id === activeId);
        if (snap && snap.id !== "working") restoredFrom = snap.title;
      }
      renderHist();
    });

    renderHist();
  }

  // ---------- 7. Instrument 5: Import & Export Format Studio ----------
  const filesRoot = doc.querySelector("[data-inst-files]");
  if (filesRoot) {
    const extEl = filesRoot.querySelector("[data-file-ext]");
    const checksEl = filesRoot.querySelector("[data-file-checks]");
    const sheetEl = filesRoot.querySelector("[data-file-sheet]");
    const readout = filesRoot.querySelector("[data-file-readout]");

    const SAMPLES = {
      fdx: {
        ext: "FDX",
        kind: "script",
        checks: [
          { tone: "ok", text: "Scene numbers & dual dialogue" },
          { tone: "ok", text: "Revision marks & notes kept" },
          { tone: "ok", text: "Page count matches (58 pp.)" },
        ],
        receipt:
          "Imported 58 pages, 41 scenes and 6 notes · Revision marks kept",
        lines: [
          { cls: "inst-hist-sh", text: "14 INT. TERMINAL OFFICE - DAY" },
          {
            cls: "",
            text: "Timetables pinned three deep. A kettle ticks as it cools. MAREN reads a letter twice, then folds it into her coat.",
          },
          { cls: "inst-hist-ch", text: "MAREN" },
          {
            cls: "inst-hist-di",
            text: "They want the licence back by Friday. If we miss the morning boat, the berth goes to the harbour board.",
          },
        ],
      },
      fountain: {
        ext: "FOUNTAIN",
        kind: "script",
        checks: [
          { tone: "ok", text: "Title page & boneyard notes" },
          { tone: "ok", text: "Clean Fountain round-trip" },
          { tone: "ok", text: "31 pages · 22 scenes" },
        ],
        receipt: "Imported 31 pages, 22 scenes and 2 notes · Offline",
        lines: [
          { cls: "inst-hist-sh", text: "INT. LAMP ROOM - NIGHT" },
          {
            cls: "",
            text: "The lens turns on its bath of mercury. Every eleven seconds the beam crosses the wall and is gone.",
          },
          { cls: "inst-hist-ch", text: "ELSPETH" },
          {
            cls: "inst-hist-di",
            text: "Count it with me. One, and two, and three. Keep your hand off the brass.",
          },
        ],
      },
      docx: {
        ext: "DOCX",
        kind: "script",
        checks: [
          { tone: "ok", text: "Script elements recognised" },
          { tone: "ok", text: "Emphasis & footnotes kept" },
          { tone: "note", text: "Page count: 47 pp. (45 pp. in Word)" },
        ],
        receipt:
          "Imported 47 pages, 33 scenes from Word · Page count differs by 2",
        lines: [
          { cls: "inst-hist-sh", text: "EXT. HARBOUR MOUTH - DAWN" },
          {
            cls: "",
            text: "Flat water. The tide stands still between going and coming, and every boat on the slip waits for the turn.",
          },
          { cls: "inst-hist-ch", text: "ARNE" },
          {
            cls: "inst-hist-di",
            text: "Twenty minutes of slack. Then she's yours to take past the bar.",
          },
        ],
      },
      md: {
        ext: "MARKDOWN",
        kind: "book",
        checks: [
          { tone: "ok", text: "Chapters, epigraphs & footnotes" },
          { tone: "ok", text: "Opened as Book project (Engine 3)" },
          { tone: "ok", text: "Lossless .md round-trip" },
        ],
        receipt:
          "Imported 14 chapters, 18 footnotes into Book layout · Offline",
        lines: [
          { cls: "inst-book-chap", text: "Chapter Four · Slack Water" },
          {
            cls: "",
            text: "By four o'clock the barometer had dropped six millibars, and the ferry master locked the ticket hutch before the first gusts reached the breakwater.",
          },
          {
            cls: "",
            text: "She carried the brass logbook under her oilskin and took the steep stone steps two at a time.",
          },
        ],
      },
      fdr: {
        ext: "FDR",
        kind: "notice",
        checks: [
          { tone: "note", text: "Older binary Final Draft format" },
          {
            tone: "ok",
            text: "Recognised immediately — nothing silently dropped",
          },
        ],
        receipt:
          "Recognised legacy .fdr · Save as .fdx in Final Draft 8+ to import cleanly",
        lines: [
          {
            cls: "",
            text: "Manent recognises older Final Draft (.fdr) files straight away rather than opening garbled text.",
          },
          {
            cls: "",
            text: "In Final Draft 8 or later, choose File → Save As → Final Draft Script (.fdx), then drop the .fdx file here to bring across every scene, note and revision mark offline.",
          },
        ],
      },
    };

    let activeFile = "fdx";

    const renderFile = () => {
      const s = SAMPLES[activeFile] || SAMPLES.fdx;
      for (const b of all("[data-file-sample]", filesRoot))
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.fileSample === activeFile),
        );
      extEl.textContent = s.ext;
      checksEl.innerHTML = "";
      for (const c of s.checks) {
        const li = doc.createElement("li");
        li.dataset.tone = c.tone;
        li.textContent = c.text;
        checksEl.append(li);
      }
      sheetEl.dataset.kind = s.kind;
      sheetEl.innerHTML = "";
      for (const line of s.lines) {
        const p = doc.createElement("p");
        if (line.cls) p.className = line.cls;
        p.textContent = line.text;
        sheetEl.append(p);
      }
      readout.textContent = s.receipt;
    };

    for (const b of all("[data-file-sample]", filesRoot))
      b.addEventListener("click", () => {
        activeFile = b.dataset.fileSample;
        renderFile();
      });

    renderFile();
  }

  // ---------- 8. Contextual ⌘K Command Palette Dialog ----------
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
          label: "Dark mode",
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
          label: "Cycle Studio palette",
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
          hint: "Try: lines 52",
          keywords: "lines 52 54 55",
          run: (val) => toastPal(`Lines per page set to ${val || 54} · Undo`),
        },
        {
          id: "num-target",
          group: "Settings here",
          scope: "settings",
          label: "Target length",
          hint: "Try: target 110",
          keywords: "target 110 pages",
          run: (val) =>
            toastPal(`Target length set to ${val || 110} pages · Undo`),
        },
        {
          id: "go-compare",
          group: "Go to",
          scope: "goto",
          label: "Compare 11 script tools",
          hint: "compare.html",
          run: () => (location.href = "compare.html"),
        },
        {
          id: "go-ds",
          group: "Go to",
          scope: "goto",
          label: "Design system & 24 studio themes",
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
          label: "The Salt Road (Book · Engine 3)",
          hint: "412 pp.",
          run: () => jumpSection("#write-books"),
        },
      ];

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
            hint: "Enter · Undoable",
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
        left.className = "pg-pal-label";
        left.textContent = row.label;
        const right = doc.createElement("span");
        right.className = "pg-pal-meta";
        if (typeof row.toggle === "boolean") {
          const sw = doc.createElement("span");
          sw.className = "pg-pal-switch";
          sw.dataset.on = String(row.toggle);
          const lbl = doc.createElement("span");
          lbl.textContent = row.toggle ? "On" : "Off";
          const track = doc.createElement("span");
          track.className = "pg-pal-track";
          track.setAttribute("aria-hidden", "true");
          sw.append(lbl, track);
          right.append(sw);
        } else if (row.hint) {
          if (/^(⌘|Ctrl|Enter\b)/i.test(row.hint)) {
            const k = doc.createElement("kbd");
            k.textContent = row.hint;
            right.append(k);
          } else {
            right.textContent = row.hint;
          }
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
    onThemeChangeListeners.push(() => {
      if (palDialog.open) renderPal();
    });
  }

  // ---------- 7. compare.html static filter bar & quiet section-head note toggles ----------
  const cmpBar = doc.querySelector("[data-cmp-bar]");
  if (cmpBar) {
    cmpBar.hidden = false;
    const search = cmpBar.querySelector("[data-cmp-search]");
    const diffBtn = cmpBar.querySelector("[data-cmp-diff]");
    const countEl = cmpBar.querySelector("[data-cmp-count]");
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
          ? `${total} rows across 5 categories`
          : `Showing ${shown} of ${total} rows`;
    };

    search.addEventListener("input", filterRows);
    diffBtn.addEventListener("click", () => {
      diffOnly = !diffOnly;
      filterRows();
    });

    for (const section of all("section.named")) {
      const head = section.querySelector(".section-head");
      if (!head) continue;
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "cmp-notes-toggle";
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "Expand all notes in this table";
      btn.addEventListener("click", () => {
        const open = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", String(open));
        btn.textContent = open
          ? "Collapse notes in this table"
          : "Expand all notes in this table";
        for (const d of all("details.m-note", section)) d.open = open;
      });
      head.append(btn);
    }

    filterRows();
  }
})();
