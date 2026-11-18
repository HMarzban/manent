// Plain ProseMirror documents and states for the editor's tests.
import { profileFor } from "@manent/pagination";
import type { PageProfile } from "@manent/pagination";
import {
  RULE_SCRIPTS,
  corpusDoc,
  generateBlocks,
} from "@manent/pagination/testing";
import type { CorpusBlock } from "@manent/pagination/testing";
import { parseDoc, schema } from "@manent/schema";
import type { IdSource } from "@manent/schema";
import fc from "fast-check";
import { Fragment } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Command, Transaction } from "prosemirror-state";
import type { Decoration, DecorationSet } from "prosemirror-view";
import {
  blockPos,
  deleteRangeKeepingSections,
  paginationKey,
  paginationPlugin,
  pasteSlice,
  sectionBackspace,
  sectionEnter,
  setPagination,
} from "../src/index.ts";

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
export function run(start: EditorState, command: Command): EditorState {
  let next = start;
  const applied = command(start, (tr) => {
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

export const sp: PageProfile = profileFor("screenplay")!;

/** A state of `doc` with the pagination plugin alone, whose deferred work runs at once. */
export function state(doc: Node, profile: PageProfile = sp): EditorState {
  return EditorState.create({
    doc,
    plugins: [
      paginationPlugin({
        profile,
        defer: (work) => work(),
        offFontNote: "note",
      }),
    ],
  });
}

/** The first `count` blocks of the seeded screenplay, in sections of 100. */
export function script(count = 1500): Node {
  return parseDoc(corpusDoc(generateBlocks("screenplay", count, 1)));
}

/** The document with block `block` (in document order) replaced by `make` of it; every other node is the same object. */
function withBlock(doc: Node, block: number, make: (node: Node) => Node): Node {
  let seen = 0;
  const sections: Node[] = [];
  doc.forEach((section) => {
    const at = block - seen;
    seen += section.childCount;
    sections.push(
      at >= 0 && at < section.childCount
        ? section.copy(
            section.content.replaceChild(at, make(section.child(at))),
          )
        : section,
    );
  });
  return doc.copy(Fragment.from(sections));
}

/** One step over the whole document that gives block `block` the text `text` and reuses every other node, as a remote change does. */
export function replaceWholeDoc(
  s: EditorState,
  block: number,
  text: string,
): Transaction {
  const next = withBlock(s.doc, block, (node) =>
    node.type.create(node.attrs, schema.text(text), node.marks),
  );
  return s.tr.replaceWith(0, s.doc.content.size, next.content);
}

/** The document with one attribute of block `block` set to `value`, which may be one validation refuses. */
export function docWithAttr(
  doc: Node,
  block: number,
  attr: string,
  value: unknown,
): Node {
  return withBlock(doc, block, (node) =>
    node.type.create(
      { ...node.attrs, [attr]: value },
      node.content,
      node.marks,
    ),
  );
}

/** Where a step acts: a block and an offset into its text, each taken modulo what the document holds. */
interface At {
  readonly block: number;
  readonly offset: number;
}

type Step =
  | { readonly kind: "type"; readonly at: At; readonly text: string }
  | { readonly kind: "delete"; readonly at: At; readonly length: number }
  | {
      readonly kind: "attr";
      readonly at: At;
      readonly name: string;
      readonly value: string | number | null;
    }
  | { readonly kind: "enter"; readonly at: At }
  | { readonly kind: "backspace"; readonly at: At }
  | { readonly kind: "paste"; readonly at: At; readonly blocks: number }
  | { readonly kind: "replace"; readonly at: At; readonly text: string }
  | { readonly kind: "compose"; readonly at: At; readonly text: string };

const arbAt = fc.record({ block: fc.nat(), offset: fc.nat() });
const arbWords = fc
  .array(fc.constantFrom("rain", "a", "door", "MARA", "slowly", " ", "."), {
    minLength: 1,
    maxLength: 30,
  })
  .map((words) => words.join(" "));
const arbAttr = fc.oneof(
  fc.record({
    name: fc.constantFrom("width", "indent", "spaceBefore"),
    value: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 80 })),
  }),
  fc.record({
    name: fc.constant("type"),
    value: fc.constantFrom(
      "action",
      "character",
      "dialogue",
      "parenthetical",
      "scene_heading",
      "transition",
      "page_break",
      "general",
    ),
  }),
  fc.record({
    name: fc.constant("dual"),
    value: fc.constantFrom(null, "left", "right"),
  }),
);
const arbStep: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant("type"), at: arbAt, text: arbWords }),
  fc.record({
    kind: fc.constant("delete"),
    at: arbAt,
    length: fc.integer({ min: 1, max: 400 }),
  }),
  fc
    .tuple(arbAt, arbAttr)
    .map(([at, attr]) => ({ kind: "attr" as const, at, ...attr })),
  fc.record({ kind: fc.constant("enter"), at: arbAt }),
  fc.record({ kind: fc.constant("backspace"), at: arbAt }),
  fc.record({
    kind: fc.constant("paste"),
    at: arbAt,
    blocks: fc.integer({ min: 1, max: 120 }),
  }),
  fc.record({ kind: fc.constant("replace"), at: arbAt, text: arbWords }),
  fc.record({ kind: fc.constant("compose"), at: arbAt, text: arbWords }),
);

/** The block a step names, and the position `at.offset` points to inside it. */
function placeOf(s: EditorState, at: At): { block: number; pos: number } {
  const index = paginationKey.getState(s)!.index;
  const block = at.block % index.blocks.length;
  const start = blockPos(index, block) + 1;
  return {
    block,
    pos: start + (at.offset % (index.blocks[block]!.text.length + 1)),
  };
}

function caretAt(s: EditorState, pos: number): EditorState {
  return s.apply(s.tr.setSelection(TextSelection.create(s.doc, pos)));
}

const pastedBlocks = (count: number): Node =>
  docOf([Array.from({ length: count }, (_, i) => `pasted line ${i}`)]);

function applyStep(s: EditorState, step: Step): EditorState {
  const { block, pos } = placeOf(s, step.at);
  switch (step.kind) {
    case "type":
      return s.apply(s.tr.insertText(step.text, pos));
    case "delete": {
      const to = Math.min(pos + step.length, s.doc.content.size);
      return s.apply(deleteRangeKeepingSections(s.tr, pos, to));
    }
    case "attr":
      return s.apply(
        s.tr.setNodeAttribute(
          blockPos(paginationKey.getState(s)!.index, block),
          step.name,
          step.value,
        ),
      );
    case "enter":
      return run(caretAt(s, pos), sectionEnter({ ids: counter("e") }));
    case "backspace": {
      const start = blockPos(paginationKey.getState(s)!.index, block) + 1;
      return run(caretAt(s, start), sectionBackspace());
    }
    case "paste": {
      const pasted = pastedBlocks(step.blocks);
      const at = caretAt(s, pos);
      return at.apply(
        pasteSlice(at, pasted.slice(0, pasted.content.size), counter("p")),
      );
    }
    case "replace":
      return s.apply(
        replaceWholeDoc(s, block, step.text).setMeta("remote", true),
      );
    case "compose": {
      const typing = s.apply(
        s.tr.insertText(step.text, pos).setMeta("composition", 1),
      );
      return typing.apply(setPagination(typing.tr, { repaginate: true }));
    }
  }
}

/** Up to six edits of any kind, applied in order; shown as the steps they take. */
export const arbTransactions: fc.Arbitrary<(s: EditorState) => EditorState> = fc
  .array(arbStep, { minLength: 1, maxLength: 6 })
  .map((steps) =>
    Object.assign((s: EditorState) => steps.reduce(applyStep, s), {
      toString: () => JSON.stringify(steps),
    }),
  );

export const play: PageProfile = profileFor("stage_play")!;

/** The blocks of a rule script, by name. */
export function ruleScript(name: string): readonly CorpusBlock[] {
  const found = RULE_SCRIPTS.find((s) => s.name === name);
  if (found === undefined) throw new RangeError(`no rule script ${name}`);
  return found.blocks;
}

/** One section of blocks, each [element, text]; block k has the id bid(k). */
export function docOfBlocks(
  blocks: readonly (readonly [string, string])[],
): Node {
  return schema.node(
    "doc",
    null,
    schema.node(
      "section",
      null,
      blocks.map(([type, text], k) =>
        schema.node(
          "block",
          { id: bid(k), type },
          text === "" ? [] : schema.text(text),
        ),
      ),
    ),
  );
}

/** A node or inline decoration's attributes, which prosemirror-view keeps on a member its types leave out. */
function attrsOf(decoration: Decoration): Record<string, string> {
  const type: unknown = Reflect.get(decoration, "type");
  const attrs: unknown =
    typeof type === "object" && type !== null
      ? Reflect.get(type, "attrs")
      : null;
  if (typeof attrs !== "object" || attrs === null)
    throw new TypeError("a decoration with no attributes");
  return Object.fromEntries(
    Object.entries(attrs).map(([name, value]) => [name, String(value)]),
  );
}

function labelOf(decoration: Decoration): string {
  const key: unknown = decoration.spec.key;
  if (typeof key === "string") return key;
  const { nodeName, class: className, ...rest } = attrsOf(decoration);
  if (nodeName !== undefined) return nodeName;
  return [
    ...(className === undefined ? [] : [className]),
    ...Object.keys(rest),
  ].join(" ");
}

/** Every decoration as "from:to:" and its key, its class and attribute names, or its node name; sorted. */
export function keysOf(set: DecorationSet): string[] {
  return set
    .find()
    .map((d) => `${d.from}:${d.to}:${labelOf(d)}`)
    .toSorted();
}

/** Per block in document order, its node decoration's attributes from the pagination plugin, or null. */
export function blockDecorations(
  s: EditorState,
): (Record<string, string> | null)[] {
  const { index, decorations } = paginationKey.getState(s)!;
  return index.blocks.map((_, i) => {
    const from = blockPos(index, i);
    const to = from + s.doc.nodeAt(from)!.nodeSize;
    const node = decorations
      .find(from, to)
      .find((d) => d.from === from && d.to === to);
    return node === undefined ? null : attrsOf(node);
  });
}
