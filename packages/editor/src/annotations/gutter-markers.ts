// One marker per block with annotations, in the desk gutter beside the sheet, level with the block's first line.
// Placed from the engine's pages on the sheets in view, inside the zoomed pages and scaled back to its own size.
import type { EditorView } from "prosemirror-view";
import {
  GUTTER_COLUMNS,
  gutterColumnPx,
  markPosition,
} from "../changes/layer.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { PaginationState } from "../pagination/plugin.ts";
import type { Place } from "./anchor-places.ts";

type MarkerKind = "comment" | "note" | "mixed";

interface Marker {
  readonly blockId: string;
  readonly block: number;
  /** In the host's order. */
  readonly ids: string[];
  comments: number;
  notes: number;
  kind: MarkerKind;
  open: boolean;
}

interface Spot {
  readonly marker: Marker;
  /** Unzoomed px from the top left of the first sheet. */
  readonly top: number;
  readonly left: number;
}

export interface GutterActions {
  label(comments: number, notes: number): string;
  onActivate(
    id: string,
    at: { left: number; top: number },
    ids: readonly string[],
  ): void;
  /** The block whose marker the pointer is over; null once it leaves. */
  hover(blockId: string | null): void;
}

export interface Gutter {
  /** Places the markers again; nothing changes in the page when they stand where they stood. */
  draw(): void;
  destroy(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function markerIcon(doc: Document, kind: "comment" | "note"): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  if (kind === "comment") {
    svg.setAttribute("data-comment-icon", "");
    const bubble = doc.createElementNS(SVG_NS, "path");
    bubble.setAttribute(
      "d",
      "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    );
    svg.append(bubble);
    return svg;
  }
  const sheet = doc.createElementNS(SVG_NS, "path");
  sheet.setAttribute(
    "d",
    "M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z",
  );
  const fold = doc.createElementNS(SVG_NS, "path");
  fold.setAttribute("d", "M15 3v4a2 2 0 0 0 2 2h4");
  svg.append(sheet, fold);
  return svg;
}

function markersOf(places: readonly Place[]): Marker[] {
  const byBlock = new Map<number, Marker>();
  for (const { annotation, anchor, block } of places) {
    if (block === null) continue;
    const isNote = annotation.kind === "note";
    const marker = byBlock.get(block);
    if (marker === undefined)
      byBlock.set(block, {
        blockId: anchor.blockId,
        block,
        ids: [annotation.id],
        comments: isNote ? 0 : 1,
        notes: isNote ? 1 : 0,
        kind: annotation.kind,
        open: annotation.open,
      });
    else {
      marker.ids.push(annotation.id);
      if (isNote) marker.notes += 1;
      else marker.comments += 1;
      marker.kind =
        marker.comments > 0 && marker.notes > 0
          ? "mixed"
          : marker.notes > 0
            ? "note"
            : "comment";
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
      return [
        {
          marker,
          top: at.topPx,
          left: gutterColumnPx(at.gutterPx, GUTTER_COLUMNS.comments),
        },
      ];
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
  button.dataset["kind"] = marker.kind;
  button.setAttribute(
    "aria-label",
    actions.label(marker.comments, marker.notes),
  );
  button.setAttribute("aria-pressed", String(marker.open));
  if (marker.kind === "comment") {
    button.append(markerIcon(doc, "comment"));
  } else if (marker.kind === "note") {
    button.append(markerIcon(doc, "note"));
  } else {
    button.append(markerIcon(doc, "comment"), markerIcon(doc, "note"));
  }
  const countEl = doc.createElement("span");
  countEl.textContent = String(count);
  button.append(countEl);
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
    actions.hover(null);
    actions.onActivate(
      marker.ids[0]!,
      { left: box.left, top: box.top },
      marker.ids,
    );
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
  let hoveredBlock: string | null = null;
  const setHover = (blockId: string | null): void => {
    if (hoveredBlock === blockId) return;
    hoveredBlock = blockId;
    if (!view.isDestroyed) actions.hover(blockId);
  };
  const clearDrawn = (): void => {
    const hadHovered =
      hoveredBlock !== null &&
      drawn.some((marker) => marker.dataset["block"] === hoveredBlock);
    for (const marker of drawn) marker.remove();
    drawn = [];
    if (hadHovered) setHover(null);
  };
  const markerActions: GutterActions = {
    label: actions.label,
    onActivate: actions.onActivate,
    hover: setHover,
  };
  const draw = () => {
    const frame = view.dom.parentElement;
    const pages = paginationKey.getState(view.state);
    const markers = markersOf(places());
    if (frame === null || pages === undefined || markers.length === 0) {
      key = "";
      clearDrawn();
      return;
    }
    const spots = spotsOf(frame, pages, markers);
    const zoom = zoomOf(frame);
    const next = JSON.stringify([zoom, spots]);
    if (next === key) return;
    key = next;
    clearDrawn();
    drawn = spots.map((spot) =>
      markerOf(frame.ownerDocument, spot, zoom, markerActions),
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
      clearDrawn();
    },
  };
}
