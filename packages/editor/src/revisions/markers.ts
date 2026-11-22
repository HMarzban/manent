// A lock beside the page number of each locked page in view, in the layer outside the zoomed pages, saying
// where text that no longer fits the page goes. It is a picture with a name, never a control.
import { nextLabel } from "@manent/revisions";
import { Plugin } from "prosemirror-state";
import type { PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { paginationKey } from "../pagination/plugin.ts";

interface LockMarkerOptions {
  layer: () => HTMLElement | null;
  /** The marker's accessible name. */
  name: string;
  /** The marker's description and title, given the label that extra text on its page goes to. */
  tooltip: (next: string) => string;
  zoom: () => number;
  /** A fresh copy of the host's lock icon. */
  icon: () => Element;
}

const MARKER_PX = 24;
/** The page number's row, 36pt down the sheet. */
const NUMBER_ROW_PX = 48;
/** The gap between the sheet's right edge and the marker. */
const GUTTER_GAP_PX = 8;

interface Spot {
  readonly top: number;
  readonly left: number;
  /** The label extra text on the page goes to. */
  readonly next: string;
}

/** Where each drawn sheet of a locked page puts its marker, in the layer's coordinates. */
function spotsOf(view: EditorView, layer: HTMLElement, zoom: number): Spot[] {
  const pages = paginationKey.getState(view.state);
  const frame = view.dom.parentElement;
  if (pages === undefined || frame === null) return [];
  const { pagination, settings } = pages;
  const origin = layer.getBoundingClientRect();
  return [...frame.querySelectorAll<HTMLElement>(".mn-sheet[data-page]")]
    .map((sheet) => ({ sheet, index: Number(sheet.dataset["page"]) }))
    .filter(({ index }) => pagination.pages[index]?.locked === true)
    .toSorted((a, b) => a.index - b.index)
    .map(({ sheet, index }) => {
      const box = sheet.getBoundingClientRect();
      return {
        top: box.top - origin.top + NUMBER_ROW_PX * zoom,
        left: box.right - origin.left + GUTTER_GAP_PX,
        next: nextLabel(pagination, index, settings.engine),
      };
    });
}

function markerOf(
  doc: Document,
  spot: Spot,
  options: LockMarkerOptions,
): HTMLElement {
  const marker = doc.createElement("span");
  marker.className = "mn-marker mn-marker-lock";
  marker.setAttribute("role", "img");
  marker.setAttribute("aria-label", options.name);
  marker.setAttribute("data-tour", "page_lock");
  const sentence = options.tooltip(spot.next);
  marker.setAttribute("aria-description", sentence);
  marker.title = sentence;
  Object.assign(marker.style, {
    position: "absolute",
    top: `${spot.top}px`,
    left: `${spot.left}px`,
    width: `${MARKER_PX}px`,
    height: `${MARKER_PX}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });
  marker.append(options.icon());
  return marker;
}

/** Draws the markers again whenever the pages change or the sheets in view are drawn again, and only then. */
function markersView(view: EditorView, options: LockMarkerOptions): PluginView {
  let drawn: HTMLElement[] = [];
  let key = "";
  const draw = () => {
    const layer = options.layer();
    const spots = layer === null ? [] : spotsOf(view, layer, options.zoom());
    const next = JSON.stringify(spots);
    if (next === key) return;
    key = next;
    for (const marker of drawn) marker.remove();
    drawn =
      layer === null
        ? []
        : spots.map((spot) => markerOf(layer.ownerDocument, spot, options));
    layer?.append(...drawn);
  };
  // the page scaffold names each sheet it draws, on scroll and zoom as well as when the pages change
  const sheets = new MutationObserver(draw);
  if (view.dom.parentElement !== null)
    sheets.observe(view.dom.parentElement, {
      subtree: true,
      attributeFilter: ["data-page"],
    });
  draw();
  return {
    update(_, prev) {
      if (
        paginationKey.getState(prev)?.pagination !==
        paginationKey.getState(view.state)?.pagination
      )
        draw();
    },
    destroy() {
      sheets.disconnect();
      for (const marker of drawn) marker.remove();
    },
  };
}

/** A lock marker beside the page number of each locked page in view. */
export function lockMarkersPlugin(options: LockMarkerOptions): Plugin {
  return new Plugin({ view: (view) => markersView(view, options) });
}
