// A document's blocks as plain frozen data, for code that must not hold ProseMirror nodes.
import { Node } from "prosemirror-model";
import { fillBlockAttrs } from "./attrs.ts";
import type { BlockAttrs } from "./attrs.ts";
import { BLOCK_ATTR_CHECKS, isElementName } from "./block-attr-checks.ts";
import { isBlockId } from "./identity.ts";
import type { BlockJSON, DocJSON } from "./json.ts";
import { MARK_NAMES, isMarkName } from "./marks.ts";
import type { Check } from "./shape.ts";

export interface TextRun {
  readonly text: string;
  /** Mark names, each once, in the order of MARK_NAMES, unknown names after them by name. */
  readonly marks: readonly string[];
}

export interface BlockView {
  /** Every attribute, defaults filled. */
  readonly attrs: BlockAttrs;
  /** The runs as stored; none for an empty block. */
  readonly runs: readonly TextRun[];
}

export interface FlatBlock extends BlockView {
  /** The section's index in the document. */
  readonly section: number;
  /** The block's position in document order. */
  readonly index: number;
}

/** The values validateDoc accepts for every block attribute. */
const ATTR_CHECKS: Readonly<Record<keyof BlockAttrs, Check>> = {
  id: isBlockId,
  type: isElementName,
  ...BLOCK_ATTR_CHECKS,
};

/** Throws TypeError at the first attribute holding a value validateDoc refuses. */
function assertBlockAttrs(
  attrs: Record<keyof BlockAttrs, unknown>,
): asserts attrs is BlockAttrs {
  const values: Record<string, unknown> = attrs;
  const refused = Object.entries(ATTR_CHECKS).find(
    ([key, check]) => !check(values[key]),
  );
  if (refused !== undefined)
    throw new TypeError(
      `block attribute ${refused[0]} cannot hold ${JSON.stringify(values[refused[0]])}`,
    );
}

/** Each name once: known ones in declared order, then unknown ones by name. */
function markNames(names: readonly string[]): readonly string[] {
  const given = new Set(names);
  return Object.freeze([
    ...MARK_NAMES.filter((name) => given.has(name)),
    ...[...given].filter((name) => !isMarkName(name)).toSorted(),
  ]);
}

function textRun(text: string, marks: readonly string[]): TextRun {
  return Object.freeze({ text, marks: markNames(marks) });
}

function runsOf(block: Node | BlockJSON): readonly TextRun[] {
  const runs: TextRun[] = [];
  if (block instanceof Node)
    block.forEach((child) =>
      runs.push(
        textRun(
          child.textContent,
          child.marks.map((mark) => mark.type.name),
        ),
      ),
    );
  else
    for (const run of block.content ?? [])
      runs.push(
        textRun(
          run.text,
          (run.marks ?? []).map((mark) => mark.type),
        ),
      );
  return Object.freeze(runs);
}

/** One block as plain frozen data. Throws TypeError when an attribute holds a value validateDoc would refuse. */
export function blockView(block: Node | BlockJSON): BlockView {
  const attrs = fillBlockAttrs(block.attrs);
  assertBlockAttrs(attrs);
  return Object.freeze({ attrs: Object.freeze(attrs), runs: runsOf(block) });
}

/** Every block of every section, in order. Children that are not sections or blocks are passed over. */
export function blocksOf(doc: Node | DocJSON): FlatBlock[] {
  const flat: FlatBlock[] = [];
  const add = (block: Node | BlockJSON, section: number): void => {
    flat.push(
      Object.freeze({ ...blockView(block), section, index: flat.length }),
    );
  };
  if (doc instanceof Node)
    doc.forEach((section, _, i) => {
      if (section.type.name !== "section") return;
      section.forEach((block) => {
        if (block.type.name === "block") add(block, i);
      });
    });
  else
    (doc.content ?? []).forEach((section, i) => {
      if (section.type !== "section") return;
      for (const block of section.content ?? [])
        if (block.type === "block") add(block, i);
    });
  return flat;
}

/** The text of every run, joined. */
export function blockText(view: BlockView): string {
  return view.runs.map((run) => run.text).join("");
}
