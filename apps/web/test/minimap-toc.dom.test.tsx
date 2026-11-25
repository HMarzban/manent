import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  compressTicks,
  filterOutlineRows,
  formatEighths,
  rowLabel,
  sceneIndexInfo,
  tickWidthClass,
} from "../src/screens/present/room/minimap-logic.ts";
import { MiniMapToc } from "../src/screens/present/room/minimap-toc.tsx";
import {
  jumpToPresentBlock,
  useActivePresentScene,
  useOutlineRows,
} from "../src/screens/present/room/present-outline.ts";
import { OutlineContext } from "../src/state/bridge-contexts.ts";
import type {
  OutlineRow,
  OutlineSelectors,
} from "../src/state/outline.store.ts";

withDom();

const DOC_ID = "8e2b5a10-4c9d-4f31-8b2a-91d7e04f3c12";

const makeRow = (
  blockId: string,
  heading: string,
  patch: Partial<OutlineRow> = {},
): OutlineRow => ({
  blockId,
  kind: "scene",
  number: null,
  heading,
  synopsis: "",
  eighths: null,
  omitted: false,
  current: false,
  ...patch,
});

const SHORT_OUTLINE: readonly OutlineRow[] = [
  makeRow("act-1", "ACT I", { kind: "act" }),
  makeRow("sc-1", "INT. HARBOUR OFFICE - DAWN", {
    number: "1",
    eighths: 3,
    synopsis: "Tide tables spread across the desk",
  }),
  makeRow("sec-1", "Morning sequence", { kind: "section" }),
  makeRow("sc-2", "EXT. PIER - DAY", {
    number: "2",
    eighths: 10,
    synopsis: "The ferry pulls away in fog",
  }),
  makeRow("sc-3", "INT. LIGHTHOUSE - NIGHT", {
    number: "3",
    eighths: 18,
    synopsis: "The lamp fails during the storm",
  }),
];

const LONG_OUTLINE: readonly OutlineRow[] = [
  makeRow("act-1", "ACT I", { kind: "act" }),
  makeRow("sc-1", "INT. HARBOUR OFFICE - DAWN", {
    number: "1",
    eighths: 4,
    synopsis: "Tide tables spread across the desk",
  }),
  makeRow("sc-2", "EXT. PIER - DAY", {
    number: "2",
    eighths: 8,
    synopsis: "The ferry pulls away in fog",
  }),
  makeRow("sc-3", "INT. ENGINE ROOM - DAY", {
    number: "3",
    eighths: 6,
    synopsis: "Steam hisses from a cracked valve",
  }),
  makeRow("sc-4", "EXT. BREAKWATER - DAY", {
    number: "4",
    eighths: 14,
    synopsis: "Gulls circle over the outer wall",
  }),
  makeRow("act-2", "ACT II", { kind: "act" }),
  makeRow("sc-5", "INT. LIGHTHOUSE - NIGHT", {
    number: "5",
    eighths: 11,
    synopsis: "The lantern jams in high wind",
  }),
  makeRow("sc-6", "EXT. CLIFF PATH - NIGHT", {
    number: "6",
    eighths: 3,
    synopsis: "Footsteps vanish in the rain",
  }),
  makeRow("sc-7", "INT. BOATHOUSE - DAWN", {
    number: "7",
    eighths: 16,
    omitted: true,
  }),
];

let roots: Root[] = [];
let cleanups: (() => void)[] = [];

afterEach(() => {
  for (const clean of cleanups.splice(0).toReversed()) clean();
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

function mount(element: React.ReactNode): HTMLElement {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return container;
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function hoverOver(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

function hoverOut(el: Element): void {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("mouseout", {
        bubbles: true,
        relatedTarget: document.body,
      }),
    );
  });
}

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    input.focus();
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  });
}

function pressKey(target: Element, key: string): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

function installFakeTimers(): {
  advanceAll(): void;
  pendingDelays(): number[];
} {
  let nextId = 1;
  const tasks = new Map<number, { fn: () => void; delay: number }>();
  const setSpy = spyOn(globalThis, "setTimeout").mockImplementation(((
    fn: () => void,
    delay = 0,
  ) => {
    const id = nextId++;
    tasks.set(id, { fn, delay });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  const clearSpy = spyOn(globalThis, "clearTimeout").mockImplementation(((
    id: ReturnType<typeof setTimeout>,
  ) => {
    tasks.delete(id as unknown as number);
  }) as typeof clearTimeout);
  cleanups.push(() => {
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
  return {
    advanceAll() {
      const current = [...tasks.entries()];
      tasks.clear();
      act(() => {
        for (const [, task] of current) task.fn();
      });
    },
    pendingDelays() {
      return [...tasks.values()].map((t) => t.delay);
    },
  };
}

test("small outlines keep every row one-to-one on the tick spine", () => {
  expect(compressTicks([], null)).toEqual([]);
  const ticks = compressTicks(SHORT_OUTLINE, "sc-2");
  expect(ticks.map((t) => t.row.blockId)).toEqual([
    "act-1",
    "sc-1",
    "sec-1",
    "sc-2",
    "sc-3",
  ]);
  expect(ticks.map((t) => t.index)).toEqual([0, 1, 2, 3, 4]);
  expect(ticks.map((t) => t.active)).toEqual([
    false,
    false,
    false,
    true,
    false,
  ]);
  expect(ticks.map((t) => t.isMilestone)).toEqual([
    true,
    false,
    false,
    false,
    false,
  ]);
  expect(ticks.map((t) => t.widthClass)).toEqual([
    "w-5 h-[3px]",
    "w-2 h-[2px]",
    "w-4 h-[2px]",
    "w-6 h-[3px]",
    "w-4 h-[2px]",
  ]);
});

test("long scripts compress to the tick budget while keeping every act and the active scene", () => {
  const rows: OutlineRow[] = [];
  const actIds = ["act-1", "act-2", "act-3", "act-4"];
  for (let i = 0; i < 120; i++) {
    if (i % 30 === 0) {
      const actIndex = i / 30;
      rows.push(
        makeRow(actIds[actIndex]!, `ACT ${actIndex + 1}`, { kind: "act" }),
      );
    } else {
      rows.push(
        makeRow(`sc-${i}`, `INT. ROOM ${i} - DAY`, {
          number: String(i),
          eighths: (i % 16) + 1,
        }),
      );
    }
  }
  const activeId = "sc-97";
  const ticks = compressTicks(rows, activeId, 44);
  expect(ticks.length).toBe(44);
  const ids = ticks.map((t) => t.row.blockId);
  for (const actId of actIds) expect(ids).toContain(actId);
  expect(ids).toContain(activeId);
  expect(ticks.filter((t) => t.active).map((t) => t.row.blockId)).toEqual([
    activeId,
  ]);
  const indices = ticks.map((t) => t.index);
  expect(indices).toEqual(indices.toSorted((a, b) => a - b));
  expect(new Set(indices).size).toBe(indices.length);
});

test("tick widths reflect active state, acts, sections and scene length in eighths", () => {
  const actRow = makeRow("a", "ACT I", { kind: "act" });
  const secRow = makeRow("s", "Part", { kind: "section" });
  const shortScene = makeRow("s1", "INT. HALL - DAY", { eighths: 4 });
  const nullScene = makeRow("s0", "INT. HALL - DAY", { eighths: null });
  const midScene = makeRow("s2", "INT. HALL - DAY", { eighths: 5 });
  const midMaxScene = makeRow("s3", "INT. HALL - DAY", { eighths: 12 });
  const longScene = makeRow("s4", "INT. HALL - DAY", { eighths: 13 });

  expect([
    tickWidthClass(shortScene, true),
    tickWidthClass(actRow, true),
    tickWidthClass(actRow, false),
    tickWidthClass(secRow, false),
    tickWidthClass(nullScene, false),
    tickWidthClass(shortScene, false),
    tickWidthClass(midScene, false),
    tickWidthClass(midMaxScene, false),
    tickWidthClass(longScene, false),
  ]).toEqual([
    "w-6 h-[3px]",
    "w-6 h-[3px]",
    "w-5 h-[3px]",
    "w-4 h-[2px]",
    "w-2 h-[2px]",
    "w-2 h-[2px]",
    "w-3 h-[2px]",
    "w-3 h-[2px]",
    "w-4 h-[2px]",
  ]);
});

test("scene lengths format as whole pages and remaining eighths", () => {
  expect([
    formatEighths(null),
    formatEighths(0),
    formatEighths(-4),
    formatEighths(1),
    formatEighths(7),
    formatEighths(8),
    formatEighths(11),
    formatEighths(16),
    formatEighths(21),
  ]).toEqual([null, null, null, "1/8", "7/8", "1", "1 3/8", "2", "2 5/8"]);
});

test("scene position counts only scenes and falls back across acts, current flag and defaults", () => {
  const actOnly = [makeRow("a1", "ACT I", { kind: "act" })];
  const withCurrent = SHORT_OUTLINE.map((r) =>
    r.blockId === "sc-2" ? { ...r, current: true } : r,
  );
  expect([
    sceneIndexInfo([], null),
    sceneIndexInfo(actOnly, "a1"),
    sceneIndexInfo(SHORT_OUTLINE, "sc-3"),
    sceneIndexInfo(SHORT_OUTLINE, "sec-1"),
    sceneIndexInfo(SHORT_OUTLINE, "act-1"),
    sceneIndexInfo(withCurrent, null),
    sceneIndexInfo(SHORT_OUTLINE, null),
  ]).toEqual([
    { currentScene: 0, totalScenes: 0 },
    { currentScene: 0, totalScenes: 0 },
    { currentScene: 3, totalScenes: 3 },
    { currentScene: 1, totalScenes: 3 },
    { currentScene: 1, totalScenes: 3 },
    { currentScene: 2, totalScenes: 3 },
    { currentScene: 1, totalScenes: 3 },
  ]);
});

test("row labels format omitted, numbered and plain outline rows", () => {
  expect([
    rowLabel(makeRow("o1", "INT. HALL - DAY", { number: "4", omitted: true })),
    rowLabel(makeRow("o2", "INT. HALL - DAY", { number: null, omitted: true })),
    rowLabel(makeRow("s1", "EXT. PIER - DAY", { number: "2" })),
    rowLabel(makeRow("s2", "EXT. PIER - DAY", { number: null })),
    rowLabel(makeRow("a1", "ACT I", { kind: "act" })),
  ]).toEqual([
    "4 OMITTED",
    "OMITTED",
    "2 · EXT. PIER - DAY",
    "EXT. PIER - DAY",
    "ACT I",
  ]);
});

test("an empty outline draws nothing", () => {
  const container = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={[]}
      activeBlockId={null}
      progress={0}
      onJump={() => {}}
    />,
  );
  expect(container.innerHTML).toBe("");
});

test("the rail draws proportional ticks, marks the active location and jumps on click", () => {
  const jumped: string[] = [];
  const container = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={SHORT_OUTLINE}
      activeBlockId="sc-2"
      progress={42}
      onJump={(id) => jumped.push(id)}
    />,
  );
  const aside = container.querySelector("aside");
  expect(aside?.getAttribute("aria-label")).toBe("Script outline");

  const tickButtons = [...container.querySelectorAll("button[title]")];
  expect(tickButtons.map((b) => b.getAttribute("aria-label"))).toEqual([
    "Go to ACT I",
    "Go to 1 · INT. HARBOUR OFFICE - DAWN",
    "Go to Morning sequence",
    "Go to 2 · EXT. PIER - DAY",
    "Go to 3 · INT. LIGHTHOUSE - NIGHT",
  ]);
  expect(tickButtons.map((b) => b.getAttribute("aria-current"))).toEqual([
    null,
    null,
    null,
    "location",
    null,
  ]);

  const bars = [...container.querySelectorAll(".mn-minimap-tick")];
  expect(bars.map((b) => b.getAttribute("data-kind"))).toEqual([
    "act",
    "scene",
    "section",
    "scene",
    "scene",
  ]);
  expect(bars[3]?.getAttribute("data-active")).toBe("true");
  expect(bars[3]?.className).toContain("w-6");

  click(tickButtons[4]!);
  expect(jumped).toEqual(["sc-3"]);
});

test("hovering opens the floating outline card with progress and collapses after the leave bridge", () => {
  const timers = installFakeTimers();
  const container = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={SHORT_OUTLINE}
      activeBlockId="sc-2"
      progress={65}
      onJump={() => {}}
    />,
  );
  const aside = container.querySelector("aside")!;
  expect(container.querySelector(".mn-minimap-card")).toBeNull();

  hoverOver(aside);
  const card = container.querySelector(".mn-minimap-card");
  expect(card).not.toBeNull();
  expect(card?.textContent).toContain("Outline");
  expect(card?.textContent).toContain("3 scenes");
  expect(card?.textContent).toContain("65%");
  expect(card?.textContent).toContain("1 2/8");
  expect(
    card?.querySelector("button[aria-current='location']")?.textContent,
  ).toContain("EXT. PIER - DAY");

  hoverOut(aside);
  expect(timers.pendingDelays()).toEqual([180]);
  expect(container.querySelector(".mn-minimap-card")).not.toBeNull();

  timers.advanceAll();
  expect(container.querySelector(".mn-minimap-card")).toBeNull();
});

test("pinning keeps the outline card open after the pointer leaves", () => {
  const timers = installFakeTimers();
  const container = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={SHORT_OUTLINE}
      activeBlockId="sc-1"
      progress={20}
      onJump={() => {}}
    />,
  );
  const aside = container.querySelector("aside")!;
  const toggle = container.querySelector(
    'button[aria-label="Show script outline"]',
  )!;
  expect(toggle.getAttribute("aria-expanded")).toBe("false");

  click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");

  const pinButton = container.querySelector(
    'button[aria-label="Keep outline open"]',
  )!;
  expect(pinButton.getAttribute("aria-pressed")).toBe("false");

  click(pinButton);
  const pinnedButton = container.querySelector(
    'button[aria-label="Keep outline open"]',
  )!;
  expect(pinnedButton.getAttribute("aria-pressed")).toBe("true");

  hoverOut(aside);
  expect(timers.pendingDelays()).toEqual([]);
  expect(container.querySelector(".mn-minimap-card")).not.toBeNull();
});

test("the quick-jump filter appears from eight rows on, filters scenes and clears cleanly", () => {
  const jumped: string[] = [];
  const shortContainer = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={SHORT_OUTLINE}
      activeBlockId="sc-1"
      progress={10}
      onJump={() => {}}
    />,
  );
  click(
    shortContainer.querySelector('button[aria-label="Show script outline"]')!,
  );
  expect(
    shortContainer.querySelector('input[aria-label="Filter scenes"]'),
  ).toBeNull();

  const container = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={LONG_OUTLINE}
      activeBlockId="sc-5"
      progress={75}
      onJump={(id) => jumped.push(id)}
    />,
  );
  click(container.querySelector('button[aria-label="Show script outline"]')!);

  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="Filter scenes"]',
  )!;
  expect(input.getAttribute("placeholder")).toBe("Go to scene…");

  typeInto(input, "lantern");
  const nav = container.querySelector('nav[aria-label="Outline"]')!;
  const matched = [...nav.querySelectorAll("button")];
  expect(matched.length).toBe(1);
  expect(matched[0]?.textContent).toContain("INT. LIGHTHOUSE - NIGHT");

  click(matched[0]!);
  expect(jumped).toEqual(["sc-5"]);

  typeInto(input, "no-such-place");
  expect(nav.querySelectorAll("button").length).toBe(0);
  expect(nav.textContent).toContain("No scenes match");

  const clearBtn = container.querySelector(
    'button[aria-label="Clear search"]',
  )!;
  click(clearBtn);
  expect(input.value).toBe("");
  expect(nav.querySelectorAll("button").length).toBe(LONG_OUTLINE.length);
});

test("arrow, Home, End and Escape keys navigate the outline card and restore focus", () => {
  const container = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={LONG_OUTLINE}
      activeBlockId="sc-1"
      progress={15}
      onJump={() => {}}
    />,
  );
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Show script outline"]',
  )!;
  click(toggle);

  const card = container.querySelector(".mn-minimap-card")!;
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="Filter scenes"]',
  )!;
  const nav = container.querySelector('nav[aria-label="Outline"]')!;
  const items = () => [...nav.querySelectorAll<HTMLButtonElement>("button")];

  act(() => items()[0]!.focus());
  expect(document.activeElement).toBe(items()[0]!);

  pressKey(card, "ArrowDown");
  expect(document.activeElement).toBe(items()[1]!);

  pressKey(card, "End");
  expect(document.activeElement).toBe(items().at(-1)!);

  pressKey(card, "ArrowUp");
  expect(document.activeElement).toBe(items().at(-2)!);

  pressKey(card, "Home");
  expect(document.activeElement).toBe(items()[0]!);

  // Escape clears a non-empty filter first before collapsing the card
  typeInto(input, "ferry");
  expect(input.value).toBe("ferry");
  pressKey(card, "Escape");
  expect(input.value).toBe("");
  expect(container.querySelector(".mn-minimap-card")).not.toBeNull();

  // Second Escape closes the card and returns focus to the toggle button
  pressKey(card, "Escape");
  expect(container.querySelector(".mn-minimap-card")).toBeNull();
  expect(document.activeElement).toBe(toggle);
});

test("jumping to a block scrolls a rendered element and falls back to the editor when absent", () => {
  const page = document.body.appendChild(document.createElement("div"));
  page.setAttribute("data-region", "page");
  const block = page.appendChild(document.createElement("div"));
  block.setAttribute("data-id", "sc:2");
  const scrollCalls: ScrollIntoViewOptions[] = [];
  block.scrollIntoView = (opts?: boolean | ScrollIntoViewOptions) => {
    if (typeof opts === "object" && opts !== null) scrollCalls.push(opts);
  };

  const matchMediaSpy = spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion"),
      }) as MediaQueryList,
  );
  cleanups.push(() => matchMediaSpy.mockRestore());

  const commands: { kind: "go_to"; blockId: string; offset: number }[] = [];
  jumpToPresentBlock("sc:2", (cmd) => commands.push(cmd));
  expect(scrollCalls).toEqual([{ behavior: "auto", block: "start" }]);
  expect(commands).toEqual([]);

  matchMediaSpy.mockImplementation(
    () => ({ matches: false }) as MediaQueryList,
  );
  jumpToPresentBlock("sc:2", (cmd) => commands.push(cmd));
  expect(scrollCalls).toEqual([
    { behavior: "auto", block: "start" },
    { behavior: "smooth", block: "start" },
  ]);

  jumpToPresentBlock("sc-missing", (cmd) => commands.push(cmd));
  expect(commands).toEqual([
    { kind: "go_to", blockId: "sc-missing", offset: 0 },
  ]);
});

test("the outline hook tracks updates from context with stable references", () => {
  let currentRows: readonly OutlineRow[] = [SHORT_OUTLINE[0]!];
  const listeners = new Set<() => void>();
  const selectors: OutlineSelectors = {
    count: () => currentRows.length,
    row: (i) => currentRows[i] ?? null,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  const snapshots: (readonly OutlineRow[])[] = [];
  function Probe() {
    const rows = useOutlineRows();
    snapshots.push(rows);
    return <span data-count={rows.length} />;
  }

  mount(
    <OutlineContext.Provider value={selectors}>
      <Probe />
    </OutlineContext.Provider>,
  );
  expect(snapshots.at(-1)?.map((r) => r.blockId)).toEqual(["act-1"]);
  const firstRef = snapshots.at(-1);

  act(() => {
    for (const fn of listeners) fn();
  });
  expect(snapshots.at(-1)).toBe(firstRef);

  currentRows = [SHORT_OUTLINE[0]!, SHORT_OUTLINE[1]!];
  act(() => {
    for (const fn of listeners) fn();
  });
  expect(snapshots.at(-1)?.map((r) => r.blockId)).toEqual(["act-1", "sc-1"]);
});

test("active scene tracking reads scroll progress and nearest heading above the threshold", () => {
  const page = document.body.appendChild(document.createElement("div"));
  page.setAttribute("data-region", "page");
  Object.defineProperty(page, "scrollHeight", {
    value: 1200,
    configurable: true,
  });
  Object.defineProperty(page, "clientHeight", {
    value: 200,
    configurable: true,
  });
  let scrollTop = 0;
  Object.defineProperty(page, "scrollTop", {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = v;
    },
    configurable: true,
  });
  page.getBoundingClientRect = () =>
    ({
      top: 0,
      height: 200,
      bottom: 200,
      left: 0,
      right: 800,
      width: 800,
    }) as DOMRect;

  const tops: Record<string, number> = {
    "act-1": 10,
    "sc-1": 40,
    "sec-1": 180,
    "sc-2": 320,
    "sc-3": 600,
  };
  for (const row of SHORT_OUTLINE) {
    const el = page.appendChild(document.createElement("div"));
    el.setAttribute("data-id", row.blockId);
    el.getBoundingClientRect = () =>
      ({
        top: tops[row.blockId] ?? 999,
        height: 20,
        bottom: (tops[row.blockId] ?? 999) + 20,
        left: 0,
        right: 800,
        width: 800,
      }) as DOMRect;
  }

  let rafCallback: FrameRequestCallback | null = null;
  const rafSpy = spyOn(globalThis, "requestAnimationFrame").mockImplementation(
    (cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    },
  );
  const cafSpy = spyOn(globalThis, "cancelAnimationFrame").mockImplementation(
    () => {
      rafCallback = null;
    },
  );
  cleanups.push(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  let latest: { activeBlockId: string | null; progress: number } = {
    activeBlockId: null,
    progress: -1,
  };
  function Probe() {
    latest = useActivePresentScene(SHORT_OUTLINE);
    return null;
  }

  mount(<Probe />);
  expect(latest).toEqual({ activeBlockId: "sc-1", progress: 0 });

  scrollTop = 500;
  tops["act-1"] = -490;
  tops["sc-1"] = -460;
  tops["sec-1"] = -320;
  tops["sc-2"] = 30;
  tops["sc-3"] = 250;
  act(() => {
    page.dispatchEvent(new Event("scroll"));
  });
  expect(rafCallback).not.toBeNull();
  act(() => {
    rafCallback?.(16);
  });
  expect(latest).toEqual({ activeBlockId: "sc-2", progress: 50 });
});

test("toggle precedes expanded card in DOM order, ambient ticks are skipped by Tab, and popup attributes are wired", () => {
  const container = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={SHORT_OUTLINE}
      activeBlockId="act-1"
      progress={25}
      onJump={() => {}}
    />,
  );
  const tickButtons = [
    ...container.querySelectorAll<HTMLButtonElement>("button[title]"),
  ];
  expect(tickButtons.length).toBe(SHORT_OUTLINE.length);
  expect(tickButtons.every((button) => button.tabIndex === -1)).toBe(true);

  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Show script outline"]',
  )!;
  expect(toggle.getAttribute("aria-controls")).toBeNull();

  click(toggle);
  const card = container.querySelector<HTMLElement>(".mn-minimap-card")!;
  expect(card).not.toBeNull();
  expect(card.id).not.toBe("");
  expect(toggle.getAttribute("aria-controls")).toBe(card.id);
  expect(card.hasAttribute("data-popup-open")).toBe(true);
  expect(
    Boolean(
      toggle.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  ).toBe(true);

  const nav = card.querySelector('nav[aria-label="Outline"]')!;
  expect(nav.getAttribute("data-ring")).toBe("inset");
  const outlineButtons = [...nav.querySelectorAll("button[data-outline-item]")];
  expect(
    outlineButtons.every((button) => button.classList.contains("mn-row")),
  ).toBe(true);
});

test("leaving focus from the mini-map collapses an unpinned card but keeps a pinned card open", () => {
  const outside = document.body.appendChild(document.createElement("button"));
  const container = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={SHORT_OUTLINE}
      activeBlockId="sc-1"
      progress={10}
      onJump={() => {}}
    />,
  );
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Show script outline"]',
  )!;
  click(toggle);

  const firstItem = container.querySelector<HTMLButtonElement>(
    'nav[aria-label="Outline"] button',
  )!;
  act(() => {
    toggle.focus();
    toggle.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: firstItem }),
    );
  });
  expect(container.querySelector(".mn-minimap-card")).not.toBeNull();

  act(() => {
    firstItem.focus();
    firstItem.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }),
    );
  });
  expect(container.querySelector(".mn-minimap-card")).toBeNull();

  // Pinned card remains open when focus leaves the aside
  click(toggle);
  click(container.querySelector('button[aria-label="Keep outline open"]')!);
  const pinnedItem = container.querySelector<HTMLButtonElement>(
    'nav[aria-label="Outline"] button',
  )!;
  act(() => {
    pinnedItem.focus();
    pinnedItem.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }),
    );
  });
  expect(container.querySelector(".mn-minimap-card")).not.toBeNull();
});

test("pressing Escape on the toggle button closes the expanded outline card", () => {
  const container = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={SHORT_OUTLINE}
      activeBlockId="sc-1"
      progress={30}
      onJump={() => {}}
    />,
  );
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Show script outline"]',
  )!;
  click(toggle);
  expect(container.querySelector(".mn-minimap-card")).not.toBeNull();

  act(() => toggle.focus());
  pressKey(toggle, "Escape");
  expect(container.querySelector(".mn-minimap-card")).toBeNull();
  expect(document.activeElement).toBe(toggle);
});

test("a whitespace-only filter keeps acts and sections visible", () => {
  expect(filterOutlineRows(SHORT_OUTLINE, "   ")).toEqual(SHORT_OUTLINE);

  const container = mount(
    <MiniMapToc
      docId={DOC_ID}
      rows={LONG_OUTLINE}
      activeBlockId="sc-1"
      progress={10}
      onJump={() => {}}
    />,
  );
  click(container.querySelector('button[aria-label="Show script outline"]')!);
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="Filter scenes"]',
  )!;
  typeInto(input, "   ");
  const nav = container.querySelector('nav[aria-label="Outline"]')!;
  const items = [...nav.querySelectorAll("button")];
  expect(items.length).toBe(LONG_OUTLINE.length);
  expect(items[0]?.textContent).toBe("ACT I");
  expect(items[5]?.textContent).toBe("ACT II");
});
