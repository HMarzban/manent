import { expect, test } from "bun:test";
import { LEFT_TABS, SIDE_TABS } from "@manent/commands";
import type { SavedPlace } from "@manent/editor";
import fc from "fast-check";
import {
  MAX_PLACES,
  createPlaceStore,
  keepViewState,
  placeKey,
} from "../src/editor-host/place.ts";
import { createLocalMap } from "../src/services/local-map.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import type { PanelsState } from "../src/state/panels.store.ts";
import { rulerActions } from "../src/state/ruler.store.ts";
import { zoomActions } from "../src/state/zoom.store.ts";
import {
  MemoryStorage,
  createClock,
  createStorageEvents,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

bindGuard(createGuard({ flavour: "test" }));

const PLACE: SavedPlace = {
  anchor: { blockId: "block-0120", offset: 3 },
  head: { blockId: "block-0120", offset: 7 },
  top: { blockId: "block-0101", offsetPx: 12.5 },
};
const PANELS: PanelsState = {
  left: { tab: "scenes", widthPx: 300 },
  side: { tab: null, widthPx: 320 },
};
const now = (): number => 0;

const storage = new MemoryStorage();
const mapOf = (key: string) =>
  createLocalMap({ storage, key, events: createStorageEvents().events });
const mapOfIn = (shared: MemoryStorage, userId: string) =>
  createLocalMap({
    storage: shared,
    key: placeKey(userId),
    events: createStorageEvents().events,
  });

/** `value` as JSON text, leaving out undefined members as JSON does and writing an infinity as a number past the double range, which reads back as one. */
function jsonText(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value))
    return value > 0 ? "1e999" : "-1e999";
  if (Array.isArray(value)) return `[${value.map(jsonText).join(",")}]`;
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  const members = Object.entries(value).flatMap(([key, member]) =>
    member === undefined ? [] : [`${JSON.stringify(key)}:${jsonText(member)}`],
  );
  return `{${members.join(",")}}`;
}

test("a place, the panels and the Ruler come back for the same person and no one else", () => {
  const a = createPlaceStore({ map: mapOf("manent.place.dana"), now });
  a.savePlace("d1", PLACE);
  a.savePanels(PANELS);
  a.saveRuler(true);
  const again = createPlaceStore({ map: mapOf("manent.place.dana"), now });
  const other = createPlaceStore({ map: mapOf("manent.place.sam"), now });
  expect([
    again.place("d1"),
    again.panels(),
    again.ruler(),
    other.place("d1"),
    other.ruler(),
  ]).toEqual([PLACE, PANELS, true, null, false]);
});

test("at most two hundred scripts are remembered, the oldest forgotten first", () => {
  const clock = createClock();
  const key = "manent.place.priya";
  const store = createPlaceStore({ map: mapOf(key), now: clock.now });
  for (let n = 0; n <= MAX_PLACES; n++) {
    store.savePlace(`d${n}`, PLACE);
    clock.advance(1);
  }
  const again = createPlaceStore({ map: mapOf(key), now: clock.now });
  const stored: object = Object(JSON.parse(storage.getItem(key) ?? "{}"));
  expect([
    MAX_PLACES,
    again.place("d0"),
    again.place("d1"),
    again.place(`d${MAX_PLACES}`),
    Object.keys(stored).length,
  ]).toEqual([200, null, PLACE, PLACE, 200]);
});

test("a stored value of the wrong shape reads as nothing", () => {
  const key = "manent.place.leo";
  storage.setItem(
    key,
    JSON.stringify({
      "doc:d1": "x",
      "doc:d2": { place: { ...PLACE, head: { blockId: 4, offset: 0 } }, at: 1 },
      "doc:d3": { place: PLACE, at: "yesterday" },
      "doc:d4": {
        place: { ...PLACE, anchor: { blockId: "b", offset: -1 } },
        at: 1,
      },
      "doc:d5": {
        place: { ...PLACE, head: { blockId: "b", offset: 1.5 } },
        at: 1,
      },
      panels: 7,
      ruler: "on",
      "notice:d1": 1,
    }),
  );
  const store = createPlaceStore({ map: mapOf(key), now });
  storage.setItem(
    key,
    JSON.stringify({
      panels: { left: { tab: "history", widthPx: 300 }, side: PANELS.side },
    }),
  );
  const unknownTab = createPlaceStore({ map: mapOf(key), now });
  storage.setItem(
    key,
    jsonText({
      "doc:d1": {
        place: { ...PLACE, top: { blockId: "b", offsetPx: Infinity } },
        at: 1,
      },
      "doc:d2": { place: PLACE, at: -Infinity },
      panels: { left: PANELS.left, side: { tab: null, widthPx: Infinity } },
    }),
  );
  const pastAnyNumber = createPlaceStore({ map: mapOf(key), now });
  expect([
    store.place("d1"),
    store.place("d2"),
    store.place("d3"),
    store.place("d4"),
    store.place("d5"),
    store.panels(),
    store.ruler(),
    store.noticeShown("d1"),
    unknownTab.panels(),
    pastAnyNumber.place("d1"),
    pastAnyNumber.place("d2"),
    pastAnyNumber.panels(),
  ]).toEqual([
    null,
    null,
    null,
    null,
    null,
    null,
    false,
    false,
    null,
    null,
    null,
    null,
  ]);
});

test("the comfort notice is marked once per script", () => {
  const store = createPlaceStore({ map: mapOf("manent.place.ana"), now });
  store.markNoticeShown("d1");
  const again = createPlaceStore({ map: mapOf("manent.place.ana"), now });
  expect([again.noticeShown("d1"), again.noticeShown("d2")]).toEqual([
    true,
    false,
  ]);
});

test("the place of each person lives under their own key", () => {
  expect([placeKey("dana"), placeKey("sam")]).toEqual([
    "manent.place.dana",
    "manent.place.sam",
  ]);
});

/** The services of `userId` over `shared`, on `clock`. */
const servicesOf = (
  userId: string,
  shared: MemoryStorage,
  clock: ReturnType<typeof createClock>,
) =>
  testServices({
    userId,
    environment: testEnvironment({
      storage: shared,
      now: clock.now,
      schedule: clock.schedule,
    }),
  });

test("the panels and the Ruler a person left are theirs again when their services start", () => {
  const shared = new MemoryStorage();
  const clock = createClock();
  const dana = servicesOf("dana", shared, clock);
  panelsActions.open("left", "scenes");
  panelsActions.resize("left", 300);
  rulerActions.set(true);
  clock.advance(500);
  dana.dispose();
  panelsActions.close("left");
  rulerActions.set(false);
  servicesOf("dana", shared, clock);
  expect([panelsActions.get(), rulerActions.get()]).toEqual([
    { left: { tab: "scenes", widthPx: 300 }, side: PANELS.side },
    true,
  ]);
});

test("the panels are saved at most every half second, the last state at the end, and at once when the page is left", () => {
  const shared = new MemoryStorage();
  const clock = createClock();
  servicesOf("sam", shared, clock);
  const saved = (): unknown =>
    Reflect.get(JSON.parse(shared.getItem(placeKey("sam")) ?? "{}"), "panels");
  panelsActions.resize("side", 300);
  clock.advance(250);
  panelsActions.resize("side", 340);
  const early = saved();
  clock.advance(250);
  const late = saved();
  panelsActions.open("side", "details");
  globalThis.dispatchEvent(new Event("pagehide"));
  expect([early, late, saved()]).toEqual([
    undefined,
    { left: { tab: null, widthPx: 260 }, side: { tab: null, widthPx: 340 } },
    {
      left: { tab: null, widthPx: 260 },
      side: { tab: "details", widthPx: 340 },
    },
  ]);
});

test("a new person's services take the panels over, so the person before keeps their own", () => {
  const shared = new MemoryStorage();
  const clock = createClock();
  const dana = servicesOf("dana", shared, clock);
  panelsActions.close("left");
  panelsActions.open("side", "history");
  // the next person's services are built before the last person's are disposed
  const sam = servicesOf("sam", shared, clock);
  const forSam = panelsActions.get();
  panelsActions.open("left", "scenes");
  clock.advance(500);
  dana.dispose();
  sam.dispose();
  servicesOf("dana", shared, clock);
  expect([forSam.side.tab, panelsActions.get()]).toEqual([
    null,
    {
      left: { tab: null, widthPx: 260 },
      side: { tab: "history", widthPx: 320 },
    },
  ]);
});

test("services built again for the same person keep every entry the earlier ones wrote", () => {
  const shared = new MemoryStorage();
  const clock = createClock();
  const first = servicesOf("dana", shared, clock);
  servicesOf("dana", shared, clock);
  // an editor the first services mounted saves its place after the second services exist
  first.place.savePlace("d1", PLACE);
  panelsActions.open("side", "history");
  clock.advance(500);
  const stored = createPlaceStore({ map: mapOfIn(shared, "dana"), now });
  expect([stored.place("d1"), stored.panels()?.side]).toEqual([
    PLACE,
    { tab: "history", widthPx: 320 },
  ]);
});

/** Mostly one of `valid`, otherwise one of `wrong`: values near enough to a stored shape to reach each of its checks. */
const nearly = <T>(valid: fc.Arbitrary<T>, ...wrong: unknown[]) =>
  fc.oneof(
    { arbitrary: valid, weight: 4 },
    { arbitrary: fc.constantFrom(...wrong), weight: 1 },
  );
// an undefined member stands for a key left out
const nearBlockId = nearly(
  fc.constantFrom("block-0001", "b"),
  4,
  null,
  undefined,
);
const nearPixels = nearly(
  fc.constantFrom(0, 12.5, -40),
  Infinity,
  -Infinity,
  "12",
  null,
  undefined,
);
const nearBlockPlace = nearly(
  fc.record({
    blockId: nearBlockId,
    offset: nearly(fc.constantFrom(0, 3), -1, 1.5, "3", undefined),
  }),
  "b",
  null,
  [],
);
const nearKeptPlace = fc.record({
  place: nearly(
    fc.record({
      anchor: nearBlockPlace,
      head: nearBlockPlace,
      top: nearly(
        fc.record({ blockId: nearBlockId, offsetPx: nearPixels }),
        null,
        undefined,
      ),
    }),
    null,
    7,
  ),
  at: nearPixels,
});
const nearPanel = (tabs: readonly string[], otherTabs: readonly string[]) =>
  nearly(
    fc.record({
      tab: nearly(
        fc.constantFrom(null, ...tabs),
        ...otherTabs,
        "notes",
        undefined,
      ),
      widthPx: nearPixels,
    }),
    null,
    "scenes",
  );
const nearPanels = fc.record({
  left: nearPanel(LEFT_TABS, SIDE_TABS),
  side: nearPanel(SIDE_TABS, LEFT_TABS),
});
const nearZoom = nearly(
  fc.constantFrom("fit_width", 50, 75, 300),
  "fit",
  40,
  301,
  112.5,
  Infinity,
  null,
);
/** A near-valid entry, any JSON at all, or none. */
const entryOf = (near: fc.Arbitrary<unknown>) =>
  fc.oneof(near, fc.jsonValue(), fc.constant(undefined));
const storedState = fc.oneof(
  {
    arbitrary: fc.record({
      "doc:d1": entryOf(nearKeptPlace),
      panels: entryOf(nearPanels),
      ruler: entryOf(fc.constantFrom(true, false, "on")),
      zoom: entryOf(nearZoom),
      "notice:d1": entryOf(fc.constantFrom(true, 1)),
    }),
    weight: 4,
  },
  { arbitrary: fc.jsonValue(), weight: 1 },
);

test("whatever another build stored, each entry reads as nothing or as itself, and the view takes what is read", () => {
  fc.assert(
    fc.property(storedState, (state) => {
      const text = jsonText(state);
      const shared = new MemoryStorage();
      shared.setItem(placeKey("leo"), text);
      const stored: unknown = JSON.parse(text);
      const entry = (key: string): unknown =>
        typeof stored === "object" && stored !== null && !Array.isArray(stored)
          ? Reflect.get(stored, key)
          : undefined;
      const kept = entry("doc:d1");
      const keptPlace =
        typeof kept === "object" && kept !== null
          ? Reflect.get(kept, "place")
          : undefined;
      const store = createPlaceStore({ map: mapOfIn(shared, "leo"), now });
      const [place, panels, zoom] = [
        store.place("d1"),
        store.panels(),
        store.zoom(),
      ];
      keepViewState(store, () => () => {})();
      const shown = panelsActions.get();
      // a read of nothing is put back as what was stored, so any other read must equal it exactly
      expect([
        place ?? keptPlace,
        panels ?? entry("panels"),
        zoom ?? entry("zoom"),
      ]).toEqual([keptPlace, entry("panels"), entry("zoom")]);
      expect([
        [shown.left.tab, shown.side.tab],
        zoomActions.get(),
        [store.ruler(), rulerActions.get(), store.noticeShown("d1")],
      ]).toEqual([
        [panels?.left.tab ?? null, panels?.side.tab ?? null],
        zoom ?? "fit_width",
        [
          entry("ruler") === true,
          entry("ruler") === true,
          entry("notice:d1") === true,
        ],
      ]);
    }),
    { numRuns: 1000 },
  );
});

test("a place, the panels and the zoom saved are read back as they were", () => {
  // JSON writes -0 as 0, the same distance
  const finite = fc
    .double({ noNaN: true, noDefaultInfinity: true })
    .filter((n) => !Object.is(n, -0));
  const blockPlace = fc.record({ blockId: fc.string(), offset: fc.nat() });
  const panel = <T extends string>(tabs: readonly T[]) =>
    fc.record({ tab: fc.constantFrom(null, ...tabs), widthPx: finite });
  fc.assert(
    fc.property(
      fc.record({
        anchor: blockPlace,
        head: blockPlace,
        top: fc.record({ blockId: fc.string(), offsetPx: finite }),
      }),
      fc.record({ left: panel(LEFT_TABS), side: panel(SIDE_TABS) }),
      fc.oneof(
        fc.constant("fit_width" as const),
        fc.integer({ min: 50, max: 300 }),
      ),
      (place, panels, zoom) => {
        const shared = new MemoryStorage();
        const store = createPlaceStore({ map: mapOfIn(shared, "leo"), now });
        store.savePlace("d1", place);
        store.savePanels(panels);
        store.saveZoom(zoom);
        const again = createPlaceStore({ map: mapOfIn(shared, "leo"), now });
        expect([again.place("d1"), again.panels(), again.zoom()]).toEqual([
          place,
          panels,
          zoom,
        ]);
      },
    ),
    { numRuns: 300 },
  );
});
