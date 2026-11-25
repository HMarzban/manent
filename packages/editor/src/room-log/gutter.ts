// Gutter markers for room log lines (.mn-room-tag and .mn-room-link), placed in their own column beside drawn sheets.
import type { EditorView } from "prosemirror-view";
import {
  GUTTER_COLUMNS,
  gutterColumnPx,
  markPosition,
} from "../changes/layer.ts";
import { drawnPages } from "../margin-people/margin-people-plugin.ts";
import { blockPos } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { PaginationState } from "../pagination/plugin.ts";
import { readBlockLink, readBlockTags } from "./tags.ts";
import type { RoomLogLink, RoomLogTag } from "./tags.ts";

/** Resolved display details for a room log link target. */
export interface RoomLogTargetLabel {
  readonly label: string;
  readonly ariaLabel: string;
}

/** Words and callbacks the room log gutter needs. */
export interface RoomLogGutterOptions {
  /** Resolves a stored link to its visible gutter text and accessible name; null when the target does not exist. */
  resolveLink(link: RoomLogLink): RoomLogTargetLabel | null;
  /** Accessible name for a tagged line ("Tagged joke", "Tagged joke and future"). */
  taggedLabel(tags: readonly RoomLogTag[]): string;
  /** Visible text for a tag in the gutter. */
  tagText(tag: RoomLogTag): string;
  /** Called when the user activates a link marker in the gutter. */
  onOpenLink(link: RoomLogLink): void;
  /** Current page zoom factor (1 at 100 %). */
  zoom(): number;
}

export interface RoomLogGutter {
  /** Redraws the gutter markers when anything visible changed. */
  draw(): void;
  /** Removes every drawn marker and disconnects observers. */
  destroy(): void;
}

interface LineSpot {
  readonly blockId: string;
  readonly tags: readonly RoomLogTag[];
  readonly link: RoomLogLink | null;
  readonly linkLabel: RoomLogTargetLabel | null;
  readonly top: number;
  readonly left: number;
}

/** Horizontal column past `changes`, `comments` and `people` so room log markers never collide with them. */
const ROOM_LOG_COLUMN_OFFSET_PX = 28;

function spotsOf(
  frame: HTMLElement,
  view: EditorView,
  pages: PaginationState,
  options: RoomLogGutterOptions,
): LineSpot[] {
  const { pagination, settings, index } = pages;
  const spots: LineSpot[] = [];
  for (const k of drawnPages(frame, pagination.pages.length)) {
    const first = pagination.pages[k]!.block;
    const last = pagination.pages[k + 1]?.block ?? pagination.blocks.length - 1;
    let lines: ReturnType<typeof settings.engine.linePlacesOf> | null = null;
    for (let i = first; i <= last && i < index.blocks.length; i++) {
      const node = view.state.doc.nodeAt(blockPos(index, i));
      if (node === null) continue;
      const tags = readBlockTags(node);
      const link = readBlockLink(node);
      const linkLabel = link === null ? null : options.resolveLink(link);
      if (tags.length === 0 && linkLabel === null) continue;
      const blockId = pagination.blocks[i]?.id;
      if (blockId === undefined) continue;
      lines ??= settings.engine.linePlacesOf(pagination, k);
      const line = lines.find(
        (l) => l.blockLine === 0 && l.blockId === blockId,
      );
      if (line === undefined) continue;
      const at = markPosition(pagination.profile, k, line.y);
      const left =
        gutterColumnPx(at.gutterPx, GUTTER_COLUMNS.people) +
        ROOM_LOG_COLUMN_OFFSET_PX;
      spots.push({
        blockId,
        tags,
        link,
        linkLabel,
        top: at.topPx,
        left,
      });
    }
  }
  return spots;
}

function zoomOf(frame: HTMLElement, fallback: () => number): number {
  const drawn = frame.getBoundingClientRect().width;
  return drawn > 0 && frame.offsetWidth > 0
    ? drawn / frame.offsetWidth
    : fallback();
}

function markerRowOf(
  doc: Document,
  spot: LineSpot,
  zoom: number,
  options: RoomLogGutterOptions,
): HTMLElement {
  const row = doc.createElement("div");
  row.dataset["roomGutterBlock"] = spot.blockId;
  Object.assign(row.style, {
    position: "absolute",
    top: `${spot.top}px`,
    left: `${spot.left}px`,
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    transform: `scale(${1 / zoom})`,
    transformOrigin: "0 0",
  });
  if (spot.tags.length > 0) {
    const tagEl = doc.createElement("span");
    tagEl.className = "mn-room-tag";
    tagEl.dataset["block"] = spot.blockId;
    const label = options.taggedLabel(spot.tags);
    tagEl.setAttribute("role", "img");
    tagEl.setAttribute("aria-label", label);
    tagEl.title = label;
    tagEl.textContent = spot.tags.map((t) => options.tagText(t)).join(" · ");
    Object.assign(tagEl.style, {
      width: "auto",
      paddingInline: "0.25rem",
      display: "inline-flex",
      alignItems: "center",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      font: "500 var(--type-micro) / var(--lh-micro) var(--face-ui)",
    });
    row.append(tagEl);
  }
  if (spot.link !== null && spot.linkLabel !== null) {
    const link = spot.link;
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "mn-room-link";
    button.dataset["block"] = spot.blockId;
    button.dataset["linkKind"] = link.kind;
    button.dataset["linkBlock"] = link.blockId;
    button.setAttribute("aria-label", spot.linkLabel.ariaLabel);
    button.title = spot.linkLabel.ariaLabel;
    button.textContent = spot.linkLabel.label;
    Object.assign(button.style, {
      width: "auto",
      maxWidth: "9rem",
      paddingInline: "0.25rem",
      display: "inline-flex",
      alignItems: "center",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      cursor: "pointer",
      font: "500 var(--type-micro) / var(--lh-micro) var(--face-ui)",
      fontVariantNumeric: "tabular-nums",
    });
    button.addEventListener("click", () => options.onOpenLink(link));
    row.append(button);
  }
  return row;
}

/**
 * Draws `.mn-room-tag` and `.mn-room-link` markers beside each drawn sheet for tagged or linked room log lines.
 * A view without pages has no gutter and draws none.
 */
export function createRoomLogGutter(
  view: EditorView,
  isActive: () => boolean,
  options: RoomLogGutterOptions,
): RoomLogGutter {
  let drawn: HTMLElement[] = [];
  let key = "";
  const clear = (): void => {
    key = "";
    for (const el of drawn) el.remove();
    drawn = [];
  };
  const draw = (): void => {
    if (!isActive()) {
      if (drawn.length > 0) clear();
      return;
    }
    const frame = view.dom.parentElement;
    const pages = paginationKey.getState(view.state);
    if (frame === null || pages === undefined) {
      if (drawn.length > 0) clear();
      return;
    }
    const spots = spotsOf(frame, view, pages, options);
    if (spots.length === 0) {
      if (drawn.length > 0) clear();
      return;
    }
    const zoom = zoomOf(frame, options.zoom);
    const next = JSON.stringify([zoom, spots]);
    if (next === key) return;
    key = next;
    for (const el of drawn) el.remove();
    drawn = spots.map((spot) =>
      markerRowOf(frame.ownerDocument, spot, zoom, options),
    );
    frame.append(...drawn);
  };
  const sheets = new MutationObserver(draw);
  if (view.dom.parentElement !== null) {
    sheets.observe(view.dom.parentElement, {
      subtree: true,
      attributeFilter: ["data-page"],
    });
  }
  return {
    draw,
    destroy() {
      sheets.disconnect();
      clear();
    },
  };
}
