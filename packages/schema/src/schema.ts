import { Schema } from "prosemirror-model";
import type { AttributeSpec, Node, TagParseRule } from "prosemirror-model";
import { DEFAULT_BLOCK_ATTRS } from "./attrs.ts";
import { renderedType } from "./block-types.ts";
import type { DocJSON } from "./json.ts";
import { MARK_SPECS } from "./marks.ts";
import type { MarkName } from "./marks.ts";
import { isObject, isString } from "./shape.ts";

/** 4: prose opening-line styles (`firstLine`) and superscript/subscript marks (`sup`, `sub`); blocks carrying them need schema 4. */
export const SCHEMA_VERSION = 4;

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

/** What word processors and web pages send as a paragraph: each is read as an `action` block. */
const FOREIGN_BLOCK_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "td",
  "th",
  "dt",
  "dd",
] as const;
const FOREIGN_BLOCK_SELECTOR = FOREIGN_BLOCK_TAGS.join(",");

/** Headings and cues hold names, places and INT. or EXT., which a spelling check marks as wrong. */
const UNSPELLED_TYPES: readonly string[] = [
  "scene_heading",
  "character",
  "slug",
];

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
      parseDOM: [
        {
          tag: "p[data-type]",
          getAttrs: (dom) => {
            const firstLine = dom.getAttribute("data-first-line");
            return {
              type: dom.getAttribute("data-type"),
              id: dom.getAttribute("data-id"),
              ...(firstLine === "flush" ||
              firstLine === "drop_cap" ||
              firstLine === "raised_cap"
                ? { firstLine }
                : {}),
            };
          },
        },
        // A list item, quotation or cell that holds paragraphs is read through to them.
        ...FOREIGN_BLOCK_TAGS.map((tag): TagParseRule => ({
          tag,
          getAttrs: (dom) =>
            dom.querySelector(FOREIGN_BLOCK_SELECTOR) === null
              ? { type: "action" }
              : false,
        })),
      ],
      toDOM: (node) => {
        const id = textAttr(node, "id");
        const type = textAttr(node, "type") ?? "";
        const attrs: Record<string, string> = {
          class: `el el-${renderedType(type)}`,
          "data-type": type,
        };
        if (id !== null) attrs["data-id"] = id;
        if (UNSPELLED_TYPES.includes(type)) attrs.spellcheck = "false";
        if (isObject(node.attrs.graphic)) {
          const graphic = node.attrs.graphic;
          if (isString(graphic.kind)) attrs["data-graphic-kind"] = graphic.kind;
          if (typeof graphic.heightLines === "number")
            attrs["data-graphic-lines"] = String(graphic.heightLines);
        }
        if (
          node.attrs.firstLine === "flush" ||
          node.attrs.firstLine === "drop_cap" ||
          node.attrs.firstLine === "raised_cap"
        ) {
          attrs["data-first-line"] = node.attrs.firstLine;
        }
        return ["p", attrs, 0];
      },
    },
    text: {},
  },
  marks: MARK_SPECS,
});

function hasV4Mark(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  for (const child of content) {
    if (!isObject(child) || !Array.isArray(child.marks)) continue;
    for (const mark of child.marks) {
      if (isObject(mark) && (mark.type === "sup" || mark.type === "sub"))
        return true;
    }
  }
  return false;
}

function blockMinSchemaVersion(block: unknown): number {
  if (!isObject(block) || block.type !== "block" || !isObject(block.attrs))
    return 1;
  const attrs = block.attrs;
  if (
    (attrs.firstLine !== null && attrs.firstLine !== undefined) ||
    hasV4Mark(block.content)
  )
    return 4;
  if (
    attrs.type === "graphic" ||
    (attrs.graphic !== null && attrs.graphic !== undefined)
  )
    return 3;
  const hasTags = Array.isArray(attrs.tags) && attrs.tags.length > 0;
  const hasLinkTo = attrs.linkTo !== null && attrs.linkTo !== undefined;
  if (hasTags || hasLinkTo) return 2;
  return 1;
}

/**
 * The lowest schema version a reader needs for `input` (a whole document or a
 * list of touched blocks): 3 when any block is a graphic or carries `graphic`
 * attributes, 2 when any block carries `tags` or `linkTo`, otherwise 1.
 */
export function minSchemaVersionOf(
  input: DocJSON | readonly unknown[],
): number {
  let floor = 1;
  const visit = (blocks: readonly unknown[]): void => {
    for (const block of blocks) {
      const needed = blockMinSchemaVersion(block);
      if (needed > floor) floor = needed;
      if (floor === SCHEMA_VERSION) return;
    }
  };
  if (Array.isArray(input)) {
    visit(input);
    return floor;
  }
  if (isObject(input) && Array.isArray(input.content)) {
    for (const section of input.content) {
      if (isObject(section) && Array.isArray(section.content)) {
        visit(section.content);
        if (floor === SCHEMA_VERSION) return floor;
      }
    }
  }
  return floor;
}
