// Without this script the page still reads in full; it points Download at the visitor's system, opens the
// recording in a dialog, lets a phone send the page on, marks the part of a long page in view and switches the
// audience tabs. Each part acts only on the pages that have its elements.
(() => {
  // ---------- Download: the file for the visitor's system ----------
  // Flip DIRECT_DOWNLOADS to true once the first stable GitHub Release publishes the unversioned
  // aliases from .github/workflows/release.yml. While false (or when an architecture has no direct
  // installer), visitors land on the releases page instead of a dead link.
  const RELEASES = "https://github.com/HMarzban/manent/releases";
  const DIRECT_DOWNLOADS = false;
  const SYSTEMS = [
    {
      key: "mac",
      name: "Mac",
      files: { arm: "Manent-macos-arm64.dmg", x86: "Manent-macos-x64.dmg" },
      pattern: /mac/i,
    },
    {
      key: "windows",
      name: "Windows",
      files: { x86: "Manent-windows-x64-setup.zip" },
      defaultFile: "Manent-windows-x64-setup.zip",
      pattern: /win/i,
    },
    {
      key: "linux",
      name: "Linux",
      files: { x86: "Manent-linux-x64.tar.gz" },
      defaultFile: "Manent-linux-x64.tar.gz",
      pattern: /linux|x11|cros/i,
    },
  ];
  const fileFor = (system, arch) => {
    if (!DIRECT_DOWNLOADS || !system) return RELEASES;
    const file = (arch && system.files?.[arch]) || system.defaultFile;
    return file ? `${RELEASES}/latest/download/${file}` : `${RELEASES}/latest`;
  };

  const platform =
    navigator.userAgentData?.platform || navigator.platform || "";
  // an iPad asks for the desktop site and calls itself a Mac, but it has a touch screen
  const handheld =
    navigator.userAgentData?.mobile ||
    /iphone|ipad|ipod|android/i.test(navigator.userAgent) ||
    (/mac/i.test(platform) && navigator.maxTouchPoints > 1);
  const found = handheld
    ? undefined
    : SYSTEMS.find(({ pattern }) => pattern.test(platform));
  const all = (selector) => document.querySelectorAll(selector);
  // the landing page's Download section, as the bar's Download names it from this page
  const downloads = document
    .querySelector(".masthead [data-get]")
    .getAttribute("href");

  const applyDownloads = (arch) => {
    for (const button of all("[data-get]")) {
      const label = button.querySelector("[data-get-label]");
      const system = button.querySelector("[data-system]");
      if (handheld) {
        button.href = downloads;
        if (label) label.textContent = label.dataset.handheld;
        if (system) system.textContent = system.dataset.handheld;
      } else if (found) {
        button.href = fileFor(found, arch);
        if (system) system.textContent = `for ${found.name}`;
      } else button.href = downloads;
    }

    for (const link of all("[data-download]")) {
      const system = SYSTEMS.find(({ key }) => key === link.dataset.download);
      link.href = fileFor(system, system === found ? arch : undefined);
    }
  };

  applyDownloads(undefined);
  if (found && navigator.userAgentData?.getHighEntropyValues) {
    navigator.userAgentData
      .getHighEntropyValues(["architecture"])
      .then(({ architecture }) => {
        if (architecture) applyDownloads(architecture.toLowerCase());
      })
      .catch(() => {});
  }

  for (const line of all("[data-get-phone]")) line.hidden = !handheld;
  for (const list of all("[data-downloads]")) list.hidden = handheld;

  // a phone cannot install Manent: it sends the page on, by the share sheet or by copying its address
  for (const button of all("[data-share]")) {
    const said = button.parentElement.querySelector("[data-share-said]");
    const url = location.href.split("#")[0];
    button.addEventListener("click", async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: document.title, url });
        } catch {
          // the visitor closed the share sheet
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        said.textContent = "Link copied";
      } catch {
        // no clipboard access: the address is shown to copy by hand
        said.textContent = url;
      }
    });
  }

  // a shortcut is written as the visitor's keyboard shows it
  if (!/mac|iphone|ipad/i.test(platform))
    for (const key of all("[data-shortcut]"))
      key.textContent = key.dataset.shortcut;

  if (found) {
    const others = SYSTEMS.filter((system) => system !== found).map(
      ({ name }) => name,
    );
    for (const line of all("[data-also]")) {
      line.textContent = `Also for ${others.join(" and ")}`;
      line.hidden = false;
    }
    for (const list of all("[data-downloads]")) {
      const mine = list.querySelector(`[data-download="${found.key}"]`);
      mine.classList.remove("button-quiet");
      list.prepend(mine);
      list.dataset.found = "";
    }
    // first-launch help names the visitor's system first
    for (const item of all(`[data-launch="${found.key}"]`))
      item.parentElement.prepend(item);
  }

  // ---------- the recording, in a dialog ----------
  // [data-watch] names the dialog; without this script the link opens the recording itself
  const openers = new Map();
  for (const opener of all("[data-watch]")) {
    const dialog = document.getElementById(opener.dataset.watch);
    const video = dialog.querySelector("video");
    opener.addEventListener("click", (event) => {
      event.preventDefault();
      openers.set(dialog, opener);
      dialog.showModal();
      // a browser may refuse to start it; the controls are there to press play
      video.play().catch(() => {});
    });
    if (openers.has(dialog)) continue;
    openers.set(dialog, opener);
    // a click on the dialog itself, outside its body, is a click on the backdrop
    dialog.addEventListener("click", ({ target }) => {
      if (target === dialog || target.closest("[data-watch-close]"))
        dialog.close();
    });
    dialog.addEventListener("close", () => {
      video.pause();
      openers.get(dialog)?.focus();
    });
  }

  // ---------- a strip that scrolls sideways on a phone ----------
  // data-more names the edges with items past them; reach brings an item into the strip's view, only sideways,
  // so the page itself does not move
  const edges = (strip) => {
    const end = strip.scrollWidth - strip.clientWidth;
    const more = [];
    if (strip.scrollLeft > 1) more.push("start");
    if (strip.scrollLeft < end - 1) more.push("end");
    if (more.length) strip.dataset.more = more.join(" ");
    else delete strip.dataset.more;
  };
  for (const strip of all("[data-strip]")) {
    strip.addEventListener("scroll", () => edges(strip), { passive: true });
    new ResizeObserver(() => edges(strip)).observe(strip);
  }

  const reach = (item) => {
    const strip = item.closest("[data-strip]");
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({
      left: item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2,
    });
  };

  // ---------- a long page's contents: the link to the part in view is marked current ----------
  // a part is in view while it crosses a band just above the middle of the screen; above or below them all, none is
  for (const nav of all("[data-spy]")) {
    const links = new Map(
      [...nav.querySelectorAll('a[href^="#"]')]
        .map((link) => [document.getElementById(link.hash.slice(1)), link])
        .filter(([part]) => part),
    );
    const crossing = new Set();
    let current;
    const spy = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries)
          if (isIntersecting) crossing.add(target);
          else crossing.delete(target);
        const part = [...links.keys()].find((key) => crossing.has(key));
        if (part === current) return;
        links.get(current)?.removeAttribute("aria-current");
        current = part;
        if (!part) return;
        links.get(part).setAttribute("aria-current", "true");
        reach(links.get(part));
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const part of links.keys()) spy.observe(part);
  }

  // ---------- who it's for: one panel at a time ----------
  const tabs = document.querySelector("[data-tabs]");
  if (!tabs) return;
  const strip = tabs.querySelector('[role="tablist"]');
  const list = [...strip.querySelectorAll('[role="tab"]')];
  const panels = list.map((tab) =>
    document.getElementById(tab.getAttribute("aria-controls")),
  );
  const KEY = "manent.site.write";

  panels.forEach((panel, i) => {
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", list[i].id);
    panel.tabIndex = 0;
  });

  const select = (index, focus) => {
    list.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    if (focus) list[index].focus({ preventScroll: true });
    reach(list[index]);
  };

  const keep = (index) => {
    try {
      localStorage.setItem(KEY, panels[index].id);
    } catch {
      // remembering the choice is a convenience only
    }
  };

  const fromHash = () =>
    panels.findIndex((panel) => "#" + panel.id === location.hash);
  let remembered = -1;
  try {
    remembered = panels.findIndex(
      (panel) => panel.id === localStorage.getItem(KEY),
    );
  } catch {
    // storage can be blocked; the first tab is then the choice
  }
  const linked = fromHash();
  select(linked >= 0 ? linked : Math.max(remembered, 0), false);
  tabs.classList.add("is-ready");
  // after the browser's own jump to the linked panel, which comes after load, so the tabs end up under the bar
  if (linked >= 0)
    addEventListener("load", () =>
      setTimeout(() => tabs.scrollIntoView({ behavior: "instant" })),
    );
  addEventListener("hashchange", () => {
    const index = fromHash();
    if (index < 0) return;
    select(index, false);
    tabs.scrollIntoView();
  });

  list.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      select(i, false);
      keep(i);
    });
    tab.addEventListener("keydown", (event) => {
      const last = list.length - 1;
      const next = {
        ArrowRight: i === last ? 0 : i + 1,
        ArrowLeft: i === 0 ? last : i - 1,
        Home: 0,
        End: last,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(next, true);
      keep(next);
    });
  });
})();
