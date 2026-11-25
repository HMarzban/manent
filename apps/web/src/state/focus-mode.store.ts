// Whether Focus mode is on: hides both panels while keeping status bars visible; written only by interface events.
import type { LeftTab, SideTab } from "@manent/commands";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";
import { panelsActions } from "./panels.store.ts";

/** Panel tabs remembered when entering Focus mode, restored when toggled off. */
export interface FocusRememberedPanels {
  readonly left: LeftTab | null;
  readonly side: SideTab | null;
}

const EMPTY_REMEMBERED: FocusRememberedPanels = Object.freeze({
  left: null,
  side: null,
});

const store = createStore<{ active: boolean }>()(() => ({ active: false }));

let remembered: FocusRememberedPanels = EMPTY_REMEMBERED;
let stopPanelWatch: (() => void) | null = null;
let closingPanels = false;

const read = (): boolean => store.getState().active;

function detachPanelWatch(): void {
  stopPanelWatch?.();
  stopPanelWatch = null;
}

function attachPanelWatch(): void {
  detachPanelWatch();
  stopPanelWatch = panelsActions.subscribe(() => {
    if (!read() || closingPanels) return;
    const { left, side } = panelsActions.get();
    if (left.tab !== null || side.tab !== null) leave(false);
  });
}

function closeBothPanels(): void {
  const { left, side } = panelsActions.get();
  closingPanels = true;
  try {
    if (left.tab !== null) panelsActions.close("left");
    if (side.tab !== null) panelsActions.close("side");
  } finally {
    closingPanels = false;
  }
}

function enter(initialRemembered?: FocusRememberedPanels): void {
  guardWrite("focus_mode");
  if (read()) return;
  const current = panelsActions.get();
  remembered = initialRemembered ?? {
    left: current.left.tab,
    side: current.side.tab,
  };
  closeBothPanels();
  attachPanelWatch();
  store.setState({ active: true });
}

function leave(restorePanels: boolean): void {
  guardWrite("focus_mode");
  if (!read()) return;
  const toRestore = remembered;
  remembered = EMPTY_REMEMBERED;
  detachPanelWatch();
  store.setState({ active: false });
  if (restorePanels) {
    if (toRestore.left !== null) panelsActions.open("left", toRestore.left);
    if (toRestore.side !== null) panelsActions.open("side", toRestore.side);
  }
}

export function useFocusMode(): boolean {
  return useSyncExternalStore(store.subscribe, read, read);
}

/** `get` is what a command's context reads; `subscribe`'s listener hears every change. */
export const focusModeActions: {
  get(): boolean;
  remembered(): FocusRememberedPanels | null;
  set(on: boolean): void;
  toggle(): void;
  /** Restores Focus mode from per-device view state without reopening remembered panels when turning off. */
  restore(on: boolean, savedPanels: FocusRememberedPanels | null): void;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  get: read,
  remembered: () => (read() ? remembered : null),
  set(on: boolean) {
    if (on) enter();
    else leave(true);
  },
  toggle() {
    if (read()) leave(true);
    else enter();
  },
  restore(on: boolean, savedPanels: FocusRememberedPanels | null) {
    if (on) {
      if (read()) {
        guardWrite("focus_mode");
        remembered = savedPanels ?? EMPTY_REMEMBERED;
        closeBothPanels();
        attachPanelWatch();
        return;
      }
      enter(savedPanels ?? EMPTY_REMEMBERED);
    } else {
      remembered = EMPTY_REMEMBERED;
      detachPanelWatch();
      if (read()) {
        guardWrite("focus_mode");
        store.setState({ active: false });
      }
    }
  },
  subscribe: (listener: () => void) => store.subscribe(() => listener()),
});
