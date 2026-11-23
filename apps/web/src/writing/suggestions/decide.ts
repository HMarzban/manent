// Use this and Keep as it was: each writes the suggestion's blocks as one step of the script's undo, and says so.
import {
  ORIGIN_REVIEW,
  applyBlockOpsAsOne,
  blockIds,
  readBlocks,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { BlockJSON, BlockOp, TextJSON } from "@manent/schema";
import { suggestionDecidedMessage } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";
import { nameOf } from "../../services/sync/index-entries.ts";
import { sceneWords } from "../../services/sync/review-actions.ts";
import type { Suggestion } from "./suggestion-index.ts";

export type Decision = "use" | "keep";

/** The mark a decision takes away with its text, and the one whose text it keeps unmarked. */
const DROPS: Readonly<Record<Decision, { text: string; mark: string }>> =
  Object.freeze({
    use: { text: "suggest_delete", mark: "suggest_insert" },
    keep: { text: "suggest_insert", mark: "suggest_delete" },
  });

const CLEARED = Object.freeze({
  suggest: null,
  suggestId: null,
  suggestAuthorUserId: null,
  suggestAt: null,
});

/** The text of `block` once `decision` settles suggestion `id` in it. */
function settledText(
  block: BlockJSON,
  id: string,
  decision: Decision,
): TextJSON[] {
  const drop = DROPS[decision];
  const isOurs = (mark: { type: string; attrs?: Record<string, unknown> }) =>
    mark.attrs?.id === id;
  return (block.content ?? []).flatMap((run) => {
    const marks = run.marks ?? [];
    if (marks.some((m) => m.type === drop.text && isOurs(m))) return [];
    return [
      {
        ...run,
        marks: marks.filter((m) => m.type !== drop.mark || !isOurs(m)),
      },
    ];
  });
}

/** What the block becomes: itself with its text settled, null when it goes, or "join" when its text joins the block before. */
function settledBlock(
  block: BlockJSON,
  id: string,
  decision: Decision,
): BlockJSON | null | "join" {
  const content = settledText(block, id, decision);
  const attrs = block.attrs ?? {};
  const kind = attrs.suggest;
  if (attrs.suggestId !== id || typeof kind !== "string")
    return { ...block, content };
  if (kind === "removed")
    return decision === "use"
      ? null
      : { ...block, attrs: { ...attrs, ...CLEARED }, content };
  if (kind === "added" && decision === "keep") return "join";
  const type = kind === "added" || decision === "use" ? attrs.type : kind;
  return { ...block, attrs: { ...attrs, ...CLEARED, type }, content };
}

/** The block before `blockId` in the script, as it is now; null at the start. */
function blockBefore(doc: CrdtDoc, blockId: string): BlockJSON | null {
  const ids = blockIds(doc);
  const before = ids[ids.indexOf(blockId) - 1];
  return before === undefined
    ? null
    : (readBlocks(doc, new Set([before])).get(before) ?? null);
}

/** The writes `decision` makes; a block it adds and is kept as it was gives its text back to the block before. */
function opsOf(
  doc: CrdtDoc,
  suggestion: Suggestion,
  decision: Decision,
): BlockOp[] {
  const ops: BlockOp[] = [];
  for (const block of suggestion.blocks) {
    const blockId = String(block.attrs?.id);
    const settled = settledBlock(block, suggestion.id, decision);
    if (settled !== "join" && settled !== null) {
      ops.push({ op: "replace", block: settled });
      continue;
    }
    ops.push({ op: "delete", id: blockId });
    const before = settled === "join" ? blockBefore(doc, blockId) : null;
    const moved = settledText(block, suggestion.id, decision);
    if (before !== null && moved.length > 0)
      ops.push({
        op: "replace",
        block: { ...before, content: [...(before.content ?? []), ...moved] },
      });
  }
  return ops;
}

/** The text the suggestion's blocks read once `decision` settles it, a line each. */
export function wordingOf(suggestion: Suggestion, decision: Decision): string {
  return suggestion.blocks
    .flatMap((block) => {
      if (settledBlock(block, suggestion.id, decision) === null) return [];
      return [
        settledText(block, suggestion.id, decision)
          .map((run) => run.text)
          .join(""),
      ];
    })
    .join("\n");
}

/** Writes `decision` on `suggestion` in `doc` as one step of undo, then says what it did, with Undo. */
export function decide(
  doc: CrdtDoc,
  suggestion: Suggestion,
  decision: Decision,
  messages: MessageQueue,
): void {
  // read first: the write may delete the block the scene is read from
  const scene = sceneWords(doc, String(suggestion.blocks[0]?.attrs?.id));
  applyBlockOpsAsOne(doc, opsOf(doc, suggestion, decision), ORIGIN_REVIEW);
  messages.push(
    suggestionDecidedMessage(
      decision === "use"
        ? { choice: "used", name: nameOf(suggestion.authorUserId), scene }
        : { choice: "kept", scene },
    ),
  );
}
