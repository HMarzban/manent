import type { Node } from "prosemirror-model";
import { fillBlockAttrs } from "./attrs.ts";
import type { BlockAttrs } from "./attrs.ts";
import { schema } from "./schema.ts";

// JSON shapes are open: a newer build may have written attributes and marks
// this one does not know.
export type MarkJSON = { type: string; attrs?: Record<string, unknown> };
export type TextJSON = { type: "text"; text: string; marks?: MarkJSON[] };
export type BlockJSON = {
  type: "block";
  attrs?: Partial<BlockAttrs> & Record<string, unknown>;
  content?: TextJSON[];
};
export type SectionJSON = { type: "section"; content?: BlockJSON[] };
export type DocJSON = { type: "doc"; content?: SectionJSON[] };

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  const type = Object.hasOwn(schema.marks, mark.type)
    ? schema.marks[mark.type as keyof typeof schema.marks]
    : undefined;
  if (type === undefined) return null;
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
