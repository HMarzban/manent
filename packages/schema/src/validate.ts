// What is wrong with a stored document, and how much it matters.
import { DEFAULT_BLOCK_ATTRS } from "./attrs.ts";
import type { BlockAttrs } from "./attrs.ts";
import { ACT_BREAK_KINDS, BLOCK_TYPES } from "./block-types.ts";
import { isBlockId, parseFrom } from "./identity.ts";
import { MARK_NAMES, OVERLAPPING_MARKS, isSafeHref } from "./marks.ts";
import type { MarkName } from "./marks.ts";

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
  | "empty_doc";

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
};

type Json = Record<string, unknown>;
type Check = (value: unknown) => boolean;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString: Check = (value) => typeof value === "string";
const isBoolean: Check = (value) => typeof value === "boolean";
const isCount: Check = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
const orNull =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const oneOf =
  (values: readonly unknown[]): Check =>
  (value) =>
    values.includes(value);

const ELEMENT_NAME = /^[a-z_]{1,32}$/;

/** The valid values of each block attribute except `id` and `type`, which have their own codes. */
const BLOCK_ATTR_CHECKS: Record<
  Exclude<keyof BlockAttrs, "id" | "type">,
  Check
> = {
  num: orNull(isString),
  omitted: isBoolean,
  dual: orNull(oneOf(["left", "right"])),
  synopsis: isString,
  align: orNull(oneOf(["left", "center", "right"])),
  indent: orNull(isCount),
  width: orNull(isCount),
  spaceBefore: orNull(isCount),
  noContd: isBoolean,
  noTiming: isBoolean,
  owner: orNull(isString),
  suggest: orNull(isString),
  from: (value) =>
    value === null || (isString(value) && parseFrom(value as string) !== null),
  kind: orNull(oneOf(ACT_BREAK_KINDS)),
  suggestId: orNull(isString),
  suggestBy: orNull(isString),
  suggestAt: orNull(isCount),
};

const SUGGESTION_ATTRS = { id: isString, author: isString, at: isCount };

/** The attributes of each mark, with their valid values. */
const MARK_ATTR_CHECKS: Record<MarkName, Record<string, Check>> = {
  bold: {},
  italic: {},
  underline: {},
  strike: {},
  caps: {},
  color: { value: isString },
  highlight: { value: isString },
  link: { href: isString },
  suggest_insert: SUGGESTION_ATTRS,
  suggest_delete: SUGGESTION_ATTRS,
};

const NODE_NAMES = ["doc", "section", "block", "text"];

class Walk {
  readonly issues: Issue[] = [];
  private readonly ids = new Set<string>();

  report(path: string, code: IssueCode, message: string): void {
    this.issues.push({ path, code, severity: SEVERITY[code], message });
  }

  /** A child that should be a node of type `expected`; true when it is one. */
  child(node: unknown, path: string, expected: string): node is Json {
    if (!isObject(node) || typeof node.type !== "string") {
      this.report(path, "unknown_node", "not a node");
      return false;
    }
    if (node.type === expected) return true;
    if (NODE_NAMES.includes(node.type))
      this.report(
        path,
        "non_text_content",
        `a ${node.type} where a ${expected} belongs`,
      );
    else this.report(path, "unknown_node", `unknown node "${node.type}"`);
    return false;
  }

  /** A node's children: absent reads as none. */
  content(node: Json, path: string): unknown[] {
    if (node.content === undefined) return [];
    if (Array.isArray(node.content)) return node.content;
    this.report(`${path}content`, "unknown_node", "content is not a list");
    return [];
  }

  /** The attributes of a node that has none, such as `doc` and `section`. */
  noAttrs(node: Json, path: string): void {
    if (node.attrs === undefined) return;
    if (!isObject(node.attrs)) {
      this.report(`${path}attrs`, "bad_attr", "attrs is not an object");
      return;
    }
    for (const key of Object.keys(node.attrs))
      this.report(
        `${path}attrs.${key}`,
        "unknown_attr",
        `unknown attribute "${key}"`,
      );
  }

  doc(json: unknown): void {
    if (!isObject(json) || json.type !== "doc") {
      this.report("", "not_a_doc", "the root is not a doc");
      return;
    }
    this.noAttrs(json, "");
    const sections = this.content(json, "");
    if (sections.length === 0)
      this.report("content", "empty_doc", "the doc has no sections");
    sections.forEach((section, i) => {
      const path = `content[${i}]`;
      if (this.child(section, path, "section"))
        this.section(section, `${path}.`);
    });
  }

  section(section: Json, path: string): void {
    this.noAttrs(section, path);
    const blocks = this.content(section, path);
    if (blocks.length === 0)
      this.report(
        `${path}content`,
        "empty_section",
        "the section has no blocks",
      );
    blocks.forEach((block, i) => {
      const at = `${path}content[${i}]`;
      if (this.child(block, at, "block")) this.block(block, `${at}.`);
    });
  }

  block(block: Json, path: string): void {
    const attrs = block.attrs ?? {};
    if (!isObject(attrs))
      this.report(`${path}attrs`, "bad_attr", "attrs is not an object");
    else this.blockAttrs(attrs, `${path}attrs.`);
    this.content(block, path).forEach((text, i) => {
      const at = `${path}content[${i}]`;
      if (this.child(text, at, "text")) this.text(text, `${at}.`);
    });
  }

  blockAttrs(attrs: Json, path: string): void {
    const given = (key: string) =>
      Object.hasOwn(attrs, key) && attrs[key] !== undefined
        ? attrs[key]
        : DEFAULT_BLOCK_ATTRS[key as keyof BlockAttrs];

    const id = given("id");
    if (id === null)
      this.report(`${path}id`, "missing_id", "the block has no ID");
    else if (!isBlockId(id))
      this.report(`${path}id`, "bad_attr", "not a block ID");
    else if (this.ids.has(id))
      this.report(`${path}id`, "duplicate_id", `ID "${id}" is used twice`);
    else this.ids.add(id);

    const type = given("type");
    if (typeof type !== "string" || !ELEMENT_NAME.test(type))
      this.report(`${path}type`, "bad_attr", "not an element name");
    else if (!(BLOCK_TYPES as readonly string[]).includes(type))
      this.report(`${path}type`, "unknown_type", `unknown element "${type}"`);

    for (const key of Object.keys(attrs)) {
      if (key === "id" || key === "type") continue;
      if (!Object.hasOwn(BLOCK_ATTR_CHECKS, key))
        this.report(
          `${path}${key}`,
          "unknown_attr",
          `unknown attribute "${key}"`,
        );
      else if (
        !BLOCK_ATTR_CHECKS[key as keyof typeof BLOCK_ATTR_CHECKS](given(key))
      )
        this.report(`${path}${key}`, "bad_attr", `bad value for "${key}"`);
    }
  }

  text(text: Json, path: string): void {
    if (typeof text.text !== "string" || text.text === "")
      this.report(`${path}text`, "bad_attr", "text is not a non-empty string");
    if (text.marks === undefined) return;
    if (!Array.isArray(text.marks)) {
      this.report(`${path}marks`, "bad_mark", "marks is not a list");
      return;
    }
    const held: { name: string; attrs: Json }[] = [];
    text.marks.forEach((mark: unknown, i) => {
      const at = `${path}marks[${i}]`;
      const known = this.mark(mark, at);
      if (known === null) return;
      if (held.some((other) => sameMark(other, known)))
        this.report(at, "bad_mark", `mark "${known.name}" is given twice`);
      held.push(known);
    });
  }

  /** Checks one mark; returns it when this build knows it and it is well formed. */
  mark(mark: unknown, path: string): { name: string; attrs: Json } | null {
    if (!isObject(mark) || typeof mark.type !== "string") {
      this.report(path, "bad_mark", "not a mark");
      return null;
    }
    if (!(MARK_NAMES as readonly string[]).includes(mark.type)) {
      this.report(path, "unknown_mark", `unknown mark "${mark.type}"`);
      return null;
    }
    const name = mark.type as MarkName;
    const attrs = mark.attrs ?? {};
    if (!isObject(attrs)) {
      this.report(`${path}.attrs`, "bad_mark", "attrs is not an object");
      return null;
    }
    const checks = MARK_ATTR_CHECKS[name];
    let wellFormed = true;
    for (const [key, value] of Object.entries(attrs)) {
      if (!Object.hasOwn(checks, key))
        this.report(
          `${path}.attrs.${key}`,
          "unknown_attr",
          `unknown attribute "${key}"`,
        );
      else if (value !== undefined && !checks[key]!(value)) {
        this.report(
          `${path}.attrs.${key}`,
          "bad_mark",
          `bad value for "${key}"`,
        );
        wellFormed = false;
      }
    }
    if (
      name === "link" &&
      wellFormed &&
      !isSafeHref((attrs.href as string | undefined) ?? "")
    )
      this.report(
        `${path}.attrs.href`,
        "unsafe_link",
        "the link is not http, https or mailto",
      );
    return wellFormed ? { name, attrs } : null;
  }
}

/** Two marks this build cannot hold together on one piece of text. */
function sameMark(
  a: { name: string; attrs: Json },
  b: { name: string; attrs: Json },
): boolean {
  if (a.name !== b.name) return false;
  if (!(OVERLAPPING_MARKS as readonly string[]).includes(a.name)) return true;
  const keys = Object.keys(MARK_ATTR_CHECKS[a.name as MarkName]);
  return keys.every((key) => a.attrs[key] === b.attrs[key]);
}

/**
 * Every issue in a stored document, in document order. Reads the raw shape
 * (attrs, content and marks always present) and the typed DocJSON (where a
 * missing one reads as empty). Never throws.
 */
export function validateDoc(json: unknown): Issue[] {
  const walk = new Walk();
  walk.doc(json);
  return walk.issues;
}

/** True when any issue makes the document structurally invalid. */
export function rejects(issues: readonly Issue[]): boolean {
  return issues.some((issue) => issue.severity === "reject");
}
