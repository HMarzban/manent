// What the page draws of suggestions besides their marks: a bar in the margin beside each block that holds one, and
// a removed block's text struck as the browser draws a del.
import type { Node } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";
import { blockEnd, blockStart, blocksIn } from "./touched.ts";
import type { Touched } from "./touched.ts";

/** The margin bar's accessible name, and what activating it does with its block's id. */
export interface SuggestionBar {
  label: string;
  onActivate(blockId: string): void;
}

const isSuggestMark = (node: Node): boolean =>
  node.marks.some((mark) => mark.type.name.startsWith("suggest_"));

function holdsSuggestion(block: Node): boolean {
  if (block.attrs.suggest !== null) return true;
  let found = false;
  block.forEach((text) => {
    found ||= isSuggestMark(text);
  });
  return found;
}

function barOf(blockId: string, bar: SuggestionBar): () => HTMLElement {
  return () => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mn-margin-mark";
    button.contentEditable = "false";
    button.setAttribute("aria-label", bar.label);
    button.dataset.block = blockId;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      bar.onActivate(blockId);
    });
    // the page's own keys never see it, so Enter is the bar's
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      bar.onActivate(blockId);
    });
    return button;
  };
}

/** The decorations of the blocks that overlap `from`–`to`. */
function decorationsIn(
  doc: Node,
  from: number,
  to: number,
  bar: SuggestionBar,
): Decoration[] {
  const found: Decoration[] = [];
  for (const { node, pos } of blocksIn(doc, from, to)) {
    const id: unknown = node.attrs.id;
    if (typeof id !== "string" || !holdsSuggestion(node)) continue;
    found.push(
      Decoration.widget(pos + 1, barOf(id, bar), {
        key: `suggest:${id}`,
        side: -1,
        ignoreSelection: true,
        stopEvent: () => true,
      }),
    );
    if (node.attrs.suggest === "removed" && node.content.size > 0)
      found.push(
        Decoration.inline(pos + 1, pos + node.nodeSize - 1, {
          nodeName: "del",
        }),
      );
  }
  return found;
}

/** Every block's decorations; one walk of the script, when the editor starts. */
export function suggestionMarksOf(
  doc: Node,
  bar: SuggestionBar,
): DecorationSet {
  return DecorationSet.create(
    doc,
    decorationsIn(doc, 0, doc.content.size, bar),
  );
}

/** `set` after a change: mapped, with the blocks the change touched drawn again. */
export function nextSuggestionMarks(
  set: DecorationSet,
  doc: Node,
  touched: Touched,
  bar: SuggestionBar,
): DecorationSet {
  const mapped = set.map(touched.mapping, doc);
  const from = blockStart(doc, touched.from);
  const to = blockEnd(doc, touched.to);
  return mapped
    .remove(mapped.find(from, to))
    .add(doc, decorationsIn(doc, from, to, bar));
}
