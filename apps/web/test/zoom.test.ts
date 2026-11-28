import { expect, test } from "bun:test";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_PRESETS } from "@manent/commands";
import {
  ZOOM_MAX as EDITOR_ZOOM_MAX,
  ZOOM_MIN as EDITOR_ZOOM_MIN,
} from "@manent/editor";
import { createPlaceStore, placeKey } from "../src/editor-host/place.ts";
import {
  pinchZoom,
  zoomAnnouncement,
  zoomStep,
} from "../src/editor-host/zoom.ts";
import { createLocalMap } from "../src/services/local-map.ts";
import { bindGuard, createGuard } from "../src/state/guard.ts";
import { zoomActions } from "../src/state/zoom.store.ts";
import {
  MemoryStorage,
  createClock,
  createStorageEvents,
  testEnvironment,
  testServices,
} from "./services.fixtures.ts";

bindGuard(createGuard({ flavour: "test" }));

/** The place store `userId` has in `shared`. */
const storeOf = (shared: MemoryStorage, userId: string) =>
  createPlaceStore({
    map: createLocalMap({
      storage: shared,
      key: placeKey(userId),
      events: createStorageEvents().events,
    }),
    now: () => 0,
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

test("zoom steps through the presets and stops at the ends", () => {
  expect([
    zoomStep(100, "in"),
    zoomStep(113, "in"),
    zoomStep(113, "out"),
    zoomStep(300, "in"),
    zoomStep(50, "out"),
  ]).toEqual([125, 125, 100, null, null]);
  expect([
    pinchZoom(100, -100),
    pinchZoom(60, 500),
    pinchZoom(290, -100),
  ]).toEqual([272, 50, 300]);
});

test("a zoom is said as its palette row reads", () => {
  expect([zoomAnnouncement(125), zoomAnnouncement("fit_width")]).toEqual([
    "Zoom: 125\u00a0%",
    "Zoom: Fit width",
  ]);
});

test("the zoom comes back for the same person and starts at Fit width for anyone else", () => {
  const shared = new MemoryStorage();
  const clock = createClock();
  storeOf(shared, "dana").saveZoom(150);
  servicesOf("dana", shared, clock);
  const forDana = zoomActions.get();
  servicesOf("sam", shared, clock);
  expect([
    storeOf(shared, "dana").zoom(),
    storeOf(shared, "sam").zoom(),
    forDana,
    zoomActions.get(),
  ]).toEqual([150, null, 150, "fit_width"]);
});

test("the zoom is saved at most every half second, the last value at the end, and at once when the page is left", () => {
  const shared = new MemoryStorage();
  const clock = createClock();
  servicesOf("priya", shared, clock);
  const saved = (): unknown =>
    Reflect.get(JSON.parse(shared.getItem(placeKey("priya")) ?? "{}"), "zoom");
  zoomActions.set(125);
  clock.advance(250);
  zoomActions.set(150);
  const early = saved();
  clock.advance(250);
  const late = saved();
  zoomActions.set("fit_width");
  globalThis.dispatchEvent(new Event("pagehide"));
  expect([early, late, saved()]).toEqual([undefined, 150, "fit_width"]);
});

test("a stored zoom of the wrong shape reads as nothing", () => {
  const shared = new MemoryStorage();
  const values = ["fit", 40, 301, 112.5, null, "fit_width", 75];
  expect(
    values.map((value) => {
      shared.setItem(placeKey("leo"), JSON.stringify({ zoom: value }));
      return storeOf(shared, "leo").zoom();
    }),
  ).toEqual([null, null, null, null, null, "fit_width", 75]);
});

test("command zoom bounds match the editor's zoom bounds", () => {
  expect([
    ZOOM_PRESETS[0],
    ZOOM_PRESETS[ZOOM_PRESETS.length - 1],
    ZOOM_MIN,
    ZOOM_MAX,
  ]).toEqual([
    EDITOR_ZOOM_MIN,
    EDITOR_ZOOM_MAX,
    EDITOR_ZOOM_MIN,
    EDITOR_ZOOM_MAX,
  ]);
});
