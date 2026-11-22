// What is wrong with a stored document, and how much it matters.
import { fillBlockAttrs } from "./attrs.ts";
import { BLOCK_ATTR_CHECKS, isElementName } from "./block-attr-checks.ts";
import { isBlockType } from "./block-types.ts";
import { isBlockId } from "./identity.ts";
import {
  MARK_ATTR_CHECKS,
  MARK_SPECS,
  OVERLAPPING_MARKS,
  isMarkName,
  isSafeHref,
} from "./marks.ts";
import type { MarkName } from "./marks.ts";
import { NODE_NAMES } from "./schema.ts";
import type { NodeName } from "./schema.ts";
import { isObject, isString } from "./shape.ts";
import type { Json } from "./shape.ts";

export type IssueCode =
  | "not_a_doc"
  | "unknown_node"
  | "non_text_content"
  | "bad_attr"
  | "bad_mark"
  | "missing_id"
  | "unknown_type"
  | "unknown_attr"
  | "unknown_mark"
  | "unsafe_link"
  | "duplicate_id"
  | "empty_section"
  | "empty_doc"
  | "not_index"
  | "num_locked";

/**
 * `reject`: structurally invalid, a push that produces it is refused.
 * `newer`: written by a newer schema; kept, never dropped.
 * `repair`: never a rejection; normalising or the authority puts it right.
 */
export type Severity = "reject" | "newer" | "repair";

export interface Issue {
  /** Where, such as "content[0].content[3].attrs.dual". */
  path: string;
  code: IssueCode;
  severity: Severity;
  /** Free English for logs. */
  message: string;
}

const SEVERITY: Record<IssueCode, Severity> = {
  not_a_doc: "reject",
  unknown_node: "reject",
  non_text_content: "reject",
  bad_attr: "reject",
  bad_mark: "reject",
  missing_id: "reject",
  unknown_type: "newer",
  unknown_attr: "newer",
  unknown_mark: "newer",
  unsafe_link: "repair",
  duplicate_id: "repair",
  empty_section: "repair",
  empty_doc: "repair",
  not_index: "reject",
  num_locked: "reject",
};

/** A mark this build knows, well formed. */
interface KnownMark {
  name: MarkName;
  attrs: Json;
}

/** The path of `key` inside the node at `path`; the root's path is "". */
function at(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

export interface BlockContext {
  /** True when a block outside `blocks` already carries this ID. The caller answers from its own index. */
  isIdTaken(id: string): boolean;
}

/** A whole document: no block lies outside it. */
const WHOLE_DOC: BlockContext = { isIdTaken: () => false };

class Walk {
  readonly issues: Issue[] = [];
  private readonly ids = new Set<string>();
  private readonly context: BlockContext;

  constructor(context: BlockContext) {
    this.context = context;
  }

  report(path: string, code: IssueCode, message: string): void {
    this.issues.push({ path, code, severity: SEVERITY[code], message });
  }

  /** A child that should be a node of type `expected`; true when it is one. */
  child(node: unknown, path: string, expected: NodeName): node is Json {
    if (!isObject(node) || typeof node.type !== "string") {
      this.report(path, "unknown_node", "not a node");
      return false;
    }
    const type = node.type;
    if (type === expected) return true;
    if (NODE_NAMES.some((name) => name === type))
      this.report(
        path,
        "non_text_content",
        `a ${type} where a ${expected} belongs`,
      );
    else this.report(path, "unknown_node", `unknown node "${type}"`);
    return false;
  }

  /** A node's children: absent reads as none. */
  content(node: Json, path: string): unknown[] {
    if (node.content === undefined) return [];
    if (Array.isArray(node.content)) return node.content;
    this.report(at(path, "content"), "unknown_node", "content is not a list");
    return [];
  }

  /** The attributes of a node that has none, such as `doc` and `section`. */
  noAttrs(node: Json, path: string): void {
    if (node.attrs === undefined) return;
    if (!isObject(node.attrs)) {
      this.report(at(path, "attrs"), "bad_attr", "attrs is not an object");
      return;
    }
    for (const key of Object.keys(node.attrs))
      this.report(
        at(at(path, "attrs"), key),
        "unknown_attr",
        `unknown attribute "${key}"`,
      );
  }

  /** Marks on a node that is not text: only text carries marks. */
  noMarks(node: Json, path: string): void {
    if (node.marks === undefined) return;
    if (Array.isArray(node.marks) && node.marks.length === 0) return;
    this.report(at(path, "marks"), "bad_mark", "only text carries marks");
  }

  doc(json: unknown): void {
    if (!isObject(json) || json.type !== "doc") {
      this.report("", "not_a_doc", "the root is not a doc");
      return;
    }
    this.noAttrs(json, "");
    this.noMarks(json, "");
    const sections = this.content(json, "");
    if (sections.length === 0)
      this.report(at("", "content"), "empty_doc", "the doc has no sections");
    sections.forEach((section, i) => {
      const path = at("", `content[${i}]`);
      if (this.child(section, path, "section")) this.section(section, path);
    });
  }

  section(section: Json, path: string): void {
    this.noAttrs(section, path);
    this.noMarks(section, path);
    const blocks = this.content(section, path);
    if (blocks.length === 0)
      this.report(
        at(path, "content"),
        "empty_section",
        "the section has no blocks",
      );
    blocks.forEach((block, i) => {
      const blockPath = at(path, `content[${i}]`);
      if (this.child(block, blockPath, "block")) this.block(block, blockPath);
    });
  }

  block(block: Json, path: string): void {
    this.noMarks(block, path);
    const attrs = block.attrs ?? {};
    if (!isObject(attrs))
      this.report(at(path, "attrs"), "bad_attr", "attrs is not an object");
    else this.blockAttrs(attrs, at(path, "attrs"));
    this.content(block, path).forEach((text, i) => {
      const textPath = at(path, `content[${i}]`);
      if (this.child(text, textPath, "text")) this.text(text, textPath);
    });
  }

  blockAttrs(attrs: Json, path: string): void {
    const filled: Json = fillBlockAttrs(attrs);

    const id = filled.id;
    if (id === null)
      this.report(at(path, "id"), "missing_id", "the block has no ID");
    else if (!isBlockId(id))
      this.report(at(path, "id"), "bad_attr", "not a block ID");
    else if (this.ids.has(id) || this.context.isIdTaken(id))
      this.report(at(path, "id"), "duplicate_id", `ID "${id}" is used twice`);
    else this.ids.add(id);

    const type = filled.type;
    if (!isElementName(type))
      this.report(at(path, "type"), "bad_attr", "not an element name");
    else if (!isBlockType(type))
      this.report(
        at(path, "type"),
        "unknown_type",
        `unknown element "${type}"`,
      );

    for (const [key, check] of Object.entries(BLOCK_ATTR_CHECKS))
      if (!check(filled[key]))
        this.report(at(path, key), "bad_attr", `bad value for "${key}"`);

    for (const key of Object.keys(attrs))
      if (!Object.hasOwn(filled, key))
        this.report(
          at(path, key),
          "unknown_attr",
          `unknown attribute "${key}"`,
        );
  }

  text(text: Json, path: string): void {
    if (!isString(text.text) || text.text === "")
      this.report(
        at(path, "text"),
        "bad_attr",
        "text is not a non-empty string",
      );
    if (text.marks === undefined) return;
    if (!Array.isArray(text.marks)) {
      this.report(at(path, "marks"), "bad_mark", "marks is not a list");
      return;
    }
    const held: KnownMark[] = [];
    text.marks.forEach((mark: unknown, i) => {
      const markPath = at(path, `marks[${i}]`);
      const known = this.mark(mark, markPath);
      if (known === null) return;
      if (held.some((other) => conflictsWith(other, known)))
        this.report(
          markPath,
          "bad_mark",
          `mark "${known.name}" is given twice`,
        );
      held.push(known);
    });
  }

  /** Checks one mark; returns it when this build knows it and it is well formed. */
  mark(mark: unknown, path: string): KnownMark | null {
    if (!isObject(mark) || !isString(mark.type)) {
      this.report(path, "bad_mark", "not a mark");
      return null;
    }
    const name = mark.type;
    if (!isMarkName(name)) {
      this.report(path, "unknown_mark", `unknown mark "${name}"`);
      return null;
    }
    const attrs = mark.attrs ?? {};
    if (!isObject(attrs)) {
      this.report(at(path, "attrs"), "bad_mark", "attrs is not an object");
      return null;
    }
    const checks = MARK_ATTR_CHECKS[name];
    let wellFormed = true;
    for (const [key, value] of Object.entries(attrs)) {
      const attrPath = at(at(path, "attrs"), key);
      if (!Object.hasOwn(checks, key))
        this.report(attrPath, "unknown_attr", `unknown attribute "${key}"`);
      else if (value !== undefined && !checks[key]!(value)) {
        this.report(attrPath, "bad_mark", `bad value for "${key}"`);
        wellFormed = false;
      }
    }
    if (!wellFormed) return null;
    if (name === "link") {
      const href = attrs.href ?? "";
      if (isString(href) && !isSafeHref(href))
        this.report(
          at(at(path, "attrs"), "href"),
          "unsafe_link",
          "the link is not http, https or mailto",
        );
    }
    return { name, attrs };
  }
}

/** Two marks this build cannot hold together on one piece of text. */
function conflictsWith(a: KnownMark, b: KnownMark): boolean {
  if (a.name !== b.name) return false;
  if (!OVERLAPPING_MARKS.some((name) => name === a.name)) return true;
  // ProseMirror compares marks with their defaults filled in, and so must this.
  const specs = MARK_SPECS[a.name].attrs ?? {};
  const value = (attrs: Json, key: string): unknown =>
    attrs[key] ?? specs[key]?.default;
  return Object.keys(specs).every(
    (key) => value(a.attrs, key) === value(b.attrs, key),
  );
}

/**
 * Every issue in a stored document, in document order. Reads the raw shape
 * (attrs, content and marks always present) and the typed DocJSON (where a
 * missing one reads as empty). Never throws.
 */
export function validateDoc(json: unknown): Issue[] {
  const walk = new Walk(WHOLE_DOC);
  walk.doc(json);
  return walk.issues;
}

/**
 * Every issue in these blocks, in order: what validateDoc reports for a block, with paths starting `blocks[<i>]`.
 * `duplicate_id` is reported for an ID met earlier in `blocks` or taken according to `context`. Never throws.
 */
export function validateBlocks(
  blocks: readonly unknown[],
  context: BlockContext,
): Issue[] {
  const walk = new Walk(context);
  blocks.forEach((block, i) => {
    const path = `blocks[${i}]`;
    if (walk.child(block, path, "block")) walk.block(block, path);
  });
  return walk.issues;
}

/** True when any issue makes the document structurally invalid. */
export function rejects(issues: readonly Issue[]): boolean {
  return issues.some((issue) => issue.severity === "reject");
}
