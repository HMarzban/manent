// Without this script the page still reads in full; it adds the tab switcher and names the visitor's system on Download.
(() => {
  // ---------- Download: the visitor's system first ----------
  const SYSTEMS = [
    ["mac", "Mac", /mac/i],
    ["windows", "Windows", /win/i],
    ["linux", "Linux", /linux|x11|cros/i],
  ];
  const platform =
    navigator.userAgentData?.platform || navigator.platform || "";
  const found = /iphone|ipad|android/i.test(navigator.userAgent)
    ? undefined
    : SYSTEMS.find(([, , pattern]) => pattern.test(platform));
  if (found) {
    const [key, name] = found;
    const others = SYSTEMS.filter(([other]) => other !== key).map(
      ([, label]) => label,
    );
    for (const label of document.querySelectorAll("[data-system]"))
      label.textContent = `for ${name}`;
    for (const line of document.querySelectorAll("[data-also]"))
      line.textContent = `Also for ${others.join(" and ")}`;
    for (const list of document.querySelectorAll("[data-downloads]")) {
      const mine = list.querySelector(`[data-download="${key}"]`);
      mine.classList.remove("button-quiet");
      list.prepend(mine);
    }
  }

  // ---------- who it's for: one panel at a time ----------
  const tabs = document.querySelector("[data-tabs]");
  const list = [...tabs.querySelectorAll('[role="tab"]')];
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
    if (focus) list[index].focus();
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
