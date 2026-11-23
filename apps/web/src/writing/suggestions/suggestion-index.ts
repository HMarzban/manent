// The open suggestions of a script: read once when it is first followed, then kept from its change reports.
import { observeScript, scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

export interface Suggestion {
  id: string;
  authorUserId: string;
  /** When it was made, ms since the epoch. */
  at: number;
  /** The blocks that hold it, as they are now; one it adds or removes comes last. */
  blocks: readonly BlockJSON[];
}

const SUGGEST_MARKS: readonly string[] = ["suggest_insert", "suggest_delete"];

/** Each suggestion the block holds, by id, from its attributes and its marks. */
function heldBy(block: BlockJSON): Map<string, Omit<Suggestion, "blocks">> {
  const held = new Map<string, Omit<Suggestion, "blocks">>();
  const add = (id: unknown, authorUserId: unknown, at: unknown): void => {
    if (typeof id !== "string" || held.has(id)) return;
    held.set(id, {
      id,
      authorUserId: typeof authorUserId === "string" ? authorUserId : "",
      at: typeof at === "number" ? at : 0,
    });
  };
  const attrs = block.attrs ?? {};
  if (typeof attrs.suggest === "string")
    add(attrs.suggestId, attrs.suggestAuthorUserId, attrs.suggestAt);
  for (const run of block.content ?? [])
    for (const mark of run.marks ?? [])
      if (SUGGEST_MARKS.includes(mark.type))
        add(mark.attrs?.id, mark.attrs?.authorUserId, mark.attrs?.at);
  return held;
}

/** True when the block is added or removed by suggestion `id`, so it is listed after the blocks it changes. */
const isWholeBlock = (block: BlockJSON, id: string): boolean =>
  block.attrs?.suggestId === id &&
  (block.attrs.suggest === "added" || block.attrs.suggest === "removed");

/** The suggestions the held blocks make up, oldest first. */
function listOf(held: ReadonlyMap<string, BlockJSON>): Suggestion[] {
  const byId = new Map<string, Suggestion & { blocks: BlockJSON[] }>();
  for (const block of held.values())
    for (const [id, found] of heldBy(block)) {
      const listed = byId.get(id);
      if (listed === undefined) byId.set(id, { ...found, blocks: [block] });
      else listed.blocks.push(block);
    }
  return [...byId.values()]
    .map((s) => ({
      ...s,
      blocks: s.blocks.toSorted(
        (a, b) => Number(isWholeBlock(a, s.id)) - Number(isWholeBlock(b, s.id)),
      ),
    }))
    .toSorted((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

function follow(doc: CrdtDoc): Subscribable<readonly Suggestion[]> {
  const held = new Map<string, BlockJSON>();
  const keep = (block: BlockJSON): boolean => {
    const id = block.attrs?.id;
    if (typeof id !== "string") return false;
    const had = held.delete(id);
    if (heldBy(block).size === 0) return had;
    held.set(id, block);
    return true;
  };
  for (const section of scriptBody(doc).materialize().content ?? [])
    for (const block of section.content ?? []) keep(block);
  const list = createValue<readonly Suggestion[]>(listOf(held));
  observeScript(doc, (report) => {
    let touched = false;
    for (const block of report.changed) touched = keep(block) || touched;
    for (const { block } of report.inserted) touched = keep(block) || touched;
    for (const id of report.removed) touched = held.delete(id) || touched;
    if (touched) list.set(listOf(held));
  });
  return list;
}

// one follower per script document, for as long as the document lives
const followed = new WeakMap<CrdtDoc, Subscribable<readonly Suggestion[]>>();

/** The open suggestions of `doc`, oldest first. */
export function suggestionsOf(
  doc: CrdtDoc,
): Subscribable<readonly Suggestion[]> {
  const known = followed.get(doc);
  if (known !== undefined) return known;
  const list = follow(doc);
  followed.set(doc, list);
  return list;
}
