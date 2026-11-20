import { expect, test } from "bun:test";
import type { SavedPlace } from "@manent/editor";
import {
  MAX_PLACES,
  createPlaceStore,
  placeKey,
} from "../src/editor-host/place.ts";
import { createLocalMap } from "../src/services/local-map.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { panelsActions } from "../src/state/panels.store.ts";
import type { PanelsState } from "../src/state/panels.store.ts";
import { rulerActions } from "../src/state/ruler.store.ts";
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
  expect([
    store.place("d1"),
    store.place("d2"),
    store.place("d3"),
    store.panels(),
    store.ruler(),
    store.noticeShown("d1"),
    unknownTab.panels(),
  ]).toEqual([null, null, null, null, false, false, null]);
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
