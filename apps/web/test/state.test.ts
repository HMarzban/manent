import { expect, test } from "bun:test";
import type { PanelId } from "@manent/commands";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FactsContext,
  OutlineContext,
  PeopleContext,
} from "../src/state/bridge-contexts.ts";
import { dialogActions, useOpenDialog } from "../src/state/dialog.store.ts";
import { createFactsStore, useEditorFact } from "../src/state/facts.store.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import {
  createOutlineStore,
  useOutlineCount,
  useOutlineRow,
} from "../src/state/outline.store.ts";
import type { OutlineRow } from "../src/state/outline.store.ts";
import { paletteActions, usePaletteOpen } from "../src/state/palette.store.ts";
import { panelsActions, usePanel } from "../src/state/panels.store.ts";
import { createPeopleStore, usePeople } from "../src/state/people.store.ts";
import type { PersonPresent } from "../src/state/people.store.ts";
import { renameActions, useRenaming } from "../src/state/rename.store.ts";

const testGuard = () => createGuard({ flavour: "test" });

/** Frame callbacks that run only when the test says so. */
function fakeFrames() {
  let pending: (() => void)[] = [];
  return {
    request(fn: () => void): () => void {
      pending.push(fn);
      return () => {
        pending = pending.filter((f) => f !== fn);
      };
    },
    run(): void {
      const due = pending;
      pending = [];
      for (const fn of due) fn();
    },
  };
}

/** A timer queue whose time moves only when the test advances it. */
function fakeClock() {
  let now = 0;
  const timers: { at: number; fn: () => void; live: boolean }[] = [];
  return {
    schedule(fn: () => void, delayMs: number): () => void {
      const timer = { at: now + delayMs, fn, live: true };
      timers.push(timer);
      return () => {
        timer.live = false;
      };
    },
    advance(ms: number): void {
      const end = now + ms;
      for (;;) {
        const next = timers
          .filter((t) => t.live && t.at <= end)
          .toSorted((a, b) => a.at - b.at)[0];
        if (next === undefined) break;
        now = next.at;
        next.live = false;
        next.fn();
      }
      now = end;
    },
  };
}

const row = (blockId: string, heading = `INT. ${blockId}`): OutlineRow => ({
  blockId,
  number: null,
  heading,
  omitted: false,
  current: false,
});

const person = (userId: string, name: string): PersonPresent => ({
  userId,
  name,
  initials: name.slice(0, 1),
  colour: 3,
});

/** What `hook` returns when rendered once inside `wrap`. */
function readHook<T>(
  hook: () => T,
  wrap: (child: ReactNode) => ReactNode = (child) => child,
): T {
  const seen: T[] = [];
  function Probe() {
    seen.push(hook());
    return null;
  }
  renderToStaticMarkup(wrap(createElement(Probe)));
  if (seen.length !== 1) throw new Error("the probe did not render once");
  return seen[0]!;
}

const panelOf = (panel: PanelId) => readHook(() => usePanel(panel));

test("facts are written once per frame, only for keys whose value changed", () => {
  const frames = fakeFrames();
  const { writer, selectors } = createFactsStore({
    guard: testGuard(),
    frame: frames.request,
  });
  const seen: unknown[] = [];
  selectors.subscribe("page", (v) => seen.push(v));
  writer.publish({ page: "12A" });
  writer.publish({ page: "12A", element: "dialogue" });
  expect(seen).toEqual([]);
  frames.run();
  expect(seen).toEqual(["12A"]);
  writer.publish({ page: "12A" });
  frames.run();
  expect(seen).toEqual(["12A"]);
});

test("every fact is null or false before the first publish", () => {
  const { selectors } = createFactsStore({
    guard: testGuard(),
    frame: fakeFrames().request,
  });
  const keys = [
    "element",
    "page",
    "pageCount",
    "scene",
    "blockId",
    "sceneId",
    "pageRevision",
    "pageOrdinal",
    "canUndo",
    "canRedo",
    "selectionEmpty",
  ] as const;
  expect(keys.map((key) => [key, selectors.get(key)])).toEqual([
    ["element", null],
    ["page", null],
    ["pageCount", null],
    ["scene", null],
    ["blockId", null],
    ["sceneId", null],
    ["pageRevision", null],
    ["pageOrdinal", null],
    ["canUndo", false],
    ["canRedo", false],
    ["selectionEmpty", false],
  ]);
});

test("a fact changed and changed back within one frame is not written", () => {
  const frames = fakeFrames();
  const { writer, selectors } = createFactsStore({
    guard: testGuard(),
    frame: frames.request,
  });
  const seen: unknown[] = [];
  selectors.subscribe("element", (v) => seen.push(v));
  writer.publish({ element: "action" });
  writer.publish({ element: null });
  frames.run();
  expect([seen, selectors.get("element")]).toEqual([[], null]);
});

test("a collection is published at most every 250 ms, the latest at the end, and not while composing", () => {
  const clock = fakeClock();
  let composing = false;
  const options = {
    guard: testGuard(),
    schedule: clock.schedule,
    composing: () => composing,
  };
  const outline = createOutlineStore(options);
  const people = createPeopleStore(options);
  const subjects = [
    {
      publish: (n: number) =>
        outline.writer.publish(
          ["a", "b", "c"].slice(0, n).map((id) => row(id)),
        ),
      size: () => outline.selectors.count(),
      subscribe: outline.selectors.subscribe,
    },
    {
      publish: (n: number) =>
        people.writer.publish(
          ["dana", "sam", "priya"].slice(0, n).map((id) => person(id, id)),
        ),
      size: () => people.selectors.get().length,
      subscribe: people.selectors.subscribe,
    },
  ];
  for (const subject of subjects) {
    const sizes: number[] = [];
    subject.subscribe(() => sizes.push(subject.size()));
    subject.publish(1);
    subject.publish(2);
    clock.advance(249);
    expect(sizes).toEqual([]);
    clock.advance(1);
    expect(sizes).toEqual([2]);
    subject.publish(3);
    composing = true;
    clock.advance(500);
    expect(sizes).toEqual([2]);
    composing = false;
    clock.advance(250);
    expect(sizes).toEqual([2, 3]);
  }
});

test("an unchanged outline row keeps its reference, and an unchanged outline is not published again", () => {
  const clock = fakeClock();
  const { writer, selectors } = createOutlineStore({
    guard: testGuard(),
    schedule: clock.schedule,
    composing: () => false,
  });
  let publishes = 0;
  selectors.subscribe(() => publishes++);
  writer.publish([row("a"), row("b")]);
  clock.advance(250);
  const [first, second] = [selectors.row(0), selectors.row(1)];
  writer.publish([row("a"), row("b")]);
  clock.advance(250);
  expect(publishes).toBe(1);
  writer.publish([row("a"), row("b", "EXT. HARBOUR - DAY")]);
  clock.advance(250);
  expect([
    publishes,
    selectors.row(0) === first,
    selectors.row(1) === second,
    selectors.row(1),
    selectors.row(2),
  ]).toEqual([2, true, false, row("b", "EXT. HARBOUR - DAY"), null]);
});

test("every exported selector returns the same reference twice on one state", () => {
  const frames = fakeFrames();
  const clock = fakeClock();
  const guard = testGuard();
  bindGuard(guard);
  const facts = createFactsStore({ guard, frame: frames.request });
  const collections = {
    guard,
    schedule: clock.schedule,
    composing: () => false,
  };
  const outline = createOutlineStore(collections);
  const people = createPeopleStore(collections);
  facts.writer.publish({ page: "3", canUndo: true });
  frames.run();
  outline.writer.publish([row("a")]);
  people.writer.publish([person("dana", "Dana Reyes")]);
  clock.advance(250);
  panelsActions.open("side", "details");
  paletteActions.open("places");
  dialogActions.open("reset");
  renameActions.start("doc-1");
  const provided = (child: ReactNode) =>
    createElement(
      FactsContext,
      { value: facts.selectors },
      createElement(
        OutlineContext,
        { value: outline.selectors },
        createElement(PeopleContext, { value: people.selectors }, child),
      ),
    );
  const reads: (() => unknown)[] = [
    () => facts.selectors.get("page"),
    () => outline.selectors.count(),
    () => outline.selectors.row(0),
    () => people.selectors.get(),
    () => readHook(() => useEditorFact("page"), provided),
    () => readHook(() => useOutlineCount(), provided),
    () => readHook(() => useOutlineRow(0), provided),
    () => readHook(() => usePeople(), provided),
    () => readHook(() => usePanel("side")),
    () => readHook(() => usePaletteOpen()),
    () => readHook(() => useOpenDialog()),
    () => readHook(() => useRenaming()),
  ];
  const pairs = reads.map((read) => [read(), read()]);
  expect(pairs.map(([a, b]) => a === b)).toEqual(reads.map(() => true));
  expect(pairs.map(([a]) => a)).toEqual([
    "3",
    1,
    row("a"),
    [person("dana", "Dana Reyes")],
    "3",
    1,
    row("a"),
    [person("dana", "Dana Reyes")],
    { tab: "details", widthPx: 320 },
    "places",
    "reset",
    "doc-1",
  ]);
});

test("panel widths stay inside their ranges", () => {
  bindGuard(testGuard());
  expect([panelOf("left").widthPx, panelOf("side").widthPx]).toEqual([
    260, 320,
  ]);
  const resized = (
    [
      ["left", 100],
      ["left", 300],
      ["left", 999],
      ["side", 100],
      ["side", 300],
      ["side", 999],
    ] as const
  ).map(([panel, widthPx]) => {
    panelsActions.resize(panel, widthPx);
    return panelOf(panel).widthPx;
  });
  expect(resized).toEqual([200, 300, 360, 280, 300, 420]);
  expect(() => panelsActions.resize("left", Number.NaN)).toThrow(RangeError);
  // the other tests read the default widths
  panelsActions.resize("left", 260);
  panelsActions.resize("side", 320);
});

test("a panel opens one of its own tabs, toggles it closed, and refuses another panel's tab", () => {
  bindGuard(testGuard());
  panelsActions.open("left", "scenes");
  panelsActions.toggle("side", "history");
  const opened = [panelOf("left").tab, panelOf("side").tab];
  panelsActions.toggle("side", "details");
  const switched = panelOf("side").tab;
  panelsActions.toggle("side", "details");
  panelsActions.close("left");
  expect([opened, switched, panelOf("side").tab, panelOf("left").tab]).toEqual([
    ["scenes", "history"],
    "details",
    null,
    null,
  ]);
  expect(() => panelsActions.open("left", "history")).toThrow(
    "history is not a tab of the left panel",
  );
});

test("the palette, a dialog and a rename each open and close", () => {
  bindGuard(testGuard());
  paletteActions.open("all");
  dialogActions.open("reset");
  renameActions.start("doc-2");
  const opened = [
    readHook(() => usePaletteOpen()),
    readHook(() => useOpenDialog()),
    readHook(() => useRenaming()),
  ];
  paletteActions.close();
  dialogActions.close();
  renameActions.stop();
  expect([
    opened,
    readHook(() => usePaletteOpen()),
    readHook(() => useOpenDialog()),
    readHook(() => useRenaming()),
  ]).toEqual([["all", "reset", "doc-2"], null, null, null]);
});
