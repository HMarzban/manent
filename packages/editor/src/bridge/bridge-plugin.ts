// The bridge to the interface: the caret's facts once per frame, and the outline at most four times a second.
import type { FormatId } from "@manent/schema";
import { Plugin } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
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
import { outlineOf } from "./outline.ts";
import type { OutlineIndex } from "./outline.ts";

/** How often at most the outline is rebuilt after a change. */
const OUTLINE_EVERY_MS = 250;

const NO_OUTLINE: OutlineIndex = Object.freeze({
  entries: Object.freeze([]),
  headingBlocks: new Int32Array(0),
});

/** What the facts depend on; the facts are worked out again only when one of these differs. */
function trackedOf(state: EditorState, history: HistoryPort): unknown[] {
  const { $head, empty } = state.selection;
  return [
    $head.parent,
    $head.parentOffset,
    empty,
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
  a.number === b.number &&
  a.heading === b.heading &&
  a.omitted === b.omitted &&
  a.current === b.current;

const isSameOutline = (
  a: readonly OutlineEntry[],
  b: readonly OutlineEntry[],
): boolean =>
  a.length === b.length && a.every((entry, k) => isSameEntry(entry, b[k]!));

/** The entries with each heading's own `omitted` attribute, read from its node in one pass over the sections. */
function withOmitted(
  outline: OutlineIndex,
  index: BlockIndex,
): readonly OutlineEntry[] {
  let section = 0;
  return outline.entries.map((entry, k) => {
    const block = outline.headingBlocks[k]!;
    while (index.sectionStart[section + 1]! <= block) section++;
    const node = index.doc
      .child(section)
      .child(block - index.sectionStart[section]!);
    return node.attrs.omitted === true ? { ...entry, omitted: true } : entry;
  });
}

/**
 * Publishes the facts that changed in one frame after a change to what they depend on, and the outline at most
 * every 250 ms after a change to the document or the caret's block, never while an input method composes;
 * an outline whose entries are all the same is not published again. Neither walks the document.
 */
export function bridgePlugin(options: {
  facts: FactsSink;
  outline: OutlineSink;
  history: HistoryPort;
  words: EditorWords;
  format(): FormatId;
  frames: Frames;
  timers: Timers;
}): Plugin {
  const { history } = options;
  return new Plugin({
    view: (view) => {
      let outline = NO_OUTLINE;
      let rows: readonly OutlineEntry[] | null = null;
      let facts: FactsShape | null = null;
      let tracked = trackedOf(view.state, history);
      let cancelFrame: (() => void) | null = null;
      let cancelTimer: (() => void) | null = null;
      const publishFacts = () => {
        cancelFrame = null;
        const next = factsOf(view.state, {
          history,
          words: options.words,
          format: options.format(),
          outline,
        });
        const changed = changedFacts(facts, next);
        facts = next;
        if (changed !== null) options.facts.publish(changed);
      };
      const requestFacts = () => {
        cancelFrame ??= options.frames.request(publishFacts);
      };
      const later = () => {
        cancelTimer ??= options.timers.schedule(rebuild, OUTLINE_EVERY_MS);
      };
      const rebuild = () => {
        cancelTimer = null;
        if (view.composing) return later();
        const pages = paginationKey.getState(view.state);
        outline =
          pages === undefined
            ? NO_OUTLINE
            : outlineOf(
                pages.pagination,
                blockAt(pages.index, view.state.selection.head),
              );
        const next =
          pages === undefined
            ? outline.entries
            : withOmitted(outline, pages.index);
        if (rows !== null && isSameOutline(rows, next)) return;
        rows = next;
        options.outline.publish(next);
        requestFacts();
      };
      rebuild();
      requestFacts();
      return {
        update(_, prev) {
          if (
            view.state.doc !== prev.doc ||
            view.state.selection.$head.parent !== prev.selection.$head.parent
          )
            later();
          const next = trackedOf(view.state, history);
          if (isSameList(next, tracked)) return;
          tracked = next;
          requestFacts();
        },
        destroy() {
          cancelFrame?.();
          cancelTimer?.();
        },
      };
    },
  });
}
