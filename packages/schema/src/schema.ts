import { Schema } from "prosemirror-model";
import type { AttributeSpec } from "prosemirror-model";
import { DEFAULT_BLOCK_ATTRS } from "./attrs.ts";
import { renderedType } from "./block-types.ts";
import { MARK_SPECS } from "./marks.ts";
import type { MarkName } from "./marks.ts";

export const SCHEMA_VERSION = 1;

/** The number of blocks a section holds when a script is cut into sections. */
export const SECTION_TARGET_BLOCKS = 100;

// No attribute has `validate`: an unknown `type` must never throw.
const blockAttrs: Record<string, AttributeSpec> = Object.fromEntries(
  Object.entries(DEFAULT_BLOCK_ATTRS).map(([key, value]) => [
    key,
    { default: value },
  ]),
);

export const schema: Schema<"doc" | "section" | "block" | "text", MarkName> =
  new Schema<"doc" | "section" | "block" | "text", MarkName>({
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
          const { id, type } = node.attrs as {
            id: string | null;
            type: string;
          };
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
