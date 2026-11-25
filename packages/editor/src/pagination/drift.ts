// The drift monitor: while the page is idle it finds blocks the browser wraps otherwise than the engine and holds
// them to the engine's line starts. Pagination is never changed.
import { LINE_PX } from "@manent/pagination";
import type { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, PluginView, Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView } from "prosemirror-view";
import { DRIFT } from "../page/config.ts";
import { blockAt, blockPos } from "./block-index.ts";
import {
  driftModelLines,
  graphicBoxLines,
  graphicExtraPx,
} from "./graphic-height.ts";
import { paginationKey } from "./plugin.ts";
import type { PaginationState } from "./plugin.ts";

/** One block whose rendered line count differs from the engine's, and the state of the script font then. */
export interface DriftReport {
  readonly blockId: string;
  readonly type: string;
  readonly modelLines: number;
  readonly domLines: number;
  readonly fonts: "loading" | "ready" | "fallback";
}

/** A block's rendered lines: (heightPx − extraPx) / (LINE_PX × lineSpacing), rounded. */
export function domLineCount(
  heightPx: number,
  extraPx: number,
  lineSpacing: 1 | 2,
): number {
  return Math.round((heightPx - extraPx) / (LINE_PX * lineSpacing));
}

interface DriftState {
  /** The ids of the blocks held to the engine's line starts, in the order they were held. */
  readonly forced: ReadonlySet<string>;
  readonly decorations: DecorationSet;
}

/** The drift monitor's state: the blocks it holds and their decorations. */
export const driftKey: PluginKey<DriftState> = new PluginKey("drift");

/** Holds these blocks to the engine's line starts, while the set has room. */
export function forceLines(
  tr: Transaction,
  blockIds: readonly string[],
): Transaction {
  return tr.setMeta(driftKey, blockIds);
}

function lineBreak(): HTMLElement {
  const span = document.createElement("span");
  span.className = "lb";
  return span;
}

// A held block: its node decoration, carrying what it was built from, and a break at each line start after the first.
function heldDecorations(state: PaginationState, block: number): Decoration[] {
  const { index, pagination, settings } = state;
  const layout = index.blocks[block]!;
  const from = blockPos(index, block);
  const to = from + index.doc.nodeAt(from)!.nodeSize;
  const starts = settings.engine.lineStartsOf(pagination, block);
  const decorations = [
    Decoration.node(
      from,
      to,
      { class: "lb-forced" },
      { blockId: layout.id, layout, starts },
    ),
  ];
  const firstLine = layout.type === "graphic" ? graphicBoxLines(layout) + 1 : 1;
  for (const offset of starts.subarray(firstLine)) {
    const at = from + 1 + Math.min(offset, layout.text.length);
    decorations.push(
      Decoration.widget(at, lineBreak, {
        key: `lb:${offset}`,
        side: -1,
        blockId: layout.id,
      }),
    );
  }
  return decorations;
}

function isSameStarts(a: Int32Array, b: Int32Array): boolean {
  return a.length === b.length && a.every((start, i) => start === b[i]);
}

// Where each held block is: by its node decoration where that survived, otherwise by a search of the blocks.
function placesOf(
  ids: readonly string[],
  decorations: DecorationSet,
  state: PaginationState,
): Map<string, number> {
  const { index } = state;
  const places = new Map<string, number>();
  for (const d of decorations.find()) {
    const id: unknown = d.spec.layout === undefined ? null : d.spec.blockId;
    const block = blockAt(index, d.from);
    if (typeof id === "string" && index.blocks[block]?.id === id)
      places.set(id, block);
  }
  const wanted = new Set(ids.filter((id) => !places.has(id)));
  if (wanted.size === 0) return places;
  index.blocks.forEach((layout, block) => {
    if (wanted.delete(layout.id)) places.set(layout.id, block);
  });
  return places;
}

// The held blocks that are still in the document, each with decorations that match the engine's line starts now.
function held(
  ids: readonly string[],
  mapped: DecorationSet,
  state: PaginationState,
): DriftState {
  const places = placesOf(ids, mapped, state);
  const forced = new Set(ids.filter((id) => places.has(id)));
  const fresh: Decoration[] = [];
  const stale = new Set<string>();
  for (const [id, block] of places) {
    const from = blockPos(state.index, block);
    const node = mapped.find(
      from,
      from,
      (spec) => spec.blockId === id && spec.layout !== undefined,
    )[0];
    const current =
      node !== undefined &&
      node.from === from &&
      node.spec.layout === state.index.blocks[block] &&
      isSameStarts(
        node.spec.starts,
        state.settings.engine.lineStartsOf(state.pagination, block),
      );
    if (current) continue;
    stale.add(id);
    fresh.push(...heldDecorations(state, block));
  }
  const gone = mapped.find(
    undefined,
    undefined,
    (spec) => stale.has(spec.blockId) || !forced.has(spec.blockId),
  );
  return {
    forced,
    decorations: mapped.remove(gone).add(state.index.doc, fresh),
  };
}

function applyDrift(
  tr: Transaction,
  prev: DriftState,
  old: EditorState,
  state: EditorState,
): DriftState {
  const added: readonly string[] | undefined = tr.getMeta(driftKey);
  const pages = paginationKey.getState(state);
  const repaginated =
    pages?.pagination !== paginationKey.getState(old)?.pagination;
  if (added === undefined && !tr.docChanged && !repaginated) return prev;
  if (added === undefined && prev.forced.size === 0) return prev;
  const mapped = prev.decorations.map(tr.mapping, tr.doc);
  // while a composition holds the pages of the document before it, the held blocks wait for the pages to catch up
  if (pages === undefined || pages.frozen)
    return { forced: prev.forced, decorations: mapped };
  const ids = [...new Set([...prev.forced, ...(added ?? [])])].slice(
    0,
    DRIFT.maxForcedBlocks,
  );
  return held(ids, mapped, pages);
}

function fontsOf(dom: HTMLElement): DriftReport["fonts"] {
  const fonts = dom.closest<HTMLElement>("[data-fonts]")?.dataset["fonts"];
  // outside a page frame nothing follows the font's loading, so it is taken as loaded
  return fonts === "loading" || fonts === "fallback" ? fonts : "ready";
}

/**
 * Whether the monitor measures a block: not one with a node decoration marking a change (its spec names the
 * change as `changes` and the block's id as `blockId`), which draws text beside the block's own that the engine
 * never laid out. `decorations` are those drawn over the block, and may hold its neighbours' too.
 */
export function isDriftCandidate(
  node: Node,
  decorations: readonly Decoration[],
): boolean {
  return !decorations.some(
    (d) => d.spec.changes !== undefined && d.spec.blockId === node.attrs["id"],
  );
}

// Every decoration a plugin of the view draws over [from, to].
function drawnOver(view: EditorView, from: number, to: number): Decoration[] {
  const found: Decoration[] = [];
  view.someProp("decorations", (decorations) => {
    decorations(view.state)?.forEachSet((set) =>
      found.push(...set.find(from, to)),
    );
  });
  return found;
}

// One section's blocks that are not held, as [block, rendered lines] where the count differs from the engine's.
function measureSection(
  view: EditorView,
  s: number,
  state: PaginationState,
  forced: ReadonlySet<string>,
  room: number,
): [number, number][] {
  const found: [number, number][] = [];
  const { index } = state;
  const first = index.sectionStart[s]!;
  const nodes = index.doc.child(s);
  const blocks =
    view.dom.children[s]!.querySelectorAll<HTMLElement>(":scope > p.el");
  let pos = index.sectionPos[s]! + 1;
  for (let k = 0; k < Math.min(blocks.length, nodes.childCount, room); k++) {
    const el = blocks[k]!;
    const block = first + k;
    const node = nodes.child(k);
    const from = pos;
    pos += node.nodeSize;
    const layout = index.blocks[block]!;
    const metrics = state.pagination.metrics[block]!;
    if (
      !metrics.spec.printed ||
      forced.has(layout.id) ||
      !isDriftCandidate(node, drawnOver(view, from, pos))
    )
      continue;
    const expected = driftModelLines(layout, metrics.lines);
    if (layout.type === "graphic" && expected === 0) continue;
    const breaks = [
      ...el.querySelectorAll<HTMLElement>(
        ":scope > .pb, :scope > .mn-graphic-caption > .pb",
      ),
    ];
    const extra =
      Number.parseFloat(getComputedStyle(el).paddingTop) +
      breaks.reduce((sum, b) => sum + b.offsetHeight, 0) +
      graphicExtraPx(layout);
    const lines = domLineCount(
      el.offsetHeight,
      extra,
      metrics.spec.lineSpacing,
    );
    if (lines !== expected) found.push([block, lines]);
  }
  return found;
}

// The blocks in the sections in view or kept, read in one pass with no write, at most DRIFT.maxBlocksPerPass.
function measure(
  view: EditorView,
  state: PaginationState,
  forced: ReadonlySet<string>,
): [number, number][] {
  const { index } = state;
  const sections = view.dom.children;
  if (sections.length !== index.sectionPos.length) return [];
  const viewport = view.dom.ownerDocument.documentElement.clientHeight;
  const found: [number, number][] = [];
  let room = DRIFT.maxBlocksPerPass;
  for (let s = 0; s < sections.length && room > 0; s++) {
    const section = sections[s]!;
    const box = section.getBoundingClientRect();
    const shown = box.bottom > 0 && box.top < viewport;
    if (!shown && !section.classList.contains("keep")) continue;
    found.push(...measureSection(view, s, state, forced, room));
    room -= index.sectionStart[s + 1]! - index.sectionStart[s]!;
  }
  return found;
}

// The blocks found to drift, as many as the set has room for; with no room nothing is measured.
function findDrift(view: EditorView): DriftReport[] {
  const pages = paginationKey.getState(view.state);
  const drift = driftKey.getState(view.state);
  if (pages === undefined || drift === undefined || pages.frozen) return [];
  const room = DRIFT.maxForcedBlocks - drift.forced.size;
  const fonts = fontsOf(view.dom);
  // while the script font loads, the page is set in a fallback face
  if (room <= 0 || fonts === "loading") return [];
  return measure(view, pages, drift.forced)
    .slice(0, room)
    .map(([block, domLines]) => {
      const layout = pages.index.blocks[block]!;
      return {
        blockId: layout.id,
        type: layout.type,
        modelLines: driftModelLines(
          layout,
          pages.pagination.metrics[block]!.lines,
        ),
        domLines,
        fonts,
      };
    });
}

function driftView(
  view: EditorView,
  options: Parameters<typeof driftPlugin>[0],
): PluginView {
  if (!DRIFT.enabled) return {};
  // a port is called without a receiver: requestIdleCallback refuses any other
  const { whenIdle, onDrift } = options;
  let pending = false;
  const pass = (): void => {
    const reports = findDrift(view);
    if (reports.length === 0) return;
    const ids = reports.map((report) => report.blockId);
    view.dispatch(
      forceLines(view.state.tr, ids).setMeta("addToHistory", false),
    );
    for (const report of reports) onDrift?.(report);
  };
  const schedule = (): void => {
    if (pending) return;
    pending = true;
    whenIdle(() => {
      pending = false;
      if (!view.isDestroyed) pass();
    });
  };
  const doc = view.dom.ownerDocument;
  // a scroll of any element: the scroller is whatever holds the page
  doc.addEventListener("scroll", schedule, { capture: true, passive: true });
  // the end of the script font's loading wakes the monitor, as a scroll does
  const fontState = new MutationObserver(schedule);
  const frame = view.dom.closest("[data-fonts]");
  if (frame !== null)
    fontState.observe(frame, { attributeFilter: ["data-fonts"] });
  schedule();
  return {
    update: schedule,
    destroy() {
      doc.removeEventListener("scroll", schedule, { capture: true });
      fontState.disconnect();
    },
  };
}

/**
 * The drift monitor, listed after paginationPlugin. After an update, a scroll or the end of the script font's
 * loading, when the page is idle, it compares the rendered lines of the blocks in view with the engine's and holds
 * each block that differs to the engine's line starts, at most DRIFT.maxForcedBlocks of them. While the font loads,
 * or with DRIFT.enabled false, it measures nothing.
 */
export function driftPlugin(options: {
  whenIdle: (run: () => void) => void;
  onDrift?: (report: DriftReport) => void;
}): Plugin {
  return new Plugin<DriftState>({
    key: driftKey,
    state: {
      init: () => ({ forced: new Set(), decorations: DecorationSet.empty }),
      apply: applyDrift,
    },
    view: (view) => driftView(view, options),
    props: {
      decorations: (state) => driftKey.getState(state)?.decorations,
    },
  });
}
