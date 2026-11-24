// One marker per block with annotations, in the desk gutter beside the sheet, level with the block's first line.
// Placed from the engine's pages on the sheets in view, inside the zoomed pages and scaled back to its own size.
import type { EditorView } from "prosemirror-view";
import { markPosition } from "../changes/layer.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { PaginationState } from "../pagination/plugin.ts";
import type { Place } from "./anchor-places.ts";

interface Marker {
  readonly blockId: string;
  readonly block: number;
  /** In the host's order. */
  readonly ids: string[];
  open: boolean;
}

interface Spot {
  readonly marker: Marker;
  /** Unzoomed px from the top left of the first sheet. */
  readonly top: number;
  readonly left: number;
}

export interface GutterActions {
  label(count: number): string;
  onActivate(id: string, at: { left: number; top: number }): void;
  /** The block whose marker the pointer is over; null once it leaves. */
  hover(blockId: string | null): void;
}

export interface Gutter {
  /** Places the markers again; nothing changes in the page when they stand where they stood. */
  draw(): void;
  destroy(): void;
}

function markersOf(places: readonly Place[]): Marker[] {
  const byBlock = new Map<number, Marker>();
  for (const { annotation, anchor, block } of places) {
    if (block === null) continue;
    const marker = byBlock.get(block);
    if (marker === undefined)
      byBlock.set(block, {
        blockId: anchor.blockId,
        block,
        ids: [annotation.id],
        open: annotation.open,
      });
    else {
      marker.ids.push(annotation.id);
      marker.open ||= annotation.open;
    }
  }
  return [...byBlock.values()];
}

/** The pages whose sheets are drawn in `frame`. */
function drawnPages(frame: HTMLElement, count: number): number[] {
  const pages = [...frame.querySelectorAll<HTMLElement>(".mn-sheet[data-page]")]
    .map((sheet) => Number(sheet.dataset["page"]))
    .filter((k) => Number.isInteger(k) && k >= 0 && k < count);
  return [...new Set(pages)].toSorted((a, b) => a - b);
}

/** Where each marker whose block starts on a drawn page stands: the gutter, level with the block's first line. */
function spotsOf(
  frame: HTMLElement,
  pages: PaginationState,
  markers: readonly Marker[],
): Spot[] {
  const { pagination, settings } = pages;
  return drawnPages(frame, pagination.pages.length).flatMap((k) => {
    const first = pagination.pages[k]!.block;
    const last = pagination.pages[k + 1]?.block ?? pagination.blocks.length - 1;
    const here = markers.filter((m) => m.block >= first && m.block <= last);
    if (here.length === 0) return [];
    const lines = settings.engine.linePlacesOf(pagination, k);
    return here.flatMap((marker) => {
      const line = lines.find(
        (l) => l.blockLine === 0 && l.blockId === marker.blockId,
      );
      if (line === undefined) return [];
      const at = markPosition(pagination.profile, k, line.y);
      return [{ marker, top: at.topPx, left: at.gutterPx }];
    });
  });
}

/** The page's zoom, from the zoomed frame's drawn and laid-out widths; 1 before it is laid out. */
function zoomOf(frame: HTMLElement): number {
  const drawn = frame.getBoundingClientRect().width;
  return drawn > 0 && frame.offsetWidth > 0 ? drawn / frame.offsetWidth : 1;
}

function markerOf(
  doc: Document,
  spot: Spot,
  zoom: number,
  actions: GutterActions,
): HTMLButtonElement {
  const { marker } = spot;
  const count = marker.ids.length;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "mn-marker";
  button.dataset["block"] = marker.blockId;
  button.setAttribute("aria-label", actions.label(count));
  button.setAttribute("aria-pressed", String(marker.open));
  button.textContent = String(count);
  Object.assign(button.style, {
    position: "absolute",
    top: `${spot.top}px`,
    left: `${spot.left}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: `scale(${1 / zoom})`,
    transformOrigin: "0 0",
  });
  button.addEventListener("click", () => {
    const box = button.getBoundingClientRect();
    actions.onActivate(marker.ids[0]!, { left: box.left, top: box.top });
  });
  button.addEventListener("mouseenter", () => actions.hover(marker.blockId));
  button.addEventListener("mouseleave", () => actions.hover(null));
  return button;
}

/**
 * The markers of `places()` beside the sheets in view of `view`'s pages, drawn again when told to and whenever the
 * sheets in view are drawn again (on scroll and zoom). A view without pages has no gutter and draws none.
 */
export function createGutter(
  view: EditorView,
  places: () => readonly Place[],
  actions: GutterActions,
): Gutter {
  let drawn: HTMLElement[] = [];
  let key = "";
  const draw = () => {
    const frame = view.dom.parentElement;
    const pages = paginationKey.getState(view.state);
    const markers = markersOf(places());
    if (frame === null || pages === undefined || markers.length === 0) {
      key = "";
      for (const marker of drawn) marker.remove();
      drawn = [];
      return;
    }
    const spots = spotsOf(frame, pages, markers);
    const zoom = zoomOf(frame);
    const next = JSON.stringify([zoom, spots]);
    if (next === key) return;
    key = next;
    for (const marker of drawn) marker.remove();
    drawn = spots.map((spot) =>
      markerOf(frame.ownerDocument, spot, zoom, actions),
    );
    frame.append(...drawn);
  };
  // the page scaffold names each sheet it draws, on scroll and zoom as well as when the pages change
  const sheets = new MutationObserver(draw);
  if (view.dom.parentElement !== null)
    sheets.observe(view.dom.parentElement, {
      subtree: true,
      attributeFilter: ["data-page"],
    });
  return {
    draw,
    destroy() {
      sheets.disconnect();
      for (const marker of drawn) marker.remove();
    },
  };
}
