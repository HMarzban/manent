// Where each person left each script, the panels, the Ruler, the view of the pages and the zoom as they left them, and
// the notices they have seen: view state, kept on this device per person and never in the script.
import { LEFT_TABS, PANEL_IDS, SIDE_TABS } from "@manent/commands";
import type {
  BlockPlace,
  LayoutView,
  SavedPlace,
  ZoomSetting,
} from "@manent/editor";
import type { KeyValueMap } from "@manent/settings";
import { layoutViewActions } from "../state/layout-view.store.ts";
import { panelsActions } from "../state/panels.store.ts";
import type { PanelsState } from "../state/panels.store.ts";
import { rulerActions } from "../state/ruler.store.ts";
import { throttle } from "../state/throttle.ts";
import { ZOOM_PRESETS } from "../state/zoom-presets.ts";
import { zoomActions } from "../state/zoom.store.ts";

/** The storage key of a person's place state, held in one local map. */
export const placeKey = (userId: string): string => `manent.place.${userId}`;

/** The scripts whose place is kept; saving one more forgets the one saved longest ago. */
export const MAX_PLACES = 200;

/** A value stored in the wrong shape reads as absent; a write the storage refuses is lost, and nothing else. */
export interface PlaceStore {
  /** Null when this device holds no place for the script. */
  place(docId: string): SavedPlace | null;
  savePlace(docId: string, place: SavedPlace): void;
  /** Null until the person's panels are first saved here. */
  panels(): PanelsState | null;
  savePanels(state: PanelsState): void;
  /** False until the person shows it. */
  ruler(): boolean;
  saveRuler(shown: boolean): void;
  /** Page view until the person chooses Reflow view. */
  layoutView(): LayoutView;
  saveLayoutView(view: LayoutView): void;
  /** Null until the person's zoom is first saved here. */
  zoom(): ZoomSetting | null;
  saveZoom(zoom: ZoomSetting): void;
  /** Whether this device has shown that the script is past the comfort limit. */
  noticeShown(docId: string): boolean;
  markNoticeShown(docId: string): void;
}

/** A place with the time it was saved, ms since the epoch. */
interface KeptPlace {
  place: SavedPlace;
  at: number;
}

const DOC_PREFIX = "doc:";

// an array lacks every field the shapes below need, so each check refuses it
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const isBlockPlace = (value: unknown): value is BlockPlace =>
  isRecord(value) &&
  typeof value.blockId === "string" &&
  typeof value.offset === "number" &&
  Number.isInteger(value.offset) &&
  value.offset >= 0;

const isSavedPlace = (value: unknown): value is SavedPlace =>
  isRecord(value) &&
  isBlockPlace(value.anchor) &&
  isBlockPlace(value.head) &&
  isRecord(value.top) &&
  typeof value.top.blockId === "string" &&
  Number.isFinite(value.top.offsetPx);

const isKeptPlace = (value: unknown): value is KeptPlace =>
  isRecord(value) && isSavedPlace(value.place) && Number.isFinite(value.at);

const isPanel = <T extends string>(
  tabs: readonly T[],
  value: unknown,
): value is { tab: T | null; widthPx: number } =>
  isRecord(value) &&
  (value.tab === null || tabs.some((tab) => tab === value.tab)) &&
  Number.isFinite(value.widthPx);

const isPanelsState = (value: unknown): value is PanelsState =>
  isRecord(value) &&
  isPanel(LEFT_TABS, value.left) &&
  isPanel(SIDE_TABS, value.side);

// a percent from the editor's ZOOM_MIN to its ZOOM_MAX, which the presets begin and end at
const isZoomSetting = (value: unknown): value is ZoomSetting =>
  value === "fit_width" ||
  (typeof value === "number" &&
    Number.isInteger(value) &&
    value >= Math.min(...ZOOM_PRESETS) &&
    value <= Math.max(...ZOOM_PRESETS));

/** The place state in `map`; `now` stamps each saved place, so the oldest is the one forgotten. */
export function createPlaceStore(options: {
  map: KeyValueMap;
  now: () => number;
}): PlaceStore {
  const { map, now } = options;
  const kept = (key: string): KeptPlace | null => {
    const value = map.get(key);
    return isKeptPlace(value) ? value : null;
  };
  const forgetOldest = (): void => {
    const places = map.keys().flatMap((key) => {
      const at = key.startsWith(DOC_PREFIX) ? kept(key)?.at : undefined;
      return at === undefined ? [] : [{ key, at }];
    });
    const over = places.length - MAX_PLACES;
    if (over <= 0) return;
    for (const { key } of places.toSorted((a, b) => a.at - b.at).slice(0, over))
      // a stored map is JSON, which leaves an undefined value out, so a forgotten script takes no room
      map.set(key, undefined);
  };
  return {
    place: (docId) => kept(`${DOC_PREFIX}${docId}`)?.place ?? null,
    savePlace(docId, place) {
      map.set(`${DOC_PREFIX}${docId}`, { place, at: now() });
      forgetOldest();
    },
    panels() {
      const value = map.get("panels");
      return isPanelsState(value) ? value : null;
    },
    savePanels: (state) => map.set("panels", state),
    ruler: () => map.get("ruler") === true,
    saveRuler: (shown) => map.set("ruler", shown),
    layoutView: () => (map.get("layoutView") === "reflow" ? "reflow" : "page"),
    saveLayoutView: (view) => map.set("layoutView", view),
    zoom() {
      const value = map.get("zoom");
      return isZoomSetting(value) ? value : null;
    },
    saveZoom: (zoom) => map.set("zoom", zoom),
    noticeShown: (docId) => map.get(`notice:${docId}`) === true,
    markNoticeShown: (docId) => map.set(`notice:${docId}`, true),
  };
}

/** Runs `save` each time the page is hidden (another tab, a minimised window) and when it is left or reloaded; returns the disposer. */
export function whenPageLeaves(save: () => void): () => void {
  const onVisibility = (): void => {
    if (document.visibilityState === "hidden") save();
  };
  // the global object hears the document's visibilitychange as it bubbles, and exists in a process with no page
  globalThis.addEventListener("visibilitychange", onVisibility);
  globalThis.addEventListener("pagehide", save);
  return () => {
    globalThis.removeEventListener("visibilitychange", onVisibility);
    globalThis.removeEventListener("pagehide", save);
  };
}

const VIEW_SAVE_MS = 500;
// the panels as someone who never changed them sees them
const FIRST_PANELS = panelsActions.get();
const noop = (): void => {};
// the view stores belong to the tab, and hold one person's view state at a time
let stopCurrentKeeper = noop;

/** Opens and sizes each panel as `state` holds it, writing only what differs. */
function restorePanels(state: PanelsState): void {
  for (const panel of PANEL_IDS) {
    const { tab, widthPx } = state[panel];
    const shown = panelsActions.get()[panel];
    if (tab !== shown.tab) {
      if (tab === null) panelsActions.close(panel);
      else panelsActions.open(panel, tab);
    }
    if (widthPx !== shown.widthPx) panelsActions.resize(panel, widthPx);
  }
}

/**
 * Puts the person's panels, Ruler, view of the pages and zoom (Fit width until they choose one) from `store` into the
 * tab's stores and saves each change back: the panels and the zoom at most once per 500 ms, the last state at the end,
 * and whenever the page is hidden or left; the Ruler and the view at once. The person whose view state the stores held saves it and stops first. Returns the
 * stop, which saves too.
 */
export function keepViewState(
  store: PlaceStore,
  schedule: (fn: () => void, delayMs: number) => () => void,
): () => void {
  stopCurrentKeeper();
  restorePanels(store.panels() ?? FIRST_PANELS);
  if (rulerActions.get() !== store.ruler()) rulerActions.set(store.ruler());
  if (layoutViewActions.get() !== store.layoutView())
    layoutViewActions.set(store.layoutView());
  const keptZoom = store.zoom() ?? "fit_width";
  if (zoomActions.get() !== keptZoom) zoomActions.set(keptZoom);
  const savePanels = (): void => store.savePanels(panelsActions.get());
  const saveZoom = (): void => store.saveZoom(zoomActions.get());
  const every = { delayMs: VIEW_SAVE_MS, schedule, paused: () => false };
  const panels = throttle(every, savePanels);
  const zoom = throttle(every, saveZoom);
  const flush = (): void => {
    panels.cancel();
    zoom.cancel();
    savePanels();
    saveZoom();
  };
  const stops = [
    panelsActions.subscribe(() => panels.request()),
    zoomActions.subscribe(() => zoom.request()),
    rulerActions.subscribe(() => store.saveRuler(rulerActions.get())),
    layoutViewActions.subscribe(() =>
      store.saveLayoutView(layoutViewActions.get()),
    ),
    whenPageLeaves(flush),
  ];
  const stop = (): void => {
    if (stopCurrentKeeper !== stop) return;
    stopCurrentKeeper = noop;
    flush();
    for (const unsubscribe of stops) unsubscribe();
  };
  stopCurrentKeeper = stop;
  return stop;
}
