// What differs inside one block both sides hold: its attributes key by key, its text by character and mark.
import { ChangeSet, simplifyChanges } from "prosemirror-changeset";
import type { Change } from "prosemirror-changeset";
import type { Node } from "prosemirror-model";
import { StepMap } from "prosemirror-transform";
import {
  DEFAULT_BLOCK_ATTRS,
  MARK_NAMES,
  canonicalBlock,
  fillBlockAttrs,
  parseDoc,
} from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import type { CompareMode } from "./compare-mode.ts";
import { createTokenEncoder } from "./token-encoder.ts";

/** Offsets and lengths are UTF-16 units of the block's text. */
export interface InlineChange {
  /** formatted: the same text with other marks. */
  readonly kind: "inserted" | "deleted" | "formatted";
  /** In the newer block's text; for deleted, where the deleted text sat. */
  readonly offset: number;
  /** inserted, formatted: units of newer text; deleted: 0. */
  readonly length: number;
  /** inserted or formatted: the newer text; deleted: the older text. */
  readonly text: string;
  /** formatted: the names of the older text's marks, in the order of MARK_NAMES; otherwise []. */
  readonly marks: readonly string[];
}

/** Where a block's text starts in a document holding only it: after the section's and the block's opening. */
const TEXT_START = 2;

const KNOWN_ATTRS: readonly string[] = Object.keys(DEFAULT_BLOCK_ATTRS);

/** The attributes that differ: known ones in declared order, defaults filled; unknown ones by name, absent differing from any value. */
function changedAttrs(
  older: BlockJSON,
  newer: BlockJSON,
  mode: CompareMode,
): string[] {
  if (mode === "text_and_elements")
    return fillBlockAttrs(older.attrs).type === fillBlockAttrs(newer.attrs).type
      ? []
      : ["type"];
  const was: Record<string, unknown> = fillBlockAttrs(older.attrs);
  const now: Record<string, unknown> = fillBlockAttrs(newer.attrs);
  const unknown = [
    ...new Set([
      ...Object.keys(older.attrs ?? {}),
      ...Object.keys(newer.attrs ?? {}),
    ]),
  ]
    .filter((key) => !Object.hasOwn(DEFAULT_BLOCK_ATTRS, key))
    .toSorted();
  return [
    ...KNOWN_ATTRS.filter(
      (key) => JSON.stringify(was[key]) !== JSON.stringify(now[key]),
    ),
    ...unknown.filter(
      (key) =>
        JSON.stringify(older.attrs?.[key]) !==
        JSON.stringify(newer.attrs?.[key]),
    ),
  ];
}

function textOf(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

function docOf(block: BlockJSON): Node {
  return parseDoc({
    type: "doc",
    content: [{ type: "section", content: [block] }],
  });
}

function isHighSurrogate(text: string, at: number): boolean {
  const unit = text.charCodeAt(at);
  return unit >= 0xd800 && unit <= 0xdbff;
}

/** [from, to) of one side's text, clamped to it and widened so that no surrogate pair is cut. */
function textSpan(text: string, from: number, to: number): [number, number] {
  let start = Math.min(Math.max(from - TEXT_START, 0), text.length);
  let end = Math.min(Math.max(to - TEXT_START, start), text.length);
  if (isHighSurrogate(text, start - 1)) start--;
  if (end < text.length && isHighSurrogate(text, end - 1)) end++;
  return [start, end];
}

/** The names of the marks on text [from, to) of a one-block document. */
function marksIn(blockDoc: Node, from: number, to: number): string[] {
  const names = new Set<string>();
  blockDoc.nodesBetween(from + TEXT_START, to + TEXT_START, (node) => {
    for (const mark of node.marks) names.add(mark.type.name);
  });
  return MARK_NAMES.filter((name) => names.has(name));
}

interface Sides {
  olderDoc: Node;
  olderText: string;
  newerText: string;
}

function inlineOf(sides: Sides, change: Change): InlineChange[] {
  const [a0, a1] = textSpan(sides.olderText, change.fromA, change.toA);
  const [b0, b1] = textSpan(sides.newerText, change.fromB, change.toB);
  const deleted = sides.olderText.slice(a0, a1);
  const inserted = sides.newerText.slice(b0, b1);
  if (deleted === inserted) {
    if (deleted === "") return [];
    const marks = marksIn(sides.olderDoc, a0, a1);
    return [
      { kind: "formatted", offset: b0, length: b1 - b0, text: inserted, marks },
    ];
  }
  const found: InlineChange[] = [];
  if (deleted !== "")
    found.push({
      kind: "deleted",
      offset: b0,
      length: 0,
      text: deleted,
      marks: [],
    });
  if (inserted !== "")
    found.push({
      kind: "inserted",
      offset: b0,
      length: b1 - b0,
      text: inserted,
      marks: [],
    });
  return found;
}

function changedText(
  older: BlockJSON,
  newer: BlockJSON,
  mode: CompareMode,
): InlineChange[] {
  const same =
    mode === "full"
      ? JSON.stringify(older.content) === JSON.stringify(newer.content)
      : textOf(older) === textOf(newer);
  if (same) return [];
  const olderDoc = docOf(older);
  const newerDoc = docOf(newer);
  const changes = ChangeSet.create(
    olderDoc,
    undefined,
    createTokenEncoder({ mode }),
  ).addSteps(
    newerDoc,
    [new StepMap([0, olderDoc.content.size, newerDoc.content.size])],
    [0],
  ).changes;
  const sides = {
    olderDoc,
    olderText: textOf(older),
    newerText: textOf(newer),
  };
  return simplifyChanges(changes, newerDoc).flatMap((change) =>
    inlineOf(sides, change).map((found) => Object.freeze(found)),
  );
}

/**
 * How `newer` differs from `older`, both read in canonical form: the
 * attributes that differ and the changes to the text, by offset. Null when
 * the two are equal in this mode. In full mode a mark this build does not
 * know is not seen.
 */
export function compareBlock(
  older: BlockJSON,
  newer: BlockJSON,
  mode: CompareMode,
): { attrs: readonly string[]; inline: readonly InlineChange[] } | null {
  const [was, now] = [canonicalBlock(older), canonicalBlock(newer)];
  const attrs = changedAttrs(was, now, mode);
  const inline = changedText(was, now, mode);
  if (attrs.length === 0 && inline.length === 0) return null;
  return Object.freeze({
    attrs: Object.freeze(attrs),
    inline: Object.freeze(inline),
  });
}
