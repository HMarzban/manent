import type { Node } from "prosemirror-model";
import { fillBlockAttrs } from "./attrs.ts";
import type { BlockAttrs } from "./attrs.ts";
import { isMarkName } from "./marks.ts";
import { schema } from "./schema.ts";
import { isObject } from "./shape.ts";
import type { Json } from "./shape.ts";

// JSON shapes are open: a newer build may have written attributes and marks
// this one does not know.
export interface MarkJSON {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface TextJSON {
  type: "text";
  text: string;
  marks?: MarkJSON[];
}
export interface BlockJSON {
  type: "block";
  attrs?: Partial<BlockAttrs> & Record<string, unknown>;
  content?: TextJSON[];
}
export interface SectionJSON {
  type: "section";
  content?: BlockJSON[];
}
export interface DocJSON {
  type: "doc";
  content?: SectionJSON[];
}

/** The attributes this build knows, from those given. */
function knownAttrs(
  known: Record<string, unknown>,
  given: Json,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(given).filter(([key]) => Object.hasOwn(known, key)),
  );
}

/** A mark as this build sees it, or null when this build does not know it. */
function markView(mark: unknown): unknown {
  if (!isObject(mark) || typeof mark.type !== "string") return mark;
  if (!isMarkName(mark.type)) return null;
  const type = schema.marks[mark.type];
  if (!isObject(mark.attrs)) return mark;
  return { ...mark, attrs: knownAttrs(type.spec.attrs ?? {}, mark.attrs) };
}

/**
 * A node as this build sees it: unknown marks and attributes left out. Input
 * of the wrong shape passes through untouched for ProseMirror to refuse.
 */
function nodeView(node: unknown): unknown {
  if (!isObject(node)) return node;
  const view: Json = { ...node };
  if (
    node.type === "block" &&
    (node.attrs === undefined || isObject(node.attrs))
  )
    view.attrs = fillBlockAttrs(node.attrs);
  if (Array.isArray(node.content)) view.content = node.content.map(nodeView);
  if (Array.isArray(node.marks))
    view.marks = node.marks.map(markView).filter((mark) => mark !== null);
  return view;
}

/**
 * This build's view of a stored document: unknown marks and attributes are
 * left out, then it is built and checked. Throws a RangeError when the
 * structure is wrong.
 */
export function parseDoc(json: DocJSON): Node {
  const doc = schema.nodeFromJSON(nodeView(json));
  doc.check();
  return doc;
}
