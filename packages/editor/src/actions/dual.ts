// Two adjacent speeches placed side by side, and back. A speech is a cue and the parentheticals and dialogue after it.
import { Selection } from "prosemirror-state";
import type { Node, ResolvedPos } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import type { ActionResult } from "./action-types.ts";

/** A block and the position before it. */
interface Located {
  readonly node: Node;
  readonly pos: number;
}

const LINES: readonly string[] = ["parenthetical", "dialogue"];

const located = ($inside: ResolvedPos): Located => ({
  node: $inside.parent,
  pos: $inside.before(2),
});

// Selection.findFrom steps over a section boundary, so a neighbour in another section is found like any other.
function blockBefore(doc: Node, block: Located): Located | null {
  const found = Selection.findFrom(doc.resolve(block.pos), -1, true);
  return found === null ? null : located(found.$from);
}

function blockAfter(doc: Node, block: Located): Located | null {
  const end = block.pos + block.node.nodeSize;
  const found = Selection.findFrom(doc.resolve(end), 1, true);
  return found === null ? null : located(found.$from);
}

const isLine = (block: Located): boolean =>
  LINES.includes(String(block.node.attrs.type));

/** The blocks of the speech `block` belongs to, cue first; null when it is in none. */
function speechOf(doc: Node, block: Located): Located[] | null {
  let cue: Located | null = block;
  while (cue !== null && isLine(cue)) cue = blockBefore(doc, cue);
  if (cue === null || cue.node.attrs.type !== "character") return null;
  const speech = [cue];
  for (
    let next = blockAfter(doc, cue);
    next !== null && isLine(next);
    next = blockAfter(doc, next)
  )
    speech.push(next);
  return speech;
}

/** The speech that ends just before `speech`, or starts just after it. */
function adjacentSpeech(
  doc: Node,
  speech: readonly Located[],
  side: "before" | "after",
): Located[] | null {
  const block =
    side === "before"
      ? blockBefore(doc, speech[0]!)
      : blockAfter(doc, speech.at(-1)!);
  return block === null ? null : speechOf(doc, block);
}

/** The adjacent speech on `side` when it is not in a pair already. */
function single(
  doc: Node,
  speech: readonly Located[],
  side: "before" | "after",
): Located[] | null {
  const found = adjacentSpeech(doc, speech, side);
  return found !== null && found[0]!.node.attrs.dual === null ? found : null;
}

function setDual(
  tr: Transaction,
  speech: readonly Located[],
  dual: "left" | "right" | null,
): void {
  for (const block of speech) tr.setNodeAttribute(block.pos, "dual", dual);
}

const NEEDS_TWO: ActionResult = { ok: false, reason: "needs_two_speeches" };

/**
 * With the caret in a speech in a pair, both speeches become single again.
 * Otherwise the speech becomes the right column beside the speech just before
 * it, or the left beside the one just after it, in one transaction; blocks
 * never change section. `needs_two_speeches` when there is neither.
 */
export function toggleDualDialogue(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): ActionResult {
  const { doc, selection, tr } = state;
  if (!selection.$from.parent.isTextblock) return NEEDS_TWO;
  const speech = speechOf(doc, located(selection.$from));
  if (speech === null) return NEEDS_TWO;
  const dual: unknown = speech[0]!.node.attrs.dual;
  if (dual !== null) {
    const partner = adjacentSpeech(
      doc,
      speech,
      dual === "left" ? "after" : "before",
    );
    setDual(tr, [...speech, ...(partner ?? [])], null);
  } else {
    const before = single(doc, speech, "before");
    const after = before === null ? single(doc, speech, "after") : null;
    if (before === null && after === null) return NEEDS_TWO;
    setDual(tr, before ?? speech, "left");
    setDual(tr, after ?? speech, "right");
  }
  dispatch?.(tr);
  return { ok: true };
}
