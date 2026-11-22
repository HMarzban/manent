// How the script body is stored: the layout the y-prosemirror 1.3.7 binding reads and writes.
import {
  OVERLAPPING_MARKS,
  canonicalDoc,
  fillBlockAttrs,
  schema,
} from "@manent/schema";
import type {
  BlockJSON,
  DocJSON,
  MarkJSON,
  RawDoc,
  RawElement,
  RawMark,
  RawText,
} from "@manent/schema";
import { encodeAny, toBase64 } from "lib0/buffer";
import { digest } from "lib0/hash/sha256";
import * as Y from "yjs";
import { createDoc, yDocOf } from "./doc.ts";
import type { CrdtDoc, DocOptions } from "./doc.ts";

/** The name the editor binding gives the script body's fragment. */
export const FRAGMENT_NAME = "prosemirror";

/** An element whose attributes are set: values are whatever a writer stores, never null. */
export type StoredElement = Y.XmlElement<Record<string, NonNullable<unknown>>>;

/** A stretch of one text child: its text and its attributes, keyed as stored. */
interface StoredRun {
  text: string;
  attrs: Record<string, unknown>;
}

/** The ten characters the binding appends to an overlapping mark's name. */
const HASH_SUFFIX = new RegExp("--[A-Za-z0-9+/=]{8}$");

type OverlappingMark = (typeof OVERLAPPING_MARKS)[number];

/** The script body's fragment, for the editor binding only. */
export function yXmlFragmentForBinding(doc: CrdtDoc): Y.XmlFragment {
  return yDocOf(doc).getXmlFragment(FRAGMENT_NAME);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOverlapping(name: string): name is OverlappingMark {
  return OVERLAPPING_MARKS.some((overlapping) => overlapping === name);
}

/** The binding's suffix: SHA-256 folded to six bytes with XOR, in base64. */
function hashOf(json: unknown): string {
  const bytes = digest(encodeAny(json));
  for (let i = 6; i < bytes.length; i++)
    bytes[i % 6] = bytes[i % 6]! ^ bytes[i]!;
  return toBase64(bytes.slice(0, 6));
}

/**
 * The text attribute that stores a mark. An overlapping mark is keyed by the
 * hash of its canonical form and stores that form's attributes, so every
 * spelling of one suggestion lands on one key.
 */
export function storedMark(mark: MarkJSON): [string, Record<string, unknown>] {
  if (!isOverlapping(mark.type)) return [mark.type, { ...mark.attrs }];
  const canonical = schema.marks[mark.type].create(mark.attrs);
  return [
    `${mark.type}--${hashOf(canonical.toJSON())}`,
    { ...canonical.attrs },
  ];
}

/** Text attributes holding exactly `marks`; Yjs clears every other one in effect. */
export function markAttrs(
  marks: readonly MarkJSON[],
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(marks.map(storedMark));
}

function markOf(key: string, value: unknown): RawMark {
  return {
    type: HASH_SUFFIX.test(key) ? key.slice(0, -10) : key,
    attrs: isObject(value) ? value : {},
  };
}

/** The stretches of a text child. Embeds, which the binding never writes, are skipped. */
export function runsOf(text: Y.XmlText): StoredRun[] {
  const delta: unknown = text.toDelta();
  if (!Array.isArray(delta)) return [];
  return delta.flatMap((op: unknown) =>
    isObject(op) && typeof op.insert === "string"
      ? [
          {
            text: op.insert,
            attrs: isObject(op.attributes) ? op.attributes : {},
          },
        ]
      : [],
  );
}

function rawRuns(text: Y.XmlText): RawText[] {
  return runsOf(text).map((run) => ({
    type: "text",
    text: run.text,
    marks: Object.entries(run.attrs).map(([key, value]) => markOf(key, value)),
  }));
}

/** The live items of a text, or of an element's children, in order; Yjs keeps the head of the list private, and only deleted or format items lie before the first live one. */
export function* liveItemsOf(
  store: Y.Doc["store"],
  type: Y.XmlText | Y.XmlElement,
): Generator<Y.Item> {
  const first = Y.createRelativePositionFromTypeIndex(type, 0).item;
  if (first === null) return;
  for (
    let item: Y.Item | null = Y.getItem(store, first);
    item !== null;
    item = item.right
  )
    if (!item.deleted) yield item;
}

export function isElement(node: unknown, name: string): node is Y.XmlElement {
  return node instanceof Y.XmlElement && node.nodeName === name;
}

export function elementsNamed(
  parent: Y.XmlFragment,
  name: string,
): Y.XmlElement[] {
  return parent.toArray().filter((child) => isElement(child, name));
}

export function textsOf(block: Y.XmlElement): Y.XmlText[] {
  return block.toArray().filter((child) => child instanceof Y.XmlText);
}

export function blockElement(json: BlockJSON): Y.XmlElement {
  const element = new Y.XmlElement("block");
  const stored: StoredElement = element;
  for (const [key, value] of Object.entries({
    ...json.attrs,
    ...fillBlockAttrs(json.attrs),
  }))
    if (value !== null && value !== undefined) stored.setAttribute(key, value);
  const content = json.content ?? [];
  if (content.length === 0) return element;
  const text = new Y.XmlText();
  let at = 0;
  for (const run of content) {
    text.insert(at, run.text, markAttrs(run.marks ?? []));
    at += run.text.length;
  }
  element.insert(0, [text]);
  return element;
}

export function sectionElement(blocks: readonly BlockJSON[]): Y.XmlElement {
  const section = new Y.XmlElement("section");
  section.insert(0, blocks.map(blockElement));
  return section;
}

/** Stores the JSON as given, filling only attribute defaults: nothing is validated, normalised or assigned. */
export function scriptDocFromJSON(
  json: DocJSON,
  options?: DocOptions,
): CrdtDoc {
  const doc = createDoc(options);
  yXmlFragmentForBinding(doc).insert(
    0,
    (json.content ?? []).map((section) =>
      sectionElement(section.content ?? []),
    ),
  );
  return doc;
}

/** The block as stored, before its canonical form. */
export function blockJSON(block: Y.XmlElement): BlockJSON {
  return {
    type: "block",
    attrs: block.getAttributes(),
    content: textsOf(block).flatMap(rawRuns),
  };
}

/** Sections and their blocks in canonical form; anything else stored is left out. */
export function materializeDoc(fragment: Y.XmlFragment): DocJSON {
  return canonicalDoc({
    type: "doc",
    content: elementsNamed(fragment, "section").map((section) => ({
      type: "section",
      content: elementsNamed(section, "block").map(blockJSON),
    })),
  });
}

function rawContent(parent: Y.XmlFragment): (RawElement | RawText)[] {
  return parent.toArray().flatMap((child): (RawElement | RawText)[] => {
    if (child instanceof Y.XmlText) return rawRuns(child);
    if (child instanceof Y.XmlElement)
      return [
        {
          type: child.nodeName,
          attrs: child.getAttributes(),
          content: rawContent(child),
        },
      ];
    // a hook has no form in the raw shape, and the binding never writes one
    return [];
  });
}

/** Every stored element, attribute and run, with only the storage suffix taken off mark names. */
export function materializeRawDoc(fragment: Y.XmlFragment): RawDoc {
  return { type: "doc", attrs: {}, content: rawContent(fragment) };
}
