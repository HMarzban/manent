// How many blocks carry each id, kept from the pagination plugin's block index; a local change never doubles one.
import type { ChangeHint, LayoutBlock } from "@manent/pagination";
import type { IdSource } from "@manent/schema";
import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import { blockPos } from "../pagination/block-index.ts";
import type { BlockIndex } from "../pagination/block-index.ts";
import { paginationKey } from "../pagination/plugin.ts";
import type { PaginationState } from "../pagination/plugin.ts";

export interface IdRegistry {
  /** How many blocks carry this id now. */
  count(id: string): number;
}

// One map for a line of states, changed in place as each follows the last; `index` is the index it describes now.
interface Counts {
  readonly byId: Map<string, number>;
  index: BlockIndex;
}

class Registry implements IdRegistry {
  constructor(
    readonly counts: Counts,
    readonly index: BlockIndex,
    /** Blocks of `index` a local change added whose id another block carries too. */
    readonly doubled: readonly number[],
  ) {}

  count(id: string): number {
    if (id === "") return 0;
    // a state a later one has moved past counts its own blocks, which happens only when a state is applied twice
    if (this.counts.index !== this.index)
      return this.index.blocks.filter((block) => block.id === id).length;
    return this.counts.byId.get(id) ?? 0;
  }
}

export const idRegistryKey: PluginKey<IdRegistry> = new PluginKey("idRegistry");

/** The plugin's own state, which only this module makes. */
function own(registry: IdRegistry | undefined): Registry {
  if (!(registry instanceof Registry))
    throw new RangeError("the editor state has no id registry");
  return registry;
}

function tally(
  byId: Map<string, number>,
  blocks: readonly LayoutBlock[],
  from: number,
  to: number,
  by: 1 | -1,
): void {
  for (let i = from; i < to; i++) {
    const { id } = blocks[i]!;
    // a block with no id is laid out with an empty one
    if (id === "") continue;
    const count = (byId.get(id) ?? 0) + by;
    if (count === 0) byId.delete(id);
    else byId.set(id, count);
  }
}

function rebuilt(index: BlockIndex): Registry {
  const byId = new Map<string, number>();
  tally(byId, index.blocks, 0, index.blocks.length, 1);
  return new Registry({ byId, index }, index, []);
}

/** The doubled blocks still standing after `change`, at their new places. */
function shifted(doubled: readonly number[], change: ChangeHint): number[] {
  const shift = change.newEnd - change.oldEnd;
  return doubled
    .filter((i) => i < change.first || i >= change.oldEnd)
    .map((i) => (i < change.first ? i : i + shift));
}

function added(
  byId: Map<string, number>,
  index: BlockIndex,
  change: ChangeHint,
): number[] {
  const found: number[] = [];
  for (let i = change.first; i < change.newEnd; i++) {
    const { id } = index.blocks[i]!;
    if (id !== "" && byId.get(id)! > 1) found.push(i);
  }
  return found;
}

function followed(
  prev: Registry,
  next: PaginationState,
  local: boolean,
): Registry {
  const { index, change } = next;
  if (index === prev.index) return prev;
  const { counts } = prev;
  if (counts.index !== prev.index) return rebuilt(index);
  counts.index = index;
  if (change === null) return new Registry(counts, index, prev.doubled);
  tally(counts.byId, prev.index.blocks, change.first, change.oldEnd, -1);
  tally(counts.byId, index.blocks, change.first, change.newEnd, 1);
  const fresh = local ? added(counts.byId, index, change) : [];
  const doubled = [...shifted(prev.doubled, change), ...fresh];
  return new Registry(counts, index, doubled);
}

function paginationOf(state: EditorState): PaginationState {
  const pagination = paginationKey.getState(state);
  if (pagination === undefined)
    throw new RangeError(
      "the id registry needs the pagination plugin before it",
    );
  return pagination;
}

/**
 * Counts the blocks that carry each id, from the blocks each change replaced. A block a local change added whose
 * id another block carries gets a new id from `ids`, in one transaction that is never an undo step; a remote
 * change is left as it is. Placed after the pagination plugin.
 */
export function idRegistryPlugin(options: {
  ids: IdSource;
  isRemote(tr: Transaction): boolean;
}): Plugin {
  return new Plugin<IdRegistry>({
    key: idRegistryKey,
    state: {
      init: (_, state) => rebuilt(paginationOf(state).index),
      apply: (tr, prev, _old, state) =>
        followed(own(prev), paginationOf(state), !options.isRemote(tr)),
    },
    appendTransaction: (_trs, _old, state) => {
      const registry = own(idRegistryKey.getState(state));
      const { blocks } = registry.index;
      const doubled = registry.doubled.filter(
        (i) => registry.count(blocks[i]!.id) > 1,
      );
      if (doubled.length === 0) return null;
      const tr = state.tr;
      for (const i of doubled)
        tr.setNodeAttribute(blockPos(registry.index, i), "id", options.ids());
      return tr.setMeta("addToHistory", false);
    },
  });
}
