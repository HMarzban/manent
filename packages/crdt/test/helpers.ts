// Documents and readers shared by the crdt package's tests.
import { BLOCK_TYPES, MARK_NAMES, randomBlockId } from "@manent/schema";
import type {
  BlockAttrs,
  BlockJSON,
  BlockType,
  DocJSON,
  MarkJSON,
  TextJSON,
} from "@manent/schema";
import { scriptBody } from "../src/index.ts";
import type { CrdtDoc } from "../src/index.ts";

interface Run {
  text: string;
  marks?: MarkJSON[];
}

/** The block of every one-block document below. */
export const ID = "i".repeat(16);

/** One section of one block; a string is one plain run. */
export function docWith(
  attrs: Partial<BlockAttrs> & Record<string, unknown>,
  content: string | readonly Run[],
): DocJSON {
  const textRuns: TextJSON[] =
    typeof content === "string"
      ? [{ type: "text", text: content }]
      : content.map((run) => ({ type: "text", ...run }));
  return {
    type: "doc",
    content: [
      {
        type: "section",
        content: [{ type: "block", attrs, content: textRuns }],
      },
    ],
  };
}

const MARK_ATTRS: Readonly<Record<string, Record<string, unknown>>> = {
  color: { value: "red" },
  highlight: { value: "red" },
  link: { href: "https://example.com" },
  suggest_insert: { id: "s1", authorUserId: "dana", at: 5 },
  suggest_delete: { id: "s1", authorUserId: "dana", at: 5 },
};

/** One run per mark name, each with full attributes. */
export const ALL_MARKS: readonly { text: string; marks: MarkJSON[] }[] =
  MARK_NAMES.map((name) => {
    const attrs = MARK_ATTRS[name];
    return {
      text: name,
      marks: [attrs ? { type: name, attrs } : { type: name }],
    };
  });

/** An action block. */
export function block(id: string, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type: "action" },
    content: text === "" ? [] : [{ type: "text", text }],
  };
}

/** Distinct block IDs, never equal to ID. */
export function idOf(i: number): string {
  return `b${String(i).padStart(15, "0")}`;
}

/** One block ID per element, distinct from those of idOf. */
export function idFor(type: BlockType): string {
  return `t${String(BLOCK_TYPES.indexOf(type)).padStart(15, "0")}`;
}

/** Blocks with fresh IDs. */
export function pasted(n: number): BlockJSON[] {
  return Array.from({ length: n }, (_, i) =>
    block(randomBlockId(), `pasted ${i}`),
  );
}

export const FIRST_ID = "s000000000000001";
export const SECOND_ID = "s000000000000002";
export const THIRD_ID = "s000000000000003";

/** Two sections of three blocks each. */
export const SAMPLE: DocJSON = {
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: FIRST_ID, type: "scene_heading", num: "1" },
          content: [{ type: "text", text: "EXT. SALT FLATS - DAWN" }],
        },
        {
          type: "block",
          attrs: { id: SECOND_ID, type: "action" },
          content: [
            { type: "text", text: "A kite drags a " },
            { type: "text", text: "red", marks: [{ type: "italic" }] },
            { type: "text", text: " ribbon across the crust." },
          ],
        },
        {
          type: "block",
          attrs: { id: THIRD_ID, type: "character" },
          content: [{ type: "text", text: "ODILE" }],
        },
      ],
    },
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: "s000000000000004", type: "dialogue" },
          content: [{ type: "text", text: "It wants to go home." }],
        },
        {
          type: "block",
          attrs: { id: "s000000000000005", type: "transition" },
          content: [{ type: "text", text: "CUT TO:" }],
        },
        { type: "block", attrs: { id: "s000000000000006", type: "action" } },
      ],
    },
  ],
};

function blocksOf(doc: CrdtDoc): BlockJSON[] {
  return (scriptBody(doc).materialize().content ?? []).flatMap(
    (section) => section.content ?? [],
  );
}

function blockOf(doc: CrdtDoc, id: string): BlockJSON {
  const found = blocksOf(doc).find((candidate) => candidate.attrs?.id === id);
  if (found === undefined) throw new RangeError(`no block ${id}`);
  return found;
}

/** Blocks per section, in order. */
export function sectionSizes(doc: CrdtDoc): number[] {
  return (scriptBody(doc).materialize().content ?? []).map(
    (section) => (section.content ?? []).length,
  );
}

/** Every block ID, in document order. */
export function bodyBlockIds(doc: CrdtDoc): string[] {
  return blocksOf(doc).map((found) => String(found.attrs?.id));
}

/** The block's text. */
export function textOf(doc: CrdtDoc, id: string): string {
  return (blockOf(doc, id).content ?? []).map((run) => run.text).join("");
}

/** The block's runs: text and its mark names in canonical order. */
export function runs(doc: CrdtDoc, id: string): [string, string[]][] {
  return (blockOf(doc, id).content ?? []).map((run) => [
    run.text,
    (run.marks ?? []).map((mark) => mark.type),
  ]);
}
