// Each block node's view, made once: a node never changes, and an edit reuses every node it does not reach, so
// viewing the whole script again when blocks come or go views only the new ones. Each view as JSON, as the server
// reads it.
import { blockView, canonicalBlock } from "@manent/schema";
import type { BlockJSON, BlockView } from "@manent/schema";
import { Node } from "prosemirror-model";

const views = new WeakMap<Node, BlockView>();

/** blockView, kept for as long as a node lives; a block as JSON is viewed afresh. */
export function viewOf(block: Node | BlockJSON): BlockView {
  if (!(block instanceof Node)) return blockView(block);
  const kept = views.get(block);
  if (kept !== undefined) return kept;
  const view = blockView(block);
  views.set(block, view);
  return view;
}

/** The block as its view holds it, mark names without their attributes, as the server reads both sides. */
export function viewJSON(view: BlockView): BlockJSON {
  return canonicalBlock({
    type: "block",
    attrs: { ...view.attrs },
    content: view.runs.map((run) => ({
      type: "text",
      text: run.text,
      marks: run.marks.map((type) => ({ type })),
    })),
  });
}
