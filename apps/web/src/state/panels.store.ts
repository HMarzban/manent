// Which tab each panel shows and how wide it is; written only by interface events.

import { LEFT_TABS, SIDE_TABS } from "@manent/commands";
import type { LeftTab, PanelId, SideTab } from "@manent/commands";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

export interface PanelsState {
  left: { tab: LeftTab | null; widthPx: number };
  side: { tab: SideTab | null; widthPx: number };
}

const WIDTHS_PX: Readonly<
  Record<PanelId, { min: number; max: number; initial: number }>
> = Object.freeze({
  left: { min: 200, max: 360, initial: 260 },
  side: { min: 280, max: 420, initial: 320 },
});

const store = createStore<PanelsState>()(() => ({
  left: { tab: null, widthPx: WIDTHS_PX.left.initial },
  side: { tab: null, widthPx: WIDTHS_PX.side.initial },
}));

// until the left panel is chosen, a script that opens with three or more scenes opens it
let leftChosen = false;
// true while the left panel shows the Scenes a script opened, until a tab of it is opened or closed
let scenesUnchosen = false;

const isLeftTab = (tab: string | null): tab is LeftTab | null =>
  tab === null || LEFT_TABS.some((t) => t === tab);
const isSideTab = (tab: string | null): tab is SideTab | null =>
  tab === null || SIDE_TABS.some((t) => t === tab);

function setTab(panel: PanelId, tab: string | null): void {
  guardWrite("panels");
  const { left, side } = store.getState();
  if (panel === "left" && isLeftTab(tab)) {
    leftChosen = true;
    scenesUnchosen = false;
    store.setState({ left: { ...left, tab } });
  } else if (panel === "side" && isSideTab(tab))
    store.setState({ side: { ...side, tab } });
  else throw new RangeError(`${tab} is not a tab of the ${panel} panel`);
}

/** The tab `panel` shows (null when closed) and its width; the same object while neither changes. */
export function usePanel(panel: PanelId): {
  tab: string | null;
  widthPx: number;
} {
  const read = () => store.getState()[panel];
  return useSyncExternalStore(store.subscribe, read, read);
}

/** Opening a tab that is not the panel's throws a RangeError; a width is clamped to the panel's range, and one that is not finite throws a RangeError. */
export const panelsActions: {
  open(panel: PanelId, tab: string): void;
  /** Opens the left panel at Scenes while the person has made no choice of it. */
  openScenesUnchosen(): void;
  /**
   * Whether the left panel is past its first opening: the person opened or closed it, or a script opened it at
   * Scenes. Set from the person's view state when it is put back.
   */
  leftChosen(): boolean;
  /** Whether the left panel shows the Scenes a script opened rather than a tab the person opened. */
  scenesUnchosen(): boolean;
  setLeftChosen(chosen: boolean): void;
  close(panel: PanelId): void;
  toggle(panel: PanelId, tab: string): void;
  resize(panel: PanelId, widthPx: number): void;
  get(): PanelsState;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  open: (panel: PanelId, tab: string) => setTab(panel, tab),
  openScenesUnchosen() {
    const { left } = store.getState();
    if (leftChosen || left.tab !== null) return;
    guardWrite("panels");
    leftChosen = true;
    scenesUnchosen = true;
    store.setState({ left: { ...left, tab: "scenes" } });
  },
  leftChosen: () => leftChosen,
  scenesUnchosen: () => scenesUnchosen,
  setLeftChosen(chosen: boolean) {
    leftChosen = chosen;
  },
  close: (panel: PanelId) => setTab(panel, null),
  toggle(panel: PanelId, tab: string) {
    setTab(panel, store.getState()[panel].tab === tab ? null : tab);
  },
  resize(panel: PanelId, widthPx: number) {
    if (!Number.isFinite(widthPx))
      throw new RangeError(`a panel width must be finite, not ${widthPx}`);
    guardWrite("panels");
    const { min, max } = WIDTHS_PX[panel];
    const state = store.getState()[panel];
    const clamped = Math.min(max, Math.max(min, widthPx));
    store.setState({ [panel]: { ...state, widthPx: clamped } });
  },
  get: () => store.getState(),
  subscribe: (listener: () => void) => store.subscribe(() => listener()),
});
