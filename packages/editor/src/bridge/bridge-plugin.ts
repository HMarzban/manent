// The bridge to the interface: the caret's facts once per frame, and the outline and word count at most four times a second.
import type { FormatId } from "@manent/schema";
import { Plugin } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { blockNumber } from "../cursors/place.ts";
import { findCount } from "../find/find-plugin.ts";
import { blockAt } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type {
  EditorWords,
  FactsShape,
  FactsSink,
  Frames,
  HistoryPort,
  OutlineEntry,
  OutlineSink,
  Timers,
} from "../script-editor/ports.ts";
import { factsOf } from "./facts.ts";
import { headingAt, inkOutlineOf, outlineOf } from "./outline.ts";
import type { OutlineIndex } from "./outline.ts";
import { viewedPublisher } from "./viewed.ts";
import type { ViewedScrollPort } from "./viewed.ts";
import { paginationWordCount } from "./word-count.ts";

/** How often at most the outline is rebuilt after a change. */
const OUTLINE_EVERY_MS = 250;

const NO_OUTLINE: OutlineIndex = Object.freeze({
  entries: Object.freeze([]),
  headingBlocks: new Int32Array(0),
});

/** What the facts depend on; the facts are worked out again only when one of these differs. */
function trackedOf(state: EditorState, history: HistoryPort): unknown[] {
  const { $head, anchor, empty } = state.selection;
  const found = findCount(state);
  return [
    $head.parent,
    $head.parentOffset,
    anchor,
    empty,
    state.storedMarks,
    found.count,
    found.current,
    paginationKey.getState(state),
    history.canUndo(state),
    history.canRedo(state),
  ];
}

const isSameList = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

/** The keys of `next` whose value differs from `prev`'s; every key when nothing was published yet; null for none. */
function changedFacts(
  prev: FactsShape | null,
  next: FactsShape,
): Partial<FactsShape> | null {
  if (prev === null) return next;
  const changed = Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) => !Object.is(value, Reflect.get(prev, key)),
    ),
  );
  return Object.keys(changed).length === 0 ? null : changed;
}

const isSameEntry = (a: OutlineEntry, b: OutlineEntry): boolean =>
  (Object.keys(a) as (keyof OutlineEntry)[]).every((k) =>
    Object.is(a[k], b[k]),
  );

const isSameOutline = (
  a: readonly OutlineEntry[],
  b: readonly OutlineEntry[],
): boolean =>
  a.length === b.length && a.every((entry, k) => isSameEntry(entry, b[k]!));

/** The entries with each heading's own `omitted`, `synopsis` and `targetWords` attributes, read in one pass over the sections. */
function withHeadingAttributes(
  outline: OutlineIndex,
  index: BlockIndex,
): readonly OutlineEntry[] {
  let section = 0;
  return outline.entries.map((entry, k) => {
    const block = outline.headingBlocks[k]!;
    while (index.sectionStart[section + 1]! <= block) section++;
    const { omitted, synopsis, targetWords } = index.doc
      .child(section)
      .child(block - index.sectionStart[section]!).attrs;
    const nextTarget =
      typeof targetWords === "number" && targetWords > 0 ? targetWords : null;
    if (
      omitted !== true &&
      (typeof synopsis !== "string" || synopsis === "") &&
      nextTarget === null
    )
      return entry;
    return {
      ...entry,
      omitted: omitted === true,
      synopsis: typeof synopsis === "string" ? synopsis : "",
      targetWords: nextTarget,
    };
  });
}

interface BridgeOptions {
  facts: FactsSink;
  outline: OutlineSink;
  history: HistoryPort;
  words: EditorWords;
  format(): FormatId;
  frames: Frames;
  timers: Timers;
  scroll?: ViewedScrollPort;
}

// while frozen, the pages and their index are the ones from before the composition, not of the caret's document
const isFrozen = (state: EditorState): boolean =>
  paginationKey.getState(state)?.frozen === true;

/**
 * Publishes, in one frame after `request`, the facts that changed; a frame while the pages wait for a composition
 * publishes nothing, and the pages' next state asks for another.
 */
function factsPublisher(
  view: EditorView,
  options: BridgeOptions,
  outline: () => OutlineIndex,
  wordCount: () => number | null,
): { request(): void; update(): void; destroy(): void } {
  const { history } = options;
  let facts: FactsShape | null = null;
  let tracked = trackedOf(view.state, history);
  let cancelFrame: (() => void) | null = null;
  const publish = () => {
    cancelFrame = null;
    if (isFrozen(view.state)) return;
    const next = factsOf(view.state, {
      history,
      words: options.words,
      format: options.format(),
      outline: outline(),
      wordCount: wordCount(),
    });
    const changed = changedFacts(facts, next);
    facts = next;
    if (changed !== null) options.facts.publish(changed);
  };
  const request = () => {
    cancelFrame ??= options.frames.request(publish);
  };
  return {
    request,
    update() {
      const next = trackedOf(view.state, history);
      if (isSameList(next, tracked)) return;
      tracked = next;
      request();
    },
    destroy() {
      cancelFrame?.();
    },
  };
}

/** The index in `headingBlocks` of the last entry at or before `block`; null before the first. */
function entryAt(headingBlocks: Int32Array, block: number): number | null {
  let lo = 0;
  let hi = headingBlocks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (headingBlocks[mid]! <= block) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? lo - 1 : null;
}

/** The index in `outline.entries` of the active heading for `state`'s caret; null before the first or without an outline. */
function activeHeadingIndex(
  outline: OutlineIndex,
  state: EditorState,
  format: FormatId,
): number | null {
  const pages = paginationKey.getState(state);
  if (pages !== undefined)
    return headingAt(outline, blockAt(pages.index, state.selection.head));
  if (format === "ink") {
    const { $head } = state.selection;
    const caret = $head.depth >= 2 ? blockNumber(state, $head) : -1;
    return entryAt(outline.headingBlocks, caret);
  }
  return null;
}

/** Shallow-copies `entries`, flipping `current` only on `prev` and `next` so every other entry keeps its reference. */
function withCurrent(
  entries: readonly OutlineEntry[],
  prev: number | null,
  next: number | null,
): readonly OutlineEntry[] {
  const updated = entries.slice();
  if (prev !== null && prev < updated.length)
    updated[prev] = { ...updated[prev]!, current: false };
  if (next !== null && next < updated.length)
    updated[next] = { ...updated[next]!, current: true };
  return updated;
}

/** Builds the outline index, attribute-enriched rows and active heading index for `state`. */
function buildOutline(
  state: EditorState,
  format: FormatId,
): {
  index: OutlineIndex;
  rows: readonly OutlineEntry[];
  currentIndex: number | null;
} {
  const pages = paginationKey.getState(state);
  let index: OutlineIndex;
  if (pages !== undefined) {
    index = outlineOf(
      pages.pagination,
      blockAt(pages.index, state.selection.head),
    );
  } else if (format === "ink") {
    const { $head } = state.selection;
    const caret = $head.depth >= 2 ? blockNumber(state, $head) : -1;
    index = inkOutlineOf(state.doc, caret);
  } else {
    index = NO_OUTLINE;
  }
  const rows =
    pages === undefined
      ? index.entries
      : withHeadingAttributes(index, pages.index);
  const found = index.entries.findIndex((entry) => entry.current);
  return { index, rows, currentIndex: found === -1 ? null : found };
}

/**
 * Builds the outline now and at most every 250 ms after a document edit, and updates the active heading on the next
 * animation frame after a selection-only move, waiting while an input method composes or the pages wait for it; calls
 * `published` after each outline update it publishes.
 */
function outlinePublisher(
  view: EditorView,
  options: BridgeOptions,
  published: () => void,
  onWordsChanged: () => void,
): {
  readonly index: OutlineIndex;
  readonly wordCount: number | null;
  update(prev: EditorState): void;
  destroy(): void;
} {
  let index = NO_OUTLINE;
  let rows: readonly OutlineEntry[] | null = null;
  let currentIndex: number | null = null;
  let words: number | null = null;
  let cancelTimer: (() => void) | null = null;
  let cancelCurrentFrame: (() => void) | null = null;
  const cancelCurrent = () => {
    cancelCurrentFrame?.();
    cancelCurrentFrame = null;
  };
  const later = () => {
    cancelCurrent();
    cancelTimer ??= options.timers.schedule(rebuild, OUTLINE_EVERY_MS);
  };
  const publishCurrent = () => {
    cancelCurrentFrame = null;
    if (cancelTimer !== null) return;
    if (view.composing || isFrozen(view.state)) return later();
    const nextCurrent = activeHeadingIndex(index, view.state, options.format());
    if (nextCurrent === currentIndex) return;
    index = {
      entries: withCurrent(index.entries, currentIndex, nextCurrent),
      headingBlocks: index.headingBlocks,
    };
    if (rows !== null) rows = withCurrent(rows, currentIndex, nextCurrent);
    currentIndex = nextCurrent;
    const nextId =
      nextCurrent === null ? null : index.entries[nextCurrent]!.blockId;
    if (options.outline.publishCurrent !== undefined)
      options.outline.publishCurrent(nextId);
    else if (rows !== null) options.outline.publish(rows);
    published();
  };
  const rebuild = () => {
    cancelTimer = null;
    cancelCurrent();
    if (view.composing || isFrozen(view.state)) return later();
    const pages = paginationKey.getState(view.state);
    const nextWords =
      pages === undefined ? null : paginationWordCount(pages.pagination.blocks);
    const wordsChanged = nextWords !== words;
    words = nextWords;
    const built = buildOutline(view.state, options.format());
    index = built.index;
    if (rows !== null && isSameOutline(rows, built.rows)) {
      if (wordsChanged) onWordsChanged();
      return;
    }
    rows = built.rows;
    currentIndex = built.currentIndex;
    options.outline.publish(built.rows);
    options.outline.publishCurrent?.(
      currentIndex === null ? null : built.rows[currentIndex]!.blockId,
    );
    published();
  };
  rebuild();
  return {
    get index() {
      return index;
    },
    get wordCount() {
      return words;
    },
    update(prev) {
      if (
        view.state.doc !== prev.doc ||
        paginationKey.getState(view.state)?.index.layoutKey !==
          paginationKey.getState(prev)?.index.layoutKey
      )
        later();
      else if (
        cancelTimer === null &&
        view.state.selection.$head.parent !== prev.selection.$head.parent
      )
        cancelCurrentFrame ??= options.frames.request(publishCurrent);
    },
    destroy() {
      cancelTimer?.();
      cancelTimer = null;
      cancelCurrent();
    },
  };
}

/**
 * Publishes the facts that changed in one frame after a change to what they depend on, updates the active heading in
 * one frame on selection-only moves, and updates the full outline at most every 250 ms after a document edit, never
 * while an input method composes or the pages wait for it; an unchanged outline is not published again. Neither walks
 * the document.
 */
export function bridgePlugin(options: BridgeOptions): Plugin {
  return new Plugin({
    view: (view) => {
      const facts = factsPublisher(
        view,
        options,
        () => outline.index,
        () => outline.wordCount,
      );
      let syncViewed: (() => void) | null = null;
      const outline = outlinePublisher(
        view,
        options,
        () => {
          facts.request();
          syncViewed?.();
        },
        facts.request,
      );
      const viewed = viewedPublisher({
        view,
        scroll: options.scroll,
        outline: () => outline.index,
        format: options.format,
        frames: options.frames,
        publish: options.outline.publishViewed,
      });
      syncViewed = viewed.request;
      facts.request();
      return {
        update(_, prev) {
          outline.update(prev);
          facts.update();
        },
        destroy() {
          viewed.destroy();
          facts.destroy();
          outline.destroy();
        },
      };
    },
  });
}
