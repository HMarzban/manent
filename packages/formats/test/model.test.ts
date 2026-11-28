import { expect, test } from "bun:test";
import { isScriptNote } from "@manent/schema";
import type { BlockJSON, ScriptNote } from "@manent/schema";
import fc from "fast-check";
import {
  FORMAT_ERROR_CODES,
  FormatError,
  IMPORT_RECORD_VERSION,
  KEPT_KINDS,
  SOURCE_FORMATS,
  parseImportRecord,
} from "../src/index.ts";
import type { ImportRecord, ImportedScript } from "../src/index.ts";
import { counter, withSameIds } from "../src/testing/index.ts";

const RECORD: ImportRecord = {
  v: 1,
  from: "fdx",
  title: "The Lamp Room",
  fileName: "The Lamp Room.fdx",
  fileSha256:
    "9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab",
  importedAt: 1_763_000_000_000,
  importedByUserId: "usr_dana_reyes",
  counts: { pages: 112, scenes: 48, notes: 3 },
  overflowing: ["12"],
  coloursMapped: 2,
  kept: [
    {
      id: "k1",
      kind: "title_page",
      from: "fdx",
      of: null,
      name: "TitlePage",
      value: { name: "TitlePage", attributes: {}, children: [] },
    },
    {
      id: "k2",
      kind: "scene_number",
      from: "fdx",
      of: "blk_000000000003",
      name: "Number",
      value: "12A",
    },
  ],
  unread: [],
  production: null,
  lockKey: null,
};

const ANCHOR = {
  blockId: "blk_000000000001",
  start: 16,
  end: 20,
  quote: "Salt",
  prefix: "The lens turns. ",
  suffix: " on the glass, a",
};
const NOTE: ScriptNote = {
  v: 1,
  anchor: ANCHOR,
  text: "Keep the salt on the glass in every shot of the lens.",
  writerName: "Priya Nair",
  at: 1_763_000_000_000,
};

type Check = (value: unknown) => boolean;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isCount: Check = (value) => Number.isInteger(value) && Number(value) >= 0;
const orNull =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const isStrings: Check = (value) =>
  Array.isArray(value) && value.every(isString);
const isIn =
  (values: readonly unknown[]): Check =>
  (value) =>
    values.includes(value);
const isHex =
  (length: number): Check =>
  (value) =>
    isString(value) && new RegExp(`^[0-9a-f]{${length}}$`).test(value);

/** Whether every field `fields` names is present and of its type. */
function isWhole(
  value: unknown,
  fields: Readonly<Record<string, Check>>,
): boolean {
  return (
    isObject(value) &&
    Object.entries(fields).every(
      ([key, check]) => Object.hasOwn(value, key) && check(value[key]),
    )
  );
}

const KEPT_FIELDS: Readonly<Record<string, Check>> = {
  id: isString,
  kind: isIn(KEPT_KINDS),
  from: isIn(SOURCE_FORMATS),
  of: orNull(isString),
  name: isString,
  value: (value) =>
    isString(value) ||
    isWhole(value, {
      name: isString,
      attributes: isObject,
      children: Array.isArray,
    }),
};
const RECORD_FIELDS: Readonly<Record<keyof ImportRecord, Check>> = {
  v: (value) => value === 1,
  from: isIn(SOURCE_FORMATS),
  title: isString,
  fileName: isString,
  fileSha256: isHex(64),
  importedAt: isCount,
  importedByUserId: isString,
  counts: (value) =>
    isWhole(value, { pages: isCount, scenes: isCount, notes: isCount }),
  overflowing: isStrings,
  coloursMapped: isCount,
  kept: (value) =>
    Array.isArray(value) && value.every((item) => isWhole(item, KEPT_FIELDS)),
  unread: isStrings,
  production: orNull(isObject),
  lockKey: orNull(isHex(32)),
};
const ANCHOR_FIELDS: Readonly<Record<string, Check>> = {
  blockId: isString,
  start: isCount,
  end: isCount,
  quote: isString,
  prefix: isString,
  suffix: isString,
};
const NOTE_FIELDS: Readonly<Record<keyof ScriptNote, Check>> = {
  v: (value) => value === 1,
  anchor: (value) => value === null || isWhole(value, ANCHOR_FIELDS),
  text: isString,
  writerName: orNull(isString),
  at: (value) => value === null || Number.isInteger(value),
};

const REMOVED = Symbol("removed");
// every field is also tried with these: another type, null, or no field at all
const ANY_FIELD: readonly unknown[] = [null, 3, "x", [], {}, REMOVED];

/** `item` with one field changed, once for each value of `pools`. */
const changedInner = (
  item: Record<string, unknown>,
  pools: Readonly<Record<string, readonly unknown[]>>,
): unknown[] =>
  Object.entries(pools).flatMap(([key, values]) =>
    values.map((value) => replaced(item, key, value)),
  );

function replaced(
  base: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  if (value !== REMOVED) return { ...base, [key]: value };
  return Object.fromEntries(Object.entries(base).filter(([k]) => k !== key));
}

const [TITLE_PAGE, SCENE_NUMBER] = RECORD.kept.map((item) => ({ ...item }));
const KEPT_CHANGES = changedInner(SCENE_NUMBER!, {
  id: [7, REMOVED],
  kind: ["boneyard", "lyrics"],
  from: ["fountain", "docx"],
  of: [null, 3],
  name: ["Text", null],
  value: [
    { name: "Number", attributes: { Alignment: "Left" }, children: ["12A"] },
    { name: "Number", attributes: {} },
    { name: "Number", attributes: [], children: [] },
    7,
  ],
}).map((item) => [TITLE_PAGE, item]);

const RECORD_POOLS: Readonly<Record<keyof ImportRecord, readonly unknown[]>> = {
  v: [1, 2],
  from: ["fountain", "text", "docx"],
  title: ["The Long Night"],
  fileName: ["the-long-night.fountain"],
  fileSha256: [
    "0".repeat(64),
    "ABC",
    "9C56CC51B374C3BA189210D5B6D4BF57790D351C96C47C02190ECF1E430635AB",
    "f".repeat(63),
  ],
  importedAt: [0, 1.5, -1],
  importedByUserId: ["usr_sam_okafor"],
  counts: [
    { pages: 1, scenes: 1, notes: 0 },
    { pages: 1, scenes: 1 },
    { pages: "1", scenes: 1, notes: 0 },
  ],
  overflowing: [[], ["12", 40]],
  coloursMapped: [0, -1],
  kept: [[], ...KEPT_CHANGES],
  unread: [["ScriptNotes"], [1]],
  production: [
    { anchors: [], sceneNumbers: [], numbering: "suffix", sets: [] },
  ],
  lockKey: [
    "0123456789abcdef0123456789abcdef",
    "0123456789ABCDEF0123456789ABCDEF",
    "0123456789abcdef0123456789abcde",
  ],
};
const NOTE_POOLS: Readonly<Record<keyof ScriptNote, readonly unknown[]>> = {
  v: [1, 2],
  anchor: [
    null,
    ...changedInner(ANCHOR, {
      blockId: ["blk_000000000002", 3],
      start: [0, -1, 1.5],
      end: [4, "20"],
      quote: ["", null],
      prefix: ["", REMOVED],
      suffix: ["", 7],
    }),
  ],
  text: ["", "A second note."],
  writerName: [null, "Sam Okafor"],
  at: [null, 0, 1.5],
};

/** `base` with one field replaced by a value from its pool or `ANY_FIELD`. */
const near = (
  base: Record<string, unknown>,
  pools: Readonly<Record<string, readonly unknown[]>>,
): fc.Arbitrary<unknown> =>
  fc
    .constantFrom(...Object.keys(pools))
    .chain((key) =>
      fc
        .constantFrom(...(pools[key] ?? []), ...ANY_FIELD)
        .map((value) => replaced(base, key, value)),
    );
const nearRecord = near({ ...RECORD }, RECORD_POOLS);
const nearNote = near({ ...NOTE }, NOTE_POOLS);

test("the format lists are fixed", () => {
  expect([SOURCE_FORMATS, FORMAT_ERROR_CODES, KEPT_KINDS]).toEqual([
    ["fdx", "fountain", "fdr", "text", "pdf", "docx", "ink", "markdown"],
    ["not_this_format", "malformed", "unsupported", "too_large"],
    [
      "title_page",
      "document_part",
      "paragraph_part",
      "run_part",
      "element_type",
      "scene_number",
      "note_part",
      "boneyard",
      "fountain_markup",
      "unplaced_lock",
    ],
  ]);
  expect(IMPORT_RECORD_VERSION).toBe(1);
});

test("a format error carries its code and its cause", () => {
  const cause = new SyntaxError("x");
  const error = new FormatError(
    "malformed",
    "an fdx file must be well-formed xml",
    { cause },
  );
  expect([error.code, error.cause, error instanceof Error]).toEqual([
    "malformed",
    cause,
    true,
  ]);
});

test("an import record is recognised by its shape, and nothing else is", () => {
  expect([
    parseImportRecord(RECORD),
    parseImportRecord({ ...RECORD, v: 2 }),
    parseImportRecord({ ...RECORD, kept: null }),
    parseImportRecord({ ...RECORD, fileSha256: "ABC" }),
    parseImportRecord({ ...RECORD, title: 3 }),
    parseImportRecord("x"),
  ]).toEqual([RECORD, null, null, null, null, null]);
});

test("any value near an import record or a note is recognised or refused", () => {
  fc.assert(
    fc.property(nearRecord, nearNote, (record, note) => {
      expect<unknown[]>([
        parseImportRecord(record) ?? "refused",
        isScriptNote(note),
      ]).toEqual([
        isWhole(record, RECORD_FIELDS) ? record : "refused",
        isWhole(note, NOTE_FIELDS),
      ]);
    }),
    { numRuns: 200 },
  );
});

const action = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action" },
  content: [{ type: "text", text }],
});

/** One read of a two-block script titled `title`, whose ids come from `ids`. */
function readOnce(ids: () => string, title: string): ImportedScript {
  const [first, second, note] = [ids(), ids(), ids()];
  return {
    from: "fdx",
    title,
    paper: "letter",
    blocks: [
      action(first, "The lamp turns."),
      action(second, "Salt on the glass."),
    ],
    notes: [
      {
        id: note,
        note: { ...NOTE, anchor: { ...ANCHOR, blockId: second } },
      },
    ],
    production: {
      anchors: [{ label: "1", blockId: first, offset: 0 }],
      sceneNumbers: [{ blockId: first, num: "1" }],
      numbering: "suffix",
      sets: [
        {
          sourceName: "Blue Rev.",
          colour: "blue",
          mark: "*",
          fullDraft: false,
          blocks: [{ blockId: second, inserted: [[0, 4]], deletedAt: [] }],
        },
      ],
    },
    kept: [{ ...RECORD.kept[1]!, of: second }],
    coloursMapped: 0,
    unread: [],
  };
}

test("a re-read takes the first read's ids, and everything that names them follows", () => {
  const ids = counter();
  const first = readOnce(ids, "The Long Night");
  const again = readOnce(ids, "The Long Night, read again");
  expect([ids(), counter()()]).toEqual([
    "blk_000000000007",
    "blk_000000000001",
  ]);
  expect(withSameIds(again, first)).toEqual({
    ...first,
    title: "The Long Night, read again",
  });
});
