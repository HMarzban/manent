// The rows of the Pages tab and the caret page's revision, as the editor publishes them.
import type { LockAnchorRecord, Pagination } from "@manent/pagination";
import { pageRevision } from "@manent/revisions";
import type {
  BlockMark,
  RevisionColour,
  RevisionSource,
} from "@manent/revisions";
import { Plugin } from "prosemirror-state";
import type { EditorState, PluginView } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { blockAt } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { FactsShape, FactsSink } from "../script-editor/ports.ts";
import { productionOf, revisionKey } from "./derive.ts";
import { isNumberedHeading } from "./numbers.ts";
import type { ProductionView } from "./plugin.ts";

export interface PageRow {
  readonly index: number;
  readonly label: string;
  readonly locked: boolean;
  /** The lock level of the anchor that starts the page; 0 for a page no anchor starts. */
  readonly level: number;
  /** Null for a page no revision marks. */
  readonly revision: RevisionColour | null;
  readonly revisionName: string | null;
}

export interface PagesSink {
  /** `revisedScenes`: the heading ids of the scenes holding an active mark. */
  publish(rows: readonly PageRow[], revisedScenes: readonly string[]): void;
}

const PUBLISH_EVERY_MS = 250;

/** What the rows are made from in production; they are made again only when one of these is another. */
interface RowsFrom {
  readonly pagination: Pagination;
  readonly index: BlockIndex;
  readonly marks: ReadonlyMap<string, BlockMark>;
  readonly view: ProductionView;
}

function sourcesOf(
  view: ProductionView,
  marks: ReadonlyMap<string, BlockMark>,
): RevisionSource[] {
  return [...view.earlier, { ...view.active, marks }];
}

function levelsOf(records: readonly LockAnchorRecord[]): Map<string, number> {
  const levels = new Map<string, number>();
  for (const { label, level } of records)
    levels.set(label, Math.max(level, levels.get(label) ?? 0));
  return levels;
}

function rowsOf({ pagination: p, view, marks }: RowsFrom): PageRow[] {
  const sources = sourcesOf(view, marks);
  const levels = levelsOf(view.records);
  return p.pages.map((page) => {
    const revision = pageRevision(p, page.index, sources, view.mode);
    return {
      index: page.index,
      label: page.label,
      locked: page.locked,
      level: page.locked ? (levels.get(page.label) ?? 0) : 0,
      revision: revision?.colour ?? null,
      revisionName: revision?.name ?? null,
    };
  });
}

/** The heading ids of the scenes holding a block `marks` marks, in order. */
function scenesOf({ index, marks }: RowsFrom): string[] {
  const scenes: string[] = [];
  let heading: string | null = null;
  for (const block of index.blocks) {
    if (isNumberedHeading(block.type)) heading = block.id;
    if (heading !== null && scenes.at(-1) !== heading && marks.has(block.id))
      scenes.push(heading);
  }
  return scenes;
}

function rowsFrom(state: EditorState): RowsFrom | null {
  const pages = paginationKey.getState(state);
  const marks = revisionKey.getState(state)?.marks;
  const production = productionOf(state);
  if (pages === undefined || marks === undefined || production === null)
    return null;
  const { pagination, index } = pages;
  return { pagination, index, marks, view: production.view };
}

const sameRows = (a: RowsFrom | null, b: RowsFrom | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.pagination === b.pagination &&
    a.index === b.index &&
    a.marks === b.marks &&
    a.view === b.view);

type CaretFacts = Pick<FactsShape, "pageRevision" | "pageOrdinal">;

const NO_FACTS: CaretFacts = Object.freeze({
  pageRevision: null,
  pageOrdinal: null,
});

/** The caret page's revision name and its place among the pages, counted from 1; null outside production. */
function caretFacts(state: EditorState, from: RowsFrom | null): CaretFacts {
  const engine = paginationKey.getState(state)?.settings.engine;
  if (from === null || engine === undefined) return NO_FACTS;
  const { $head } = state.selection;
  const block = blockAt(from.index, $head.pos);
  const page = engine.pageOf(from.pagination, block, $head.parentOffset);
  const sources = sourcesOf(from.view, from.marks);
  return {
    pageRevision:
      pageRevision(from.pagination, page, sources, from.view.mode)?.name ??
      null,
    pageOrdinal: page + 1,
  };
}

/**
 * Publishes the rows when the view starts, then at most once every PUBLISH_EVERY_MS: a change starts the wait,
 * and the state at its end is what is published. Nothing is published while an input method composes.
 */
function feedView(
  view: EditorView,
  options: { sink: PagesSink; facts: FactsSink },
): PluginView {
  let rows: RowsFrom | null = null;
  let first = true;
  let facts: CaretFacts | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const publish = () => {
    const from = rowsFrom(view.state);
    if (first || !sameRows(rows, from)) {
      first = false;
      rows = from;
      options.sink.publish(
        from === null ? [] : rowsOf(from),
        from === null ? [] : scenesOf(from),
      );
    }
    const next = caretFacts(view.state, from);
    if (
      next.pageRevision === facts?.pageRevision &&
      next.pageOrdinal === facts.pageOrdinal
    )
      return;
    facts = next;
    options.facts.publish(next);
  };
  const wait = () => {
    timer = setTimeout(() => {
      timer = null;
      if (view.composing) return;
      publish();
    }, PUBLISH_EVERY_MS);
  };
  publish();
  return {
    update() {
      if (timer !== null) return;
      if (rows === null && productionOf(view.state) === null) return;
      wait();
    },
    destroy() {
      if (timer !== null) clearTimeout(timer);
    },
  };
}

/** Publishes the Pages tab's rows and the caret page's revision facts, never on the keystroke that changed them. */
export function pagesFeedPlugin(options: {
  sink: PagesSink;
  facts: FactsSink;
}): Plugin {
  return new Plugin({ view: (view) => feedView(view, options) });
}
