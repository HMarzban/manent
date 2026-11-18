// Plain ProseMirror documents and states for the editor's tests.
import { schema } from "@manent/schema";
import type { IdSource } from "@manent/schema";
import type { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Command } from "prosemirror-state";

const padded = (prefix: string, n: number): string =>
  prefix + String(n).padStart(15, "0");

export const bid: (n: number) => string = (n) => padded("b", n);

/** Block k in document order has the id bid(k), the element "action" and the given text. */
export function docOf(sections: readonly (readonly string[])[]): Node {
  let next = 0;
  return schema.node(
    "doc",
    null,
    sections.map((blocks) =>
      schema.node(
        "section",
        null,
        blocks.map((text) =>
          schema.node(
            "block",
            { id: bid(next++), type: "action" },
            text === "" ? [] : schema.text(text),
          ),
        ),
      ),
    ),
  );
}

/** The position `offset` characters into block `block`, counted in document order. */
function positionOf(doc: Node, block: number, offset: number): number {
  let index = 0;
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type !== schema.nodes.block) return true;
    if (index++ === block) found = pos + 1 + offset;
    return false;
  });
  if (found === null) throw new RangeError(`no block ${block} in the doc`);
  return found;
}

/** The caret in block `block` at `offset`, or a selection from there to `toBlock` at `toOffset`. */
export function stateAt(
  doc: Node,
  block: number,
  offset: number,
  toBlock?: number,
  toOffset?: number,
): EditorState {
  const anchor = positionOf(doc, block, offset);
  const head =
    toBlock === undefined ? anchor : positionOf(doc, toBlock, toOffset ?? 0);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, anchor, head),
  });
}

function perSection(doc: Node, read: (block: Node) => string): string[][] {
  const sections: string[][] = [];
  doc.forEach((section) => {
    const blocks: string[] = [];
    section.forEach((block) => blocks.push(read(block)));
    sections.push(blocks);
  });
  return sections;
}

export function ids(doc: Node): string[][] {
  return perSection(doc, (block) => String(block.attrs.id));
}

export function texts(doc: Node): string[][] {
  return perSection(doc, (block) => block.textContent);
}

/** The state after the command; throws when the command does not apply. */
export function run(state: EditorState, command: Command): EditorState {
  let next = state;
  const applied = command(state, (tr) => {
    next = next.apply(tr);
  });
  if (!applied) throw new Error("the command does not apply here");
  return next;
}

/** `prefix` and a count from 1, padded to 15 digits. */
export function counter(prefix: string): IdSource {
  let count = 0;
  return () => padded(prefix, ++count);
}
