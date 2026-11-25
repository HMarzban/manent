// The revision state of the live script, kept current as it changes: each block's mark against the baseline is
// worked out again only for the blocks a transaction reaches, and the layout only when headings or blocks change.
import type {
  LayoutPatches,
  LockAnchorRecord,
  Pagination,
} from "@manent/pagination";
import {
  compareDocs,
  contentHash,
  markBlock,
  overrideKey,
  parseOverride,
  removedMarks,
  revisedPages,
} from "@manent/revisions";
import type { Baseline, BlockMark, LockedLayout } from "@manent/revisions";
import { blockView, blocksOf } from "@manent/schema";
import type { DocJSON, FlatBlock } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import { blockPos } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import type { PaginationState } from "../pagination/plugin.ts";
import { viewJSON, viewOf } from "./block-views.ts";
import { isNumberedHeading, layoutOf } from "./numbers.ts";
import type { ProductionPort, ProductionView } from "./plugin.ts";

export interface RevisionState {
  readonly setId: string | null;
  /** The active revision's, by block id. */
  readonly marks: ReadonlyMap<string, BlockMark>;
  readonly layout: LayoutPatches | null;
  readonly locked: LockedLayout | null;
  /** The labels of the pages holding a line the active revision marks, in page order. */
  readonly revisedPages: readonly string[];
}

export const revisionKey: PluginKey<RevisionState> = new PluginKey("revisions");

/** What the state is brought up to date from; `view` null: not in production, and everything else empty. */
export interface RevisionKept {
  readonly port: ProductionPort;
  readonly view: ProductionView | null;
  /** Each block's own mark, by id. */
  readonly own: ReadonlyMap<string, BlockMark>;
  /** The baseline's blocks the script no longer holds, and where those removals are marked, by block id. */
  readonly removed: ReadonlySet<string>;
  readonly removedAt: ReadonlyMap<string, BlockMark>;
  readonly moved: ReadonlySet<string>;
  readonly marks: ReadonlyMap<string, BlockMark>;
  readonly layout: LayoutPatches | null;
  readonly locked: LockedLayout | null;
  /** The records `locked` was laid out under; null before the first. */
  readonly records: readonly LockAnchorRecord[] | null;
  readonly pagination: Pagination | null;
  /** The blocks whose own marks the update that made `marks` worked out again, by id; null: every block's. */
  readonly remarked: ReadonlySet<string> | null;
}

interface Tracked extends RevisionState {
  readonly kept: RevisionKept;
}

const NO_MARKS: ReadonlyMap<string, BlockMark> = new Map();
const NO_IDS: ReadonlySet<string> = new Set();
const WHOLE: BlockMark = Object.freeze({ kind: "whole" });

// every state the plugin makes is one; this proves it to the types
function isTracked(value: RevisionState): value is Tracked {
  return "kept" in value;
}

export function outOfProduction(port: ProductionPort): RevisionKept {
  return {
    port,
    view: null,
    own: NO_MARKS,
    removed: NO_IDS,
    removedAt: NO_MARKS,
    moved: NO_IDS,
    marks: NO_MARKS,
    layout: null,
    locked: null,
    records: null,
    pagination: null,
    remarked: null,
  };
}

/** The state shown for `kept`; its revised pages are laid out only when read, since that lays out every page. */
export function revisionStateOf(kept: RevisionKept): RevisionState {
  let pages: readonly string[] | null = null;
  const tracked: Tracked = {
    setId: kept.view?.setId ?? null,
    marks: kept.marks,
    layout: kept.layout,
    locked: kept.locked,
    kept,
    get revisedPages() {
      pages ??=
        kept.pagination === null || kept.view === null
          ? []
          : revisedPages(kept.pagination, kept.marks);
      return pages;
    },
  };
  return tracked;
}

/** What `own` was brought up to date from; null for a state this plugin did not make. */
export function keptOfRevision(own: RevisionState): RevisionKept | null {
  return isTracked(own) ? own.kept : null;
}

export function keptOf(state: EditorState): RevisionKept | null {
  const own = revisionKey.getState(state);
  return own === undefined ? null : keptOfRevision(own);
}

/** The script's production and the port it came through; null outside production or without the plugin. */
export function productionOf(
  state: EditorState,
): { readonly port: ProductionPort; readonly view: ProductionView } | null {
  const kept = keptOf(state);
  return kept === null || kept.view === null
    ? null
    : { port: kept.port, view: kept.view };
}

/** The hash a cleared override of the block holds. */
export function contentHashOf(node: Node): string {
  return contentHash(viewJSON(blockView(node)));
}

/** A whole mark wins; ranges are joined, each deletion offset once, ascending. */
function joinMarks(a: BlockMark | undefined, b: BlockMark): BlockMark {
  if (a === undefined) return b;
  if (a.kind === "whole" || b.kind === "whole") return WHOLE;
  return {
    kind: "ranges",
    inserted: [...a.inserted, ...b.inserted],
    deletedAt: [...new Set([...a.deletedAt, ...b.deletedAt])].toSorted(
      (x, y) => x - y,
    ),
  };
}

function joined(
  own: ReadonlyMap<string, BlockMark>,
  removedAt: ReadonlyMap<string, BlockMark>,
): ReadonlyMap<string, BlockMark> {
  if (removedAt.size === 0) return own;
  const marks = new Map(own);
  for (const [id, mark] of removedAt)
    marks.set(id, joinMarks(marks.get(id), mark));
  return marks;
}

function idOf(node: Node): string | null {
  const id: unknown = node.attrs.id;
  return typeof id === "string" ? id : null;
}

/** Shown on the page: neither an omitted heading nor a block of an omitted scene. */
const isShown = (layout: LayoutPatches | null, id: string): boolean =>
  layout?.patches.get(id)?.text === undefined;

interface MarkInputs {
  readonly port: ProductionPort;
  readonly view: ProductionView;
  readonly moved: ReadonlySet<string>;
  readonly layout: LayoutPatches | null;
}

/** Sets or removes the block's own mark in `own`. */
function remark(own: Map<string, BlockMark>, node: Node, m: MarkInputs): void {
  const id = idOf(node);
  if (id === null) return;
  const { baseline, setId } = m.view;
  const base = baseline.blocks.get(id);
  const mark = markBlock(
    base === undefined ? null : viewJSON(blockView(base)),
    viewJSON(viewOf(node)),
    {
      baseVisible: baseline.visible.has(id),
      visible: isShown(m.layout, id),
      moved: m.moved.has(id),
      override: parseOverride(m.port.overrides.get(overrideKey(setId, id))),
    },
  );
  if (mark === null) own.delete(id);
  else own.set(id, mark);
}

/** The block nodes of `index` from block `from` on, in order. */
function* blocksFrom(index: BlockIndex, from: number): Generator<Node> {
  if (from >= index.blocks.length) return;
  const at = index.doc.resolve(blockPos(index, from));
  let i = at.index(1);
  for (let s = at.index(0); s < index.doc.childCount; s++, i = 0) {
    const section = index.doc.child(s);
    for (; i < section.childCount; i++) yield section.child(i);
  }
}

function nodesIn(index: BlockIndex, from: number, to: number): Node[] {
  const nodes: Node[] = [];
  if (from >= to) return nodes;
  for (const node of blocksFrom(index, from)) {
    nodes.push(node);
    if (nodes.length === to - from) break;
  }
  return nodes;
}

/** The blocks from `from` up to the next heading: the rest of the scene a heading before them starts. */
function sceneFrom(index: BlockIndex, from: number): Node[] {
  const nodes: Node[] = [];
  for (const node of blocksFrom(index, from)) {
    if (isNumberedHeading(node.attrs.type)) break;
    nodes.push(node);
  }
  return nodes;
}

function nodesWithIds(index: BlockIndex, ids: ReadonlySet<string>): Node[] {
  if (ids.size === 0) return [];
  return [...blocksFrom(index, 0)].filter((node) => ids.has(idOf(node) ?? ""));
}

/** The baseline's blocks that compareDocs finds moved in `doc`. */
function movedOf(baseline: Baseline, doc: Node): ReadonlySet<string> {
  const older: DocJSON = {
    type: "doc",
    content: [{ type: "section", content: [...baseline.blocks.values()] }],
  };
  const { entries } = compareDocs(older, doc.toJSON());
  return new Set(entries.filter((e) => e.moved).map((e) => e.id));
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((id) => b.has(id));

/** Production as `view` states it: the layout again, and every mark again when the baseline or the revision is new. */
export function withView(
  kept: RevisionKept,
  view: ProductionView | null,
  doc: Node,
): RevisionKept {
  if (view === null) return outOfProduction(kept.port);
  const flat = blocksOf(doc, viewOf);
  const layout = layoutOf(flat, view);
  const prev = kept.view;
  if (
    prev !== null &&
    prev.baseline === view.baseline &&
    prev.setId === view.setId
  )
    return { ...kept, view, layout };
  const moved = movedOf(view.baseline, doc);
  const own = new Map<string, BlockMark>();
  const present = new Set<string>();
  doc.forEach((section) =>
    section.forEach((node) => {
      remark(own, node, { port: kept.port, view, moved, layout });
      const id = idOf(node);
      if (id !== null) present.add(id);
    }),
  );
  const removed = new Set(
    [...view.baseline.blocks.keys()].filter((id) => !present.has(id)),
  );
  const removedAt = removedMarks(view.baseline, flat, [...removed]);
  return {
    ...kept,
    view,
    own,
    removed,
    removedAt,
    moved,
    marks: joined(own, removedAt),
    layout,
    remarked: null,
  };
}

/** The marks again for the blocks whose overrides changed; `keys` are the map's keys. */
export function withOverrides(
  kept: RevisionKept & { readonly view: ProductionView },
  keys: readonly string[],
  index: BlockIndex,
): RevisionKept {
  const prefix = `${kept.view.setId}:`;
  const ids = new Set(
    keys
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length)),
  );
  const nodes = nodesWithIds(index, ids);
  if (nodes.length === 0) return kept;
  const own = new Map(kept.own);
  for (const node of nodes) remark(own, node, kept);
  const marks = joined(own, kept.removedAt);
  return { ...kept, own, marks, remarked: ids };
}

// A removal marked at a block's end moves with that block's length.
function marksEndOf(
  removedAt: ReadonlyMap<string, BlockMark>,
  node: Node,
): boolean {
  const mark = removedAt.get(idOf(node) ?? "");
  return mark?.kind === "ranges" && mark.deletedAt.some((offset) => offset > 0);
}

/**
 * The state after a transaction that replaced blocks [first, oldEnd) of `before` with [first, newEnd) of the
 * pages' index. The marks are worked out again for those blocks, for the blocks after them that an omitted heading
 * hid or showed again, and for blocks whose move changed; the layout when a heading changed or blocks came or went.
 */
export function withEdit(
  kept: RevisionKept & { readonly view: ProductionView },
  before: BlockIndex,
  pages: PaginationState & {
    readonly change: NonNullable<PaginationState["change"]>;
  },
): RevisionKept {
  const { view } = kept;
  const { index } = pages;
  const { first, oldEnd, newEnd } = pages.change;
  const old = nodesIn(before, first, oldEnd);
  const now = nodesIn(index, first, newEnd);
  const replaced = new Set(old.flatMap((node) => idOf(node) ?? []));
  const entering = new Set(now.flatMap((node) => idOf(node) ?? []));
  const heading = [...old, ...now].some((node) =>
    isNumberedHeading(node.attrs.type),
  );
  const added = [...entering].filter((id) => !replaced.has(id));
  const gone = [...replaced].filter((id) => !entering.has(id));
  let flat: FlatBlock[] | null = null;
  const flatNow = (): FlatBlock[] => (flat ??= blocksOf(index.doc, viewOf));
  const layout =
    heading || added.length > 0 || gone.length > 0
      ? layoutOf(flatNow(), view)
      : kept.layout;
  const moved = added.some((id) => view.baseline.blocks.has(id))
    ? movedOf(view.baseline, index.doc)
    : kept.moved;
  const shownAgain = (node: Node): boolean =>
    isShown(kept.layout, idOf(node) ?? "") !==
    isShown(layout, idOf(node) ?? "");
  const targets = [
    ...now,
    ...(layout?.key === kept.layout?.key
      ? []
      : sceneFrom(index, newEnd).filter(shownAgain)),
  ];
  if (moved !== kept.moved) {
    const changed = [...moved, ...kept.moved].filter(
      (id) => moved.has(id) !== kept.moved.has(id),
    );
    targets.push(...nodesWithIds(index, new Set(changed)));
  }
  const own = new Map(kept.own);
  for (const id of gone) own.delete(id);
  for (const node of targets) remark(own, node, { ...kept, moved, layout });
  const next = new Set([...kept.removed].filter((id) => !entering.has(id)));
  for (const id of gone) if (view.baseline.blocks.has(id)) next.add(id);
  const removed = sameSet(next, kept.removed) ? kept.removed : next;
  const removedAt =
    removed === kept.removed &&
    !heading &&
    !now.some((n) => marksEndOf(kept.removedAt, n))
      ? kept.removedAt
      : removedMarks(view.baseline, flatNow(), [...removed]);
  return {
    ...kept,
    own,
    removed,
    removedAt,
    moved,
    marks: joined(own, removedAt),
    layout,
    remarked: new Set(targets.flatMap((node) => idOf(node) ?? [])),
  };
}
