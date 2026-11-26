// Manent site motion: the pause control, reveal, tab indicator, top bar, copy, toast, notes, count-up and vignettes.
// Without this script the page reads and works in full; with reduced motion nothing moves.
(() => {
  const doc = document;
  const root = doc.documentElement;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  // no movement at all: the system asks for it, or the page is told so
  const reduced = () => media.matches || root.dataset.motion === "reduce";
  // no loops: the visitor paused them, or motion is reduced and they have not asked to play
  const still = () => root.dataset.motion !== "play";
  const all = (selector) => doc.querySelectorAll(selector);
  const make = (tag, className) =>
    Object.assign(doc.createElement(tag), { className });
  const on = (type, handler, capture) =>
    doc.addEventListener(type, handler, capture);
  const watch = (callback, options) =>
    new IntersectionObserver((entries) => entries.forEach(callback), options);

  // ---------- the pause control: <html data-motion="play|paused">, the visitor's choice remembered ----------
  const KEY = "manent.site.motion";

  const chosen = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null; // storage can be blocked; the system's setting decides
    }
  };

  const remember = (state) => {
    try {
      localStorage.setItem(KEY, state);
    } catch {
      // remembering the choice is a convenience only
    }
  };

  const show = () => {
    if (root.dataset.motion === "reduce") return;
    const state = chosen();
    root.dataset.motion =
      state === "play" || state === "paused"
        ? state
        : media.matches
          ? "paused"
          : "play";
  };

  const toggles = () => {
    all("[data-motion-toggle]").forEach((button) => {
      button.hidden = false;
      button.setAttribute("aria-pressed", String(still()));
    });
  };

  // ---------- scroll reveal ----------
  // .m-js, which lets the CSS hide what has not been revealed, waits for the first report,
  // so whatever is already on screen is revealed before it could blink out and back
  const revealer = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      target.classList.add("is-revealed");
      revealer.unobserve(target);
    });
    root.classList.add("m-js");
  });

  // a staggered group arrives within four steps, however many children it has
  const reveal = (el) => {
    if (el.dataset.reveal === "stagger")
      [...el.children].forEach((child, n) =>
        child.style.setProperty("--m-i", Math.min(n, 3)),
      );
    revealer.observe(el);
  };

  // ---------- tabs: a sliding indicator under the chosen tab, and the new panel fading in ----------
  const tabs = (list) => {
    const bar = make("span", "m-tab-indicator");
    list.prepend(bar);
    list.classList.add("is-indicated");

    const place = () => {
      const tab = list.querySelector('[aria-selected="true"]');
      if (!tab) return;
      // the bar is 100px wide and scaled to the tab, so the slide moves only a transform
      bar.style.cssText = `--m-ind-x:${tab.offsetLeft}px;--m-ind-y:${tab.offsetTop}px;--m-ind-s:${tab.offsetWidth / 100}`;
      // the first position is a jump, not a slide from zero
      void bar.offsetWidth;
      bar.classList.add("is-placed");
    };

    new MutationObserver((changes) => {
      place();
      changes.forEach(({ target }) => {
        const panel =
          target.ariaSelected === "true" &&
          doc.getElementById(target.getAttribute("aria-controls"));
        if (!panel) return;
        panel.classList.remove("m-panel-in");
        void panel.offsetWidth; // restarts the animation
        panel.classList.add("m-panel-in");
      });
    }).observe(list, { subtree: true, attributeFilter: ["aria-selected"] });
    new ResizeObserver(place).observe(list);
    doc.fonts?.ready.then(place);
  };

  // ---------- top bar: data-scrolled once the page has left its top ----------
  const topbar = (bar) => {
    const probe = make("div", "");
    probe.style.cssText = "position:absolute;top:0;height:8px;width:1px";
    doc.body.prepend(probe);
    watch(({ isIntersecting }) =>
      bar.toggleAttribute("data-scrolled", !isIntersecting),
    ).observe(probe);
  };

  // ---------- toast ----------
  const toaster = make("div", "m-toaster");
  toaster.role = "status";
  const ICONS = { ok: "check", info: "info", problem: "circle-alert" };

  const toast = (text, { tone = "ok", icon = ICONS[tone] } = {}) => {
    const item = make("div", "m-toast");
    item.dataset.tone = tone;
    item.innerHTML = `<svg class="m-icon" aria-hidden="true"><use href="${root.dataset.mSprite ?? "icons.svg"}#i-${icon}"/></svg>`;
    item.append(text);
    toaster.append(item);
    if (toaster.children.length > 3) toaster.firstChild.remove();
    setTimeout(() => {
      item.classList.add("is-leaving");
      setTimeout(() => item.remove(), 400);
    }, 3600);
  };

  // ---------- copy to clipboard ----------
  const resets = new WeakMap();

  const copy = async (button) => {
    const scope = button.closest("[data-copy-scope]") || button.parentNode;
    const said = scope.querySelector("[data-copy-said]");
    const { copy: target, copyText } = button.dataset;
    const source = target
      ? doc.querySelector(target)
      : scope.querySelector("[data-copy-source]");

    const tell = (state, message, wait) => {
      clearTimeout(resets.get(button));
      button.dataset.state = state;
      if (said) said.textContent = message;
      else toast(message, { tone: state === "done" ? "ok" : "problem" });
      resets.set(
        button,
        setTimeout(() => {
          delete button.dataset.state;
          if (said) said.textContent = "";
        }, wait),
      );
    };

    const slow = setTimeout(() => (button.dataset.state = "busy"), 150);
    try {
      const text = copyText ?? source?.textContent.trim();
      if (!text) throw Error("nothing to copy");
      await navigator.clipboard.writeText(text);
      tell("done", "Copied", 2500);
    } catch {
      // no clipboard access (blocked, or an insecure page): select the words so a key press copies them
      if (source) getSelection().selectAllChildren(source);
      tell(
        "problem",
        source ? "Selected: press Ctrl+C or ⌘C to copy" : "Could not copy",
        6000,
      );
    }
    clearTimeout(slow);
  };

  // ---------- count-up, only on numbers marked data-count-to ----------
  const counting = new Map();

  const settle = (el) => {
    const { final, spoken } = counting.get(el);
    counting.delete(el);
    counter.unobserve(el);
    spoken.remove();
    el.textContent = final;
    el.removeAttribute("aria-hidden");
    el.style.minWidth = "";
  };

  const counter = watch(
    ({ isIntersecting, target }) => {
      const job = counting.get(target);
      if (!isIntersecting || !job || job.start) return;
      job.start = performance.now();
      const duration =
        parseFloat(getComputedStyle(root).getPropertyValue("--m-dur-count")) ||
        900;
      const step = (now) => {
        if (!counting.has(target)) return;
        const t = Math.min(1, (now - job.start) / duration);
        if (t === 1) return settle(target);
        target.textContent = job.format(job.to * (1 - (1 - t) ** 3));
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    { threshold: 0.5 },
  );

  const count = (el) => {
    const to = parseFloat(el.dataset.countTo);
    if (reduced() || Number.isNaN(to)) return;
    const digits = +el.dataset.countDecimals || 0;
    const { format } = new Intl.NumberFormat(root.lang || undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    // screen readers get the final number at once; the counting digits are for the eye only
    const spoken = make("span", "m-sr");
    const final = (spoken.textContent = el.textContent);
    el.style.minWidth = el.offsetWidth + "px";
    counting.set(el, { to, format, final, spoken });
    el.after(spoken);
    el.setAttribute("aria-hidden", "true");
    el.textContent = format(0);
    counter.observe(el);
  };

  // ---------- vignettes: .is-playing and vignette:start / vignette:stop only while on screen and not paused ----------
  const vignettes = new Map();

  const play = (el) => {
    const playing = vignettes.get(el) && !still() && !doc.hidden;
    if (el.classList.contains("is-playing") === playing) return;
    el.classList.toggle("is-playing", playing);
    el.dispatchEvent(new Event(playing ? "vignette:start" : "vignette:stop"));
  };

  const viewer = watch(
    ({ isIntersecting, target }) => {
      vignettes.set(target, isIntersecting);
      play(target);
    },
    { rootMargin: "80px" },
  );

  const sync = () => {
    toggles();
    vignettes.forEach((_, el) => play(el));
    if (reduced()) counting.forEach((_, el) => settle(el));
  };

  // ---------- notes and tooltips: Escape, outside clicks, one note open at a time ----------
  const closeNotes = (except) =>
    all(".m-note[open]").forEach((note) => (note.open = note === except));

  const undismiss = ({ target, relatedTarget }) => {
    const tip = target.closest?.(".m-tip[data-dismissed]");
    if (tip && !tip.contains(relatedTarget)) delete tip.dataset.dismissed;
  };

  const listen = () => {
    on("click", ({ target }) => {
      const button = target.closest("[data-copy], [data-copy-text]");
      if (button) copy(button);
      const toggle = target.closest("[data-motion-toggle]");
      if (toggle) {
        const state = still() ? "play" : "paused";
        remember(state);
        root.dataset.motion = state;
      }
      if (!target.closest(".m-note")) closeNotes();
    });
    on(
      "toggle",
      ({ target }) =>
        target.open && target.matches(".m-note") && closeNotes(target),
      true,
    );
    on("keydown", ({ key }) => {
      if (key !== "Escape") return;
      all(".m-tip:is(:hover, :focus-within)").forEach(
        (tip) => (tip.dataset.dismissed = ""),
      );
      const note = doc.activeElement.closest(".m-note[open]");
      closeNotes();
      note?.querySelector("summary").focus();
    });
    on("mouseout", undismiss);
    on("focusout", undismiss);
    on("visibilitychange", sync);
    // until the visitor chooses, the system's setting decides
    media.addEventListener("change", () => {
      show();
      sync();
    });
    new MutationObserver(sync).observe(root, {
      attributeFilter: ["data-motion"],
    });
  };

  // ---------- start ----------
  const start = () => {
    doc.body.append(toaster);
    listen();
    toggles();
    all("[data-reveal]").forEach(reveal);
    all("[data-tab-indicator]").forEach(tabs);
    all("[data-topbar]").forEach(topbar);
    all("[data-copy][hidden]").forEach((button) => (button.hidden = false));
    all("[data-count-to]").forEach(count);
    all("[data-vignette]").forEach((el) => viewer.observe(el));
  };

  // set at once, before vignettes.js and site.js read it
  show();
  window.ManentMotion = { toast, reduced, still };
  if (doc.readyState === "loading") on("DOMContentLoaded", start);
  else start();
})();
