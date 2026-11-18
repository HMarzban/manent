import { Schema } from "prosemirror-model";
import type { AttributeSpec, Node } from "prosemirror-model";
import { DEFAULT_BLOCK_ATTRS } from "./attrs.ts";
import { renderedType } from "./block-types.ts";
import { MARK_SPECS } from "./marks.ts";
import type { MarkName } from "./marks.ts";
import { isString } from "./shape.ts";

export const SCHEMA_VERSION = 1;

/** The number of blocks a section holds when a script is cut into sections. */
export const SECTION_TARGET_BLOCKS = 100;

export const NODE_NAMES = ["doc", "section", "block", "text"] as const;
export type NodeName = (typeof NODE_NAMES)[number];

// No attribute has `validate`: an unknown `type` must never throw.
const blockAttrs: Record<string, AttributeSpec> = Object.fromEntries(
  Object.entries(DEFAULT_BLOCK_ATTRS).map(([key, value]) => [
    key,
    { default: value },
  ]),
);

/** A block attribute that should hold text, or null when the stored value does not. */
function textAttr(node: Node, name: "id" | "type"): string | null {
  const value: unknown = node.attrs[name];
  return isString(value) ? value : null;
}

export const schema: Schema<NodeName, MarkName> = new Schema({
  nodes: {
    doc: { content: "section+" },
    section: {
      content: "block+",
      selectable: false,
      toDOM: () => ["div", { class: "section" }, 0],
    },
    block: {
      content: "text*",
      marks: "_",
      attrs: blockAttrs,
      toDOM: (node) => {
        const id = textAttr(node, "id");
        const type = textAttr(node, "type") ?? "";
        const attrs: Record<string, string> = {
          class: `el el-${renderedType(type)}`,
          "data-type": type,
        };
        if (id !== null) attrs["data-id"] = id;
        return ["p", attrs, 0];
      },
    },
    text: {},
  },
  marks: MARK_SPECS,
});
