import { withDom } from "@manent/testkit/dom";
import { afterEach, expect, test } from "bun:test";
import { mountPageView } from "@manent/editor";
import { ENGINE_VERSION, engineFor, profileFor } from "@manent/pagination";
import type { Engine } from "@manent/pagination";
import { compareDocs } from "@manent/revisions";
import { parseDoc, sectionize } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";
import { HISTORY_WORDS } from "@manent/ui";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { mountVersionView } from "../src/editor-host/version-view.ts";
import { VERSION_LAYOUTS } from "../src/history/version-layouts.ts";
import { VersionPane } from "../src/screens/document/version-pane.tsx";
import {
  EnvironmentProvider,
  ServicesProvider,
} from "../src/services/context.tsx";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { historyActions } from "../src/state/history.store.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";

withDom();
bindGuard(createGuard({ flavour: "test" }));

const DOC = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const noop = (): void => {};

// fonts that never load and timers that never fire: the page is drawn in the fallback face
const PORTS = {
  fonts: { add: noop },
  makeFace: () => ({ load: () => new Promise<never>(noop) }),
  wait: () => new Promise<never>(noop),
  defer: (run: () => void) => run(),
  whenIdle: noop,
  userAgent: "test",
};

const LINE = "The ferry pulls away from the pier and the gulls follow it out. ";

const block = (id: string, type: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type },
  content: [{ type: "text", text }],
});

/** Two scenes of twelve action blocks each, three lines to a block. */
const BLOCKS: readonly BlockJSON[] = ["blockh01", "blockh02"].flatMap(
  (heading, scene) => [
    block(heading, "scene_heading", `INT. FERRY ${scene + 1} - NIGHT`),
    ...Array.from({ length: 12 }, (_, i) =>
      block(
        `block${scene}${String(i).padStart(2, "0")}`,
        "action",
        LINE.repeat(3),
      ),
    ),
  ],
);

const CONTENT: VersionContent = {
  v: 1,
  blocks: [...BLOCKS],
  settings: { "script.format": "screenplay" },
  schemaVersion: 1,
  engineVersion: 1,
  locks: null,
  authors: {},
};

const real = (): Engine => {
  const engine = engineFor(ENGINE_VERSION);
  if (engine === null) throw new RangeError("no current engine");
  return engine;
};

/** Engine 1 with ten lines to a page. */
const SHORT_PAGES: Engine = {
  ...real(),
  profileFor: (...args: Parameters<typeof profileFor>) => {
    const profile = real().profileFor(...args);
    return profile === null
      ? null
      : { ...profile, linesPerPage: 10, key: `${profile.key}:short` };
  },
};

/** A table of engines whose engine 1 has short pages, and whose engine 2 differs again. */
const ENGINES = (version: number): Engine | null =>
  version === 1
    ? SHORT_PAGES
    : version === 2
      ? { ...real(), version: 2 }
      : null;

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
  document.body.replaceChildren();
});

function placeIn(parent: HTMLElement = document.body): HTMLElement {
  return parent.appendChild(document.createElement("div"));
}

/** The labels of the pages a view drew, in order, from its page breaks. */
const labelsIn = (place: HTMLElement): string[] =>
  [...place.querySelectorAll<HTMLElement>(".pb")].map(
    (pb) => pb.dataset["label"] ?? "",
  );

function viewOf(content: VersionContent, engines = engineFor) {
  const place = placeIn();
  const view = mountVersionView({
    place,
    content,
    ports: PORTS,
    offFontNote: "Not in the script font",
    comparison: null,
    sceneIds: null,
    engineFor: engines,
  });
  cleanups.push(() => view.destroy());
  return place;
}

test("a version opens read-only, paginated as it was, and the live editor is untouched", () => {
  const live = mountPageView({
    place: placeIn(),
    doc: parseDoc(sectionize([block("blockl01", "action", "Working text.")])),
    ports: PORTS,
    profile: real().profileFor("screenplay")!,
    offFontNote: "Not in the script font",
  });
  cleanups.push(() => live.destroy());
  const doc = live.view.state.doc;
  const selection = live.view.state.selection;

  const place = viewOf(CONTENT);
  expect(
    place.querySelector(".ProseMirror")?.getAttribute("contenteditable"),
  ).toBe("false");
  expect(labelsIn(place)).toEqual(["1", "2", "3", "3"]);
  expect(
    [...place.querySelectorAll("[data-id]")].map((el) =>
      el.getAttribute("data-id"),
    ),
  ).toEqual(BLOCKS.map((b) => b.attrs?.id ?? null));
  expect(live.view.state.doc).toBe(doc);
  expect(live.view.state.selection.eq(selection)).toBe(true);
});

test("a version is paginated by its own engine", async () => {
  expect(labelsIn(viewOf(CONTENT))).toEqual(["1", "2", "3", "3"]);
  // thirteen short pages, the last break closing page 13
  const short = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "13",
  ];
  expect(labelsIn(viewOf(CONTENT, ENGINES))).toEqual(short);
  expect(labelsIn(viewOf({ ...CONTENT, engineVersion: 3 }, ENGINES))).toEqual(
    short,
  );

  const grid = placeIn();
  placeIn(grid).dataset["region"] = "page";
  const environment = testEnvironment();
  const services = {
    ...testServices({ userId: "sam", environment }),
    pagePorts: PORTS,
  };
  const doc = sectionize([...BLOCKS]);
  historyActions.reset(DOC);
  historyActions.setBaseline({
    versionId: "v1",
    position: null,
    title: "Studio draft",
    date: "Mon 16 Nov",
  });
  const root: Root = createRoot(placeIn());
  cleanups.push(() => act(() => root.unmount()));
  await act(async () =>
    root.render(
      createElement(EnvironmentProvider, {
        environment,
        children: createElement(ServicesProvider, {
          services,
          children: createElement(VersionPane, {
            docId: DOC,
            position: "beside",
            content: { ...CONTENT, engineVersion: 3 },
            comparison: compareDocs(doc, doc),
          }),
        }),
      }),
    ),
  );
  const pane = grid.querySelector<HTMLElement>("[data-beside='version']");
  expect(pane?.querySelector("header")?.textContent).toBe(
    `Studio draft, Mon 16 NovSaved · Only in this browser — not backed up${HISTORY_WORDS.compareNewer}`,
  );
  expect(labelsIn(pane!)).toEqual(["1", "2", "3", "3"]);
  expect(document.activeElement?.closest("[data-beside='version']")).toBe(pane);
  expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  expect(document.activeElement?.className).toContain("outline-none");
  expect(document.activeElement?.className).toContain(
    "focus-visible:outline-ring",
  );
});

/** A level-1 anchor of page `label` at the start of `blockId`. */
const anchor = (order: number, label: string, blockId: string) => ({
  level: 1,
  order,
  label,
  blockId,
  offset: 0,
  quote: "",
  fallbackIds: [],
  source: "lock" as const,
});
/** The layout another feature gives a version it marks: its two scenes numbered 8 and 8A. */
const layout = () => ({
  key: "numbers",
  patches: new Map([
    ["blockh01", { num: "8" }],
    ["blockh02", { num: "8A" }],
  ]),
});

test("a version of a locked script keeps its page labels and numbered scenes", () => {
  // first, so that its answer wins over production's own
  Reflect.apply(Array.prototype.unshift, VERSION_LAYOUTS, [layout]);
  cleanups.push(() =>
    Reflect.apply(Array.prototype.shift, VERSION_LAYOUTS, []),
  );
  const place = viewOf({
    ...CONTENT,
    locks: [anchor(0, "12", "blockh01"), anchor(1, "12A", "block006")],
  });
  expect(labelsIn(place)).toEqual(["12", "12A", "12AA", "12AA"]);
  expect(
    [...place.querySelectorAll<HTMLElement>(".el[data-scene]")].map(
      (el) => el.dataset["scene"],
    ),
  ).toEqual(["8", "8A"]);
});

test("mountVersionView renders watermark on sheets when given", () => {
  const place = document.createElement("div");
  Object.defineProperty(place, "clientHeight", { value: 900 });
  const view = mountVersionView({
    place,
    content: CONTENT,
    ports: PORTS,
    offFontNote: "Outside Courier Prime",
    comparison: null,
    sceneIds: null,
    engineFor,
    watermark: "Leo Marsh",
  });
  cleanups.push(() => view.destroy());
  expect(
    [...place.querySelectorAll<HTMLElement>(".mn-watermark")].map(
      (el) => el.textContent,
    ),
  ).toEqual(["Leo Marsh", "Leo Marsh"]);
});
