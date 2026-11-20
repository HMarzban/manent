// Scripts, the edits that turn one into another, and generators shared by the comparison and restore tests.
import fc from "fast-check";
import { canonicalBlock, canonicalDoc } from "@manent/schema";
import type { BlockJSON, DocJSON, MarkJSON } from "@manent/schema";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { A, B, C, D, E, N, doc } from "./arbitraries.ts";

export { A, B, C, D, E, N, doc };
export const H1 = "h1".repeat(8);
export const H2 = "h2".repeat(8);
export const H3 = "h3".repeat(8);
export const M = "m".repeat(16);
export const T = "t".repeat(16);
export const X = "x".repeat(16);

/** A canonical block holding unmarked text: an action unless `attrs` says otherwise. */
export function b(
  id: string,
  text: string,
  attrs: Record<string, unknown> = {},
): BlockJSON {
  return canonicalBlock({
    type: "block",
    attrs: { id, type: "action", ...attrs },
    content: [{ type: "text", text }],
  });
}

/** A canonical action block of these runs. */
export function marked(
  id: string,
  runs: readonly { text: string; marks: MarkJSON[] }[],
): BlockJSON {
  return canonicalBlock({
    type: "block",
    attrs: { id, type: "action" },
    content: runs.map((run) => ({ type: "text", ...run })),
  });
}

/** A scene heading and the blocks of its scene. */
export function scene(headingId: string, ...blocks: BlockJSON[]): BlockJSON[] {
  return [
    b(headingId, "INT. HALL - DAY", { type: "scene_heading" }),
    ...blocks,
  ];
}

/** The canonical blocks of every section, in order. */
export function blockJSONs(json: DocJSON): BlockJSON[] {
  return (json.content ?? [])
    .flatMap((section) => section.content ?? [])
    .map(canonicalBlock);
}

function textOf(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

/** A screenplay of `blocks` blocks, and the same with `edits` of them retyped at even spacing. */
export function corpusPair(
  blocks: number,
  edits: number,
): { older: DocJSON; newer: DocJSON } {
  const older = canonicalDoc(
    corpusDoc(generateBlocks("screenplay", blocks, 7)),
  );
  const retyped = new Set(
    Array.from({ length: edits }, (_, k) =>
      Math.floor(((k + 0.5) * blocks) / edits),
    ),
  );
  const newer = blockJSONs(older).map((block, i) =>
    retyped.has(i)
      ? canonicalBlock({
          ...block,
          content: [{ type: "text", text: `${textOf(block)} again` }],
        })
      : block,
  );
  return { older, newer: doc(...newer) };
}

interface Token {
  character: string;
  marks: MarkJSON[];
}

interface Draft {
  attrs: Record<string, unknown>;
  tokens: Token[];
}

export type HistoryEdit =
  | { kind: "type"; block: number; at: number; text: string }
  | { kind: "delete_text"; block: number; at: number; length: number }
  | { kind: "bold"; block: number; at: number; length: number }
  | { kind: "element"; block: number; element: string }
  | { kind: "insert"; at: number; element: string; text: string }
  | { kind: "delete"; block: number }
  | { kind: "move"; block: number; to: number }
  | { kind: "split"; block: number; at: number }
  | { kind: "join"; block: number };

const ELEMENTS = [
  "scene_heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
];
const CHARACTERS = ["a", "b", " ", ".", "🎬", "م", "ر"];
const BOLD: MarkJSON[] = [{ type: "bold" }];
const MARKS: MarkJSON[][] = [
  [],
  BOLD,
  [{ type: "italic" }],
  [{ type: "link", attrs: { href: "https://example.com/a" } }],
];
// A heading may carry a number and be omitted: what a restore must leave alone.
const HEADING_ATTRS: Record<string, unknown>[] = [
  {},
  { num: "4" },
  { num: "12A", omitted: true },
];

function draftOf(block: BlockJSON): Draft {
  return {
    attrs: { ...block.attrs },
    tokens: (block.content ?? []).flatMap((run) =>
      [...run.text].map((character) => ({
        character,
        marks: run.marks ?? [],
      })),
    ),
  };
}

function blockOf(draft: Draft): BlockJSON {
  return canonicalBlock({
    type: "block",
    attrs: draft.attrs,
    content: draft.tokens.map((token) => ({
      type: "text",
      text: token.character,
      marks: token.marks,
    })),
  });
}

function typed(text: string): Token[] {
  return [...text].map((character) => ({ character, marks: [] }));
}

/** `edit` applied to the blocks in place; `newId` names a block it creates. */
function applyEdit(
  drafts: Draft[],
  edit: HistoryEdit,
  newId: () => string,
): void {
  if (edit.kind === "insert") {
    drafts.splice(edit.at % (drafts.length + 1), 0, {
      attrs: { id: newId(), type: edit.element },
      tokens: typed(edit.text),
    });
    return;
  }
  if (drafts.length === 0) return;
  const index = edit.block % drafts.length;
  const draft = drafts[index]!;
  const at = "at" in edit ? edit.at % (draft.tokens.length + 1) : 0;
  switch (edit.kind) {
    case "type":
      draft.tokens.splice(at, 0, ...typed(edit.text));
      break;
    case "delete_text":
      draft.tokens.splice(at, edit.length);
      break;
    case "bold":
      for (const token of draft.tokens.slice(at, at + edit.length))
        token.marks = BOLD;
      break;
    case "element":
      draft.attrs.type = edit.element;
      break;
    case "delete":
      drafts.splice(index, 1);
      break;
    case "move":
      drafts.splice(index, 1);
      drafts.splice(edit.to % (drafts.length + 1), 0, draft);
      break;
    case "split": {
      const id = newId();
      drafts.splice(index + 1, 0, {
        attrs: {
          id,
          type: draft.attrs.type,
          from: `${String(draft.attrs.id)}:${id}`,
        },
        tokens: draft.tokens.splice(at),
      });
      break;
    }
    case "join": {
      const next = drafts[index + 1];
      if (next === undefined) break;
      draft.tokens.push(...next.tokens);
      drafts.splice(index + 1, 1);
      break;
    }
    default:
      edit satisfies never;
  }
}

/** The document `edits` make of `json`, in order; a block one creates is named y0000000000000001, y…2 and so on. */
export function applyEdits(
  json: DocJSON,
  edits: readonly HistoryEdit[],
): DocJSON {
  const drafts = blockJSONs(json).map(draftOf);
  let created = 0;
  const newId = () => `y${String(++created).padStart(15, "0")}`;
  for (const edit of edits) applyEdit(drafts, edit, newId);
  return doc(...drafts.map(blockOf));
}

const token: fc.Arbitrary<Token> = fc.record({
  character: fc.constantFrom(...CHARACTERS),
  marks: fc.constantFrom(...MARKS),
});

const element = fc.constantFrom(...ELEMENTS);

const arbBlock: fc.Arbitrary<Draft> = fc
  .record({
    element,
    heading: fc.constantFrom(...HEADING_ATTRS),
    tokens: fc.array(token, { maxLength: 16 }),
  })
  .map(({ element: type, heading, tokens }) => ({
    attrs: type === "scene_heading" ? { type, ...heading } : { type },
    tokens,
  }));

/** A script of 1 to 40 blocks with distinct ids, from small pools of elements, marks and characters. */
export const arbScript: fc.Arbitrary<DocJSON> = fc
  .array(arbBlock, { minLength: 1, maxLength: 40 })
  .map((drafts) =>
    doc(
      ...drafts.map((draft, i) =>
        blockOf({
          ...draft,
          attrs: { id: `s${String(i).padStart(15, "0")}`, ...draft.attrs },
        }),
      ),
    ),
  );

const index = fc.nat({ max: 40 });
const offset = fc.nat({ max: 20 });
const span = fc.integer({ min: 1, max: 6 });
const text = fc
  .array(fc.constantFrom(...CHARACTERS), { minLength: 1, maxLength: 4 })
  .map((characters) => characters.join(""));

const arbEdit: fc.Arbitrary<HistoryEdit> = fc.oneof(
  fc.record({ kind: fc.constant("type"), block: index, at: offset, text }),
  fc.record({
    kind: fc.constant("delete_text"),
    block: index,
    at: offset,
    length: span,
  }),
  fc.record({
    kind: fc.constant("bold"),
    block: index,
    at: offset,
    length: span,
  }),
  fc.record({ kind: fc.constant("element"), block: index, element }),
  fc.record({ kind: fc.constant("insert"), at: index, element, text }),
  fc.record({ kind: fc.constant("delete"), block: index }),
  fc.record({ kind: fc.constant("move"), block: index, to: index }),
  fc.record({ kind: fc.constant("split"), block: index, at: offset }),
  fc.record({ kind: fc.constant("join"), block: index }),
);

/** An older script and the newer one 0 to 12 edits make of it. */
export const arbHistoryPair: fc.Arbitrary<{
  older: DocJSON;
  newer: DocJSON;
  edits: HistoryEdit[];
}> = fc
  .record({
    older: arbScript,
    edits: fc.array(arbEdit, { maxLength: 12 }),
  })
  .map(({ older, edits }) => ({
    older,
    newer: applyEdits(older, edits),
    edits,
  }));
