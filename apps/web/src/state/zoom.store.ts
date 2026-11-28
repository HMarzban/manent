// The page's zoom: view state, Fit width by default and kept per person; written only by interface events.

import { ZOOM_MAX, ZOOM_MIN } from "@manent/commands";
import type { ZoomSetting } from "@manent/editor";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

const store = createStore<{ zoom: ZoomSetting }>()(() => ({
  zoom: "fit_width",
}));

const read = () => store.getState().zoom;

export function useZoom(): ZoomSetting {
  return useSyncExternalStore(store.subscribe, read, read);
}

/** `set` clamps a number to ZOOM_MIN … ZOOM_MAX and rounds it. */
export const zoomActions: {
  set(zoom: ZoomSetting): void;
  get(): ZoomSetting;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  set(zoom: ZoomSetting) {
    guardWrite("zoom");
    store.setState({
      zoom:
        zoom === "fit_width"
          ? zoom
          : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom))),
    });
  },
  get: read,
  subscribe: (listener: () => void) => store.subscribe(() => listener()),
});
