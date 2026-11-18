// Blocks, documents and generators shared by the merge tests.
import fc from "fast-check";
import { canonicalBlock, canonicalDoc } from "@manent/schema";
import type { BlockJSON, DocJSON, MarkJSON } from "@manent/schema";

export const A = "a".repeat(16);
export const B = "b".repeat(16);
export const C = "c".repeat(16);
export const D = "d".repeat(16);
export const E = "e".repeat(16);
export const F = "f".repeat(16);
export const N = "n".repeat(16);

interface Run {
  text: string;
  marks: MarkJSON[];
}

/** An action block with these runs, as given. */
export function blockWith(id: string, runs: readonly Run[]): BlockJSON {
  return {
    type: "block",
    attrs: { id, type: "action" },
    content: runs.map((run) => ({ type: "text", ...run })),
  };
}

/** A canonical action block holding unmarked text. */
export function b(id: string, text: string): BlockJSON {
  return canonicalBlock(blockWith(id, [{ text, marks: [] }]));
}

/** A canonical document of one section. */
export function doc(...blocks: BlockJSON[]): DocJSON {
  return canonicalDoc({
    type: "doc",
    content: [{ type: "section", content: blocks }],
  });
}

function textOf(block: BlockJSON): string {
  return (block.content ?? []).map((run) => run.text).join("");
}

function blocksIn(json: DocJSON): BlockJSON[] {
  return (json.content ?? []).flatMap((section) => section.content ?? []);
}

// What a base holds and what either side types never share a character, so
// the characters a side adds are exactly those its base never held.
const BASE_CHARACTERS = ["a", "b", " ", "🎬", "م"];
const TYPED_CHARACTERS = ["X", "Y", "é", "😀"];
const TYPED = new Set(TYPED_CHARACTERS);
const MARKS: MarkJSON[][] = [[], [{ type: "bold" }], [{ type: "italic" }]];
const ELEMENTS = ["character", "dialogue"];

/** The longest runs of `text` whose characters are all typed ones, in order. */
function typedRuns(
  text: string,
  typed: (character: string) => boolean,
): string[] {
  return [...text]
    .map((character) => (typed(character) ? character : "\n"))
    .join("")
    .split("\n")
    .filter((piece) => piece !== "");
}

/** The pieces of text that `side` added to `base`. */
export function insertedRuns(base: BlockJSON, side: BlockJSON): string[] {
  const held = new Set(textOf(base));
  return typedRuns(textOf(side), (character) => !held.has(character));
}

interface Token {
  character: string;
  marks: MarkJSON[];
}

interface Draft {
  element: string;
  tokens: Token[];
}

type Edit =
  | { kind: "insert"; at: number; text: string; marks: MarkJSON[] }
  | { kind: "delete"; at: number; length: number }
  | { kind: "mark"; at: number; length: number; marks: MarkJSON[] }
  | { kind: "element"; element: string };

const marks = fc.constantFrom(...MARKS);
const typedText = fc
  .array(fc.constantFrom(...TYPED_CHARACTERS), { minLength: 1, maxLength: 3 })
  .map((characters) => characters.join(""));
const position = fc.nat({ max: 40 });
const span = fc.integer({ min: 1, max: 4 });

const edit: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({
    kind: fc.constant("insert"),
    at: position,
    text: typedText,
    marks,
  }),
  fc.record({ kind: fc.constant("delete"), at: position, length: span }),
  fc.record({ kind: fc.constant("mark"), at: position, length: span, marks }),
  fc.record({
    kind: fc.constant("element"),
    element: fc.constantFrom(...ELEMENTS),
  }),
);

function applyEdit(draft: Draft, change: Edit): Draft {
  if (change.kind === "element") return { ...draft, element: change.element };
  const tokens = [...draft.tokens];
  const at = change.at % (tokens.length + 1);
  if (change.kind === "insert")
    tokens.splice(
      at,
      0,
      ...[...change.text].map((character) => ({
        character,
        marks: change.marks,
      })),
    );
  else if (change.kind === "delete") tokens.splice(at, change.length);
  else
    for (let i = at; i < Math.min(tokens.length, at + change.length); i++)
      tokens[i] = { character: tokens[i]!.character, marks: change.marks };
  return { ...draft, tokens };
}

function blockOf(id: string, draft: Draft): BlockJSON {
  return canonicalBlock({
    type: "block",
    attrs: { id, type: draft.element },
    content: draft.tokens.map((token) => ({
      type: "text",
      text: token.character,
      marks: token.marks,
    })),
  });
}

const baseTokens: fc.Arbitrary<Token[]> = fc.array(
  fc.record({ character: fc.constantFrom(...BASE_CHARACTERS), marks }),
  { maxLength: 24 },
);

/** A base block and two blocks each derived from it by its own list of edits. */
export const arbBlockEdits: fc.Arbitrary<{
  base: BlockJSON;
  mine: BlockJSON;
  theirs: BlockJSON;
}> = fc
  .record({
    tokens: baseTokens,
    mine: fc.array(edit, { maxLength: 3 }),
    theirs: fc.array(edit, { maxLength: 3 }),
  })
  .map(({ tokens, mine, theirs }) => {
    const base: Draft = { element: "action", tokens };
    return {
      base: blockOf(A, base),
      mine: blockOf(A, mine.reduce(applyEdit, base)),
      theirs: blockOf(A, theirs.reduce(applyEdit, base)),
    };
  });

type Change =
  | { kind: "keep" }
  | { kind: "delete" }
  | { kind: "retype"; at: number; length: number; text: string }
  | { kind: "element"; element: string };

interface Added {
  at: number;
  id: string;
  text: string;
}

interface Side {
  changes: Change[];
  added: Added[];
}

const BASE_IDS = [A, B, C, D, E, F];
// Both sides may add a block under one of these, with the same text or not.
const SHARED_IDS = ["s".repeat(16), "t".repeat(16)];

const change: fc.Arbitrary<Change> = fc.oneof(
  fc.constant({ kind: "keep" as const }),
  fc.constant({ kind: "delete" as const }),
  fc.record({
    kind: fc.constant("retype"),
    at: position,
    length: fc.nat({ max: 3 }),
    text: typedText,
  }),
  fc.record({
    kind: fc.constant("element"),
    element: fc.constantFrom(...ELEMENTS),
  }),
);

function sideOf(ownId: string): fc.Arbitrary<Side> {
  return fc.record({
    changes: fc.array(change, {
      minLength: BASE_IDS.length,
      maxLength: BASE_IDS.length,
    }),
    added: fc.array(
      fc.record({
        at: position,
        id: fc.constantFrom(ownId, ...SHARED_IDS),
        text: fc.constantFrom("XY", "é😀"),
      }),
      { maxLength: 2 },
    ),
  });
}

function changed(block: BlockJSON, planned: Change): BlockJSON | null {
  const id = block.attrs!.id!;
  const element = block.attrs!.type!;
  const tokens = [...textOf(block)].map((character) => ({
    character,
    marks: [],
  }));
  if (planned.kind === "keep") return block;
  if (planned.kind === "delete") return null;
  if (planned.kind === "element")
    return blockOf(id, { element: planned.element, tokens });
  const at = planned.at % (tokens.length + 1);
  tokens.splice(
    at,
    planned.length,
    ...[...planned.text].map((character) => ({ character, marks: [] })),
  );
  return blockOf(id, { element, tokens });
}

function derive(base: BlockJSON[], plan: Side): DocJSON {
  const blocks = base.flatMap(
    (block, i) => changed(block, plan.changes[i]!) ?? [],
  );
  for (const added of plan.added)
    if (!blocks.some((block) => block.attrs!.id === added.id))
      blocks.splice(added.at % (blocks.length + 1), 0, b(added.id, added.text));
  return doc(...blocks);
}

/** A base document of action blocks and two documents each derived from it by its own changes. */
export const arbThreeDocs: fc.Arbitrary<{
  base: DocJSON;
  mine: DocJSON;
  theirs: DocJSON;
}> = fc
  .record({
    texts: fc.array(
      fc.array(fc.constantFrom(...BASE_CHARACTERS), {
        minLength: 1,
        maxLength: 12,
      }),
      { minLength: BASE_IDS.length, maxLength: BASE_IDS.length },
    ),
    count: fc.integer({ min: 1, max: BASE_IDS.length }),
    mine: sideOf("m".repeat(16)),
    theirs: sideOf("o".repeat(16)),
  })
  .map(({ texts, count, mine, theirs }) => {
    const blocks = texts
      .slice(0, count)
      .map((characters, i) => b(BASE_IDS[i]!, characters.join("")));
    return {
      base: doc(...blocks),
      mine: derive(blocks, mine),
      theirs: derive(blocks, theirs),
    };
  });

const keyOf = (block: BlockJSON): string =>
  JSON.stringify(canonicalBlock(block));

/** The blocks of mine that base does not hold as they are. */
export function changedAgainst(base: DocJSON, mine: DocJSON): BlockJSON[] {
  const held = new Set(blocksIn(base).map(keyOf));
  return blocksIn(mine).filter((block) => !held.has(keyOf(block)));
}

/**
 * The result holds the block under its ID with every piece mine typed into it,
 * and with mine's element when mine changed it (a base block is always action).
 */
export function inResultAsMerged(result: DocJSON, block: BlockJSON): boolean {
  const found = blocksIn(result).find(
    (candidate) => candidate.attrs!.id === block.attrs!.id,
  );
  if (found === undefined) return false;
  const element = block.attrs!.type;
  if (element !== "action" && found.attrs!.type !== element) return false;
  const text = textOf(found);
  return typedRuns(textOf(block), (character) => TYPED.has(character)).every(
    (piece) => text.includes(piece),
  );
}
