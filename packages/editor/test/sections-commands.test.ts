import { expect, test } from "bun:test";
import { SECTION_TARGET_BLOCKS } from "@manent/schema";
import type { IdSource } from "@manent/schema";
import fc from "fast-check";
import type { Node } from "prosemirror-model";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import {
  deleteRangeKeepingSections,
  pasteSlice,
  sectionBackspace,
  sectionDelete,
  sectionEnter,
} from "../src/index.ts";
import { bid, counter, docOf, ids, run, stateAt, texts } from "./docs.ts";

const opts = () => ({ ids: counter("n") });

test("Enter at the end makes a new block after, with a new id", () => {
  const s = run(stateAt(docOf([["one", "two"]]), 0, 3), sectionEnter(opts()));
  expect([texts(s.doc), ids(s.doc), s.selection.$head.parent.attrs.id]).toEqual(
    [
      [["one", "", "two"]],
      [[bid(0), "n000000000000001", bid(1)]],
      "n000000000000001",
    ],
  );
});

test("Enter at the start leaves the block that holds the text untouched", () => {
  const before = stateAt(docOf([["one", "two"]]), 1, 0);
  const two = before.doc.child(0).child(1);
  const s = run(before, sectionEnter(opts()));
  expect(texts(s.doc)).toEqual([["one", "", "two"]]);
  expect([
    s.doc.child(0).child(2) === two,
    s.selection.$head.parent === two,
  ]).toEqual([true, true]);
});

test("Enter in the middle keeps the head's id and records the tail's origin", () => {
  const s = run(stateAt(docOf([["one two"]]), 0, 3), sectionEnter(opts()));
  expect([
    texts(s.doc),
    ids(s.doc),
    s.doc.child(0).child(1).attrs.from,
  ]).toEqual([
    [["one", " two"]],
    [[bid(0), "n000000000000001"]],
    `${bid(0)}:n00000`,
  ]);
});

test("a full section is never grown at its end", () => {
  const full = docOf([
    Array.from({ length: SECTION_TARGET_BLOCKS }, (_, i) => `line ${i}`),
  ]);
  const atEnd = run(
    stateAt(full, SECTION_TARGET_BLOCKS - 1, 7),
    sectionEnter(opts()),
  );
  const inside = run(stateAt(atEnd.doc, 0, 6), sectionEnter(opts()));
  expect([
    ids(atEnd.doc).map((x) => x.length),
    ids(inside.doc).map((x) => x.length),
  ]).toEqual([
    [SECTION_TARGET_BLOCKS, 1],
    [SECTION_TARGET_BLOCKS + 1, 1],
  ]);
});

test("Backspace at the start of a section joins two paragraphs in one press, and an emptied section goes", () => {
  const s = run(
    stateAt(docOf([["one"], ["two", "three"]]), 1, 0),
    sectionBackspace(),
  );
  expect([texts(s.doc), ids(s.doc), s.selection.$head.parentOffset]).toEqual([
    [["onetwo"], ["three"]],
    [[bid(0)], [bid(2)]],
    3,
  ]);
  expect(
    texts(
      run(stateAt(docOf([["one"], ["two"]]), 1, 0), sectionBackspace()).doc,
    ),
  ).toEqual([["onetwo"]]);
  expect(
    texts(run(stateAt(docOf([["one"], ["two"]]), 0, 3), sectionDelete()).doc),
  ).toEqual([["onetwo"]]);
});

test("Backspace at the very start of the script is handled and changes nothing", () => {
  const dispatched: Transaction[] = [];
  expect([
    sectionBackspace()(stateAt(docOf([["one"]]), 0, 0), (tr) =>
      dispatched.push(tr),
    ),
    dispatched,
  ]).toEqual([true, []]);
});

test("deleting a selection across sections never moves a block", () => {
  const s = stateAt(
    docOf([
      ["a1", "a2"],
      ["b1", "b2"],
      ["c1", "c2"],
    ]),
    1,
    1,
    4,
    1,
  );
  const out = s.apply(
    deleteRangeKeepingSections(s.tr, s.selection.from, s.selection.to),
  );
  expect([texts(out.doc), ids(out.doc)]).toEqual([
    [["a1", "a1"], ["c2"]],
    [[bid(0), bid(1)], [bid(5)]],
  ]);
  const all = stateAt(docOf([["a"], ["b"]]), 0, 0, 1, 1);
  expect([
    texts(
      all.apply(deleteRangeKeepingSections(all.tr, 0, all.doc.content.size))
        .doc,
    ),
    ids(
      all.apply(deleteRangeKeepingSections(all.tr, 0, all.doc.content.size))
        .doc,
    ),
  ]).toEqual([[[""]], [[bid(0)]]]);
});

// A place in a document, each part wrapped to fit: a section (-1 = the one with the most blocks), a block in it
// (-1 = its last) and an offset (-1 = the block's end, -2 = its middle).
interface Place {
  readonly section: number;
  readonly block: number;
  readonly offset: number;
}
type Op =
  | { readonly key: "Enter" | "Backspace" | "Delete"; readonly at: Place }
  | { readonly key: "range"; readonly at: Place; readonly to: Place }
  | { readonly key: "paste"; readonly at: Place; readonly blocks: number };

const arbDoc = fc
  .array(
    fc.array(fc.string({ maxLength: 12 }), { minLength: 1, maxLength: 8 }),
    { minLength: 1, maxLength: 4 },
  )
  .map(docOf);
const arbPlace: fc.Arbitrary<Place> = fc.record({
  section: fc.oneof(fc.constant(-1), fc.nat()),
  block: fc.oneof(fc.constant(-1), fc.nat({ max: 120 })),
  offset: fc.oneof(
    fc.constant(0),
    fc.constant(-1),
    fc.constant(-2),
    fc.nat({ max: 12 }),
  ),
});
const arbOp: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    key: fc.constantFrom(
      "Enter" as const,
      "Backspace" as const,
      "Delete" as const,
    ),
    at: arbPlace,
  }),
  fc.record({ key: fc.constant("range" as const), at: arbPlace, to: arbPlace }),
  fc.record({
    key: fc.constant("paste" as const),
    at: arbPlace,
    blocks: fc.integer({ min: 1, max: 120 }),
  }),
);

/** The block index in document order and the offset a place names. */
function resolvePlace(doc: Node, place: Place): [number, number] {
  const sizes = Array.from(
    { length: doc.childCount },
    (_, i) => doc.child(i).childCount,
  );
  const section =
    place.section < 0
      ? sizes.indexOf(Math.max(...sizes))
      : place.section % doc.childCount;
  let block = 0;
  for (let i = 0; i < section; i++) block += doc.child(i).childCount;
  const blocks = doc.child(section).childCount;
  const inSection = place.block < 0 ? blocks - 1 : place.block % blocks;
  const length = doc.child(section).child(inSection).content.size;
  if (place.offset === -1) return [block + inSection, length];
  if (place.offset === -2) return [block + inSection, Math.floor(length / 2)];
  return [block + inSection, place.offset % (length + 1)];
}

/** The state after the command, or the state unchanged when the command leaves the key to ProseMirror. */
function press(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

function applyOp(s: EditorState, op: Op, fresh: IdSource): EditorState {
  const at = stateAt(s.doc, ...resolvePlace(s.doc, op.at));
  switch (op.key) {
    case "Enter":
      return press(at, sectionEnter({ ids: fresh }));
    case "Backspace":
      return press(at, sectionBackspace());
    case "Delete":
      return press(at, sectionDelete());
    case "range": {
      const range = stateAt(
        s.doc,
        ...resolvePlace(s.doc, op.at),
        ...resolvePlace(s.doc, op.to),
      );
      return range.apply(
        deleteRangeKeepingSections(
          range.tr,
          range.selection.from,
          range.selection.to,
        ),
      );
    }
    case "paste": {
      const pasted = docOf([
        Array.from({ length: op.blocks }, (_, i) => `p${i}`),
      ]);
      return at.apply(
        pasteSlice(at, pasted.slice(0, pasted.content.size), fresh),
      );
    }
  }
}

function sectionOf(doc: Node): Map<string, number> {
  const sections = new Map<string, number>();
  ids(doc).forEach((blocks, section) => {
    for (const id of blocks) sections.set(id, section);
  });
  return sections;
}

test("the section rule holds for any sequence of edits", () => {
  fc.assert(
    fc.property(arbDoc, fc.array(arbOp, { maxLength: 40 }), (doc, ops) => {
      const fresh = counter("n");
      let s = stateAt(doc, 0, 0);
      for (const op of ops) {
        const before = sectionOf(s.doc);
        s = applyOp(s, op, fresh);
        const after = sectionOf(s.doc);
        const kept = [...before.keys()].filter((id) => after.has(id));
        expect(
          kept.filter((a) =>
            kept.some(
              (b) =>
                (after.get(a) === after.get(b)) !==
                (before.get(a) === before.get(b)),
            ),
          ),
        ).toEqual([]);
        s.doc.check();
        expect(new Set(ids(s.doc).flat()).size).toBe(ids(s.doc).flat().length);
      }
    }),
    {
      numRuns: 200,
      // One literal case for each branch the generator must reach: a join across sections, a split in the last
      // block of a full section, a paste at a section's end.
      examples: [
        [
          docOf([["one"], ["two"]]),
          [{ key: "Backspace", at: { section: 1, block: 0, offset: 0 } }],
        ],
        [
          docOf([["one"]]),
          [
            {
              key: "paste",
              at: { section: 0, block: 0, offset: 0 },
              blocks: SECTION_TARGET_BLOCKS - 1,
            },
            { key: "Enter", at: { section: 0, block: -1, offset: -2 } },
          ],
        ],
        [
          docOf([["one", "two"]]),
          [
            {
              key: "paste",
              at: { section: 0, block: -1, offset: -1 },
              blocks: 3,
            },
          ],
        ],
      ],
    },
  );
});
