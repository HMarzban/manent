// The bridge to the interface: the caret's facts once per frame, and the outline at most four times a second.
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
import { inkOutlineOf, outlineOf } from "./outline.ts";
import type { OutlineIndex } from "./outline.ts";

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
  a.blockId === b.blockId &&
  a.kind === b.kind &&
  a.number === b.number &&
  a.heading === b.heading &&
  a.synopsis === b.synopsis &&
  a.eighths === b.eighths &&
  a.omitted === b.omitted &&
  a.current === b.current;

const isSameOutline = (
  a: readonly OutlineEntry[],
  b: readonly OutlineEntry[],
): boolean =>
  a.length === b.length && a.every((entry, k) => isSameEntry(entry, b[k]!));

/** The entries with each heading's own `omitted` and `synopsis` attributes, read from its node in one pass over the sections. */
function withHeadingAttributes(
  outline: OutlineIndex,
  index: BlockIndex,
): readonly OutlineEntry[] {
  let section = 0;
  return outline.entries.map((entry, k) => {
    const block = outline.headingBlocks[k]!;
    while (index.sectionStart[section + 1]! <= block) section++;
    const { omitted, synopsis } = index.doc
      .child(section)
      .child(block - index.sectionStart[section]!).attrs;
    if (omitted !== true && (typeof synopsis !== "string" || synopsis === ""))
      return entry;
    return {
      ...entry,
      omitted: omitted === true,
      synopsis: typeof synopsis === "string" ? synopsis : "",
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

/**
 * Builds the outline now and at most every 250 ms after a change to the document or the caret's block, waiting
 * while an input method composes or the pages wait for it; calls `published` after each outline it publishes.
 */
function outlinePublisher(
  view: EditorView,
  options: BridgeOptions,
  published: () => void,
): {
  readonly index: OutlineIndex;
  update(prev: EditorState): void;
  destroy(): void;
} {
  let index = NO_OUTLINE;
  let rows: readonly OutlineEntry[] | null = null;
  let cancelTimer: (() => void) | null = null;
  const later = () => {
    cancelTimer ??= options.timers.schedule(rebuild, OUTLINE_EVERY_MS);
  };
  const rebuild = () => {
    cancelTimer = null;
    if (view.composing || isFrozen(view.state)) return later();
    const pages = paginationKey.getState(view.state);
    if (pages !== undefined) {
      index = outlineOf(
        pages.pagination,
        blockAt(pages.index, view.state.selection.head),
      );
    } else if (options.format() === "ink") {
      const { $head } = view.state.selection;
      const caret = $head.depth >= 2 ? blockNumber(view.state, $head) : -1;
      index = inkOutlineOf(view.state.doc, caret);
    } else {
      index = NO_OUTLINE;
    }
    const next =
      pages === undefined
        ? index.entries
        : withHeadingAttributes(index, pages.index);
    if (rows !== null && isSameOutline(rows, next)) return;
    rows = next;
    options.outline.publish(next);
    published();
  };
  rebuild();
  return {
    get index() {
      return index;
    },
    update(prev) {
      if (
        view.state.doc !== prev.doc ||
        view.state.selection.$head.parent !== prev.selection.$head.parent
      )
        later();
    },
    destroy() {
      cancelTimer?.();
    },
  };
}

/**
 * Publishes the facts that changed in one frame after a change to what they depend on, and the outline at most
 * every 250 ms after a change to the document or the caret's block, never while an input method composes or the
 * pages wait for it; an outline whose entries are all the same is not published again. Neither walks the document.
 */
export function bridgePlugin(options: BridgeOptions): Plugin {
  return new Plugin({
    view: (view) => {
      const facts = factsPublisher(view, options, () => outline.index);
      const outline = outlinePublisher(view, options, facts.request);
      facts.request();
      return {
        update(_, prev) {
          outline.update(prev);
          facts.update();
        },
        destroy() {
          facts.destroy();
          outline.destroy();
        },
      };
    },
  });
}
