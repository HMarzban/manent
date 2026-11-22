// Which view the pages are drawn in, Page view or Reflow view: view state, Page view by default and kept per person on
// this device; written only by interface events.

import type { LayoutView } from "@manent/editor";
import { createStore } from "zustand";
import { guardWrite } from "./guard.ts";

const store = createStore<{ view: LayoutView }>()(() => ({ view: "page" }));

const read = () => store.getState().view;

function setView(view: LayoutView): void {
  guardWrite("layout_view");
  store.setState({ view });
}

export const layoutViewActions: {
  set(view: LayoutView): void;
  get(): LayoutView;
  subscribe(listener: () => void): () => void;
} = Object.freeze({
  set: setView,
  get: read,
  subscribe: (listener: () => void) => store.subscribe(() => listener()),
});
