import { expect, test } from "bun:test";
import { schema } from "@manent/schema";
import fc from "fast-check";
import type { Node } from "prosemirror-model";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import type { Command, Transaction } from "prosemirror-state";
import {
  blockPos,
  deleteRangeKeepingSections,
  idRegistryKey,
  idRegistryPlugin,
  paginationKey,
  paginationPlugin,
  pasteSlice,
  sectionBackspace,
  sectionDelete,
  sectionEnter,
} from "../src/index.ts";
import { bid, counter, docOf, ids, sp } from "./docs.ts";

const isRemote = (tr: Transaction): boolean => tr.getMeta("remote") === true;

/** A state of `doc` with pagination, `between`, and the registry, whose new ids count from n000000000000001. */
function withRegistry(doc: Node, between: readonly Plugin[] = []): EditorState {
  return EditorState.create({
    doc,
    plugins: [
      paginationPlugin({
        profile: sp,
        defer: (work) => work(),
        offFontNote: "note",
      }),
      ...between,
      idRegistryPlugin({ ids: counter("n"), isRemote }),
    ],
  });
}

const blockNode = (id: string, text: string): Node =>
  schema.nodes.block.create({ id, type: "action" }, schema.text(text));

/** The position just inside the end of section `section`. */
const endOfSection = (s: EditorState, section: number): number =>
  paginationKey.getState(s)!.index.sectionPos[section]! +
  s.doc.child(section).nodeSize -
  1;

test("a duplicate id a local change made is renamed before it leaves", () => {
  const s = withRegistry(docOf([["one", "two"]]));
  const out = s.apply(
    s.tr.insert(endOfSection(s, 0), blockNode(bid(0), "copy")),
  );
  expect([ids(out.doc), idRegistryKey.getState(out)!.count(bid(0))]).toEqual([
    [[bid(0), bid(1), "n000000000000001"]],
    1,
  ]);
});

test("a remote change is never renamed here", () => {
  const s = withRegistry(docOf([["one", "two"]]));
  const out = s.apply(
    s.tr
      .insert(endOfSection(s, 0), blockNode(bid(0), "copy"))
      .setMeta("remote", true),
  );
  expect([ids(out.doc), idRegistryKey.getState(out)!.count(bid(0))]).toEqual([
    [[bid(0), bid(1), bid(0)]],
    2,
  ]);
});

test("a renaming is never an undo step", () => {
  const s = withRegistry(docOf([["one"]]));
  const { transactions } = s.applyTransaction(
    s.tr.insert(endOfSection(s, 0), blockNode(bid(0), "copy")),
  );
  expect(transactions.map((tr) => tr.getMeta("addToHistory") ?? true)).toEqual([
    true,
    false,
  ]);
});

/** Where an op acts: a block and an offset, each taken modulo what the document holds. */
interface Place {
  readonly block: number;
  readonly offset: number;
}

const OP_KINDS = [
  "Enter",
  "Backspace",
  "Delete",
  "range",
  "paste",
  "duplicate",
] as const;

type Op =
  | { readonly kind: "Enter" | "Backspace" | "Delete"; readonly at: Place }
  | { readonly kind: "range"; readonly at: Place; readonly to: Place }
  | { readonly kind: "paste"; readonly at: Place; readonly blocks: number }
  | {
      readonly kind: "duplicate";
      readonly at: Place;
      readonly of: number;
      readonly remote: boolean;
    };

const arbDoc = fc
  .array(
    fc.array(fc.string({ maxLength: 12 }), { minLength: 1, maxLength: 8 }),
    { minLength: 1, maxLength: 4 },
  )
  .map(docOf);
const arbPlace: fc.Arbitrary<Place> = fc.record({
  block: fc.nat({ max: 120 }),
  offset: fc.nat({ max: 12 }),
});
const arbOp: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constantFrom(
      "Enter" as const,
      "Backspace" as const,
      "Delete" as const,
    ),
    at: arbPlace,
  }),
  fc.record({
    kind: fc.constant("range" as const),
    at: arbPlace,
    to: arbPlace,
  }),
  fc.record({
    kind: fc.constant("paste" as const),
    at: arbPlace,
    blocks: fc.integer({ min: 1, max: 120 }),
  }),
  fc.record({
    kind: fc.constant("duplicate" as const),
    at: arbPlace,
    of: fc.nat({ max: 120 }),
    remote: fc.boolean(),
  }),
);

/** The block and the position a place names. */
function resolve(s: EditorState, place: Place): { block: number; pos: number } {
  const { index } = paginationKey.getState(s)!;
  const block = place.block % index.blocks.length;
  const length = index.blocks[block]!.text.length;
  return {
    block,
    pos: blockPos(index, block) + 1 + (place.offset % (length + 1)),
  };
}

const selected = (s: EditorState, from: number, to = from): EditorState =>
  s.apply(s.tr.setSelection(TextSelection.create(s.doc, from, to)));

/** The state after the command, or the state unchanged when the command leaves the key to ProseMirror. */
function press(s: EditorState, command: Command): EditorState {
  let next = s;
  command(s, (tr) => {
    next = s.apply(tr);
  });
  return next;
}

function applyOp(s: EditorState, op: Op): EditorState {
  const { block, pos } = resolve(s, op.at);
  switch (op.kind) {
    case "Enter":
      return press(selected(s, pos), sectionEnter({ ids: counter("e") }));
    case "Backspace":
      return press(selected(s, pos), sectionBackspace());
    case "Delete":
      return press(selected(s, pos), sectionDelete());
    case "range": {
      const [from, to] = [pos, resolve(s, op.to).pos].toSorted((a, b) => a - b);
      return s.apply(deleteRangeKeepingSections(s.tr, from!, to!));
    }
    case "paste": {
      const pasted = docOf([
        Array.from({ length: op.blocks }, (_, i) => `p${i}`),
      ]);
      const at = selected(s, pos);
      return at.apply(
        pasteSlice(at, pasted.slice(0, pasted.content.size), counter("p")),
      );
    }
    case "duplicate": {
      const { index } = paginationKey.getState(s)!;
      const id = index.blocks[op.of % index.blocks.length]!.id!;
      const tr = s.tr.insert(blockPos(index, block + 1), blockNode(id, "copy"));
      return s.apply(tr.setMeta("remote", op.remote));
    }
  }
}

test("the registry follows any edit sequence and costs only the change", () => {
  const drawn = new Set<string>();
  fc.assert(
    fc.property(arbDoc, fc.array(arbOp, { maxLength: 30 }), (doc, ops) => {
      let s = withRegistry(doc);
      for (const op of ops) {
        drawn.add(op.kind);
        s = applyOp(s, op);
      }
      const truth = new Map<string, number>();
      for (const id of ids(s.doc).flat())
        truth.set(id, (truth.get(id) ?? 0) + 1);
      for (const [id, n] of truth)
        expect(idRegistryKey.getState(s)!.count(id)).toBe(n);
      expect(idRegistryKey.getState(s)!.count("n999999999999999")).toBe(0);
    }),
    { numRuns: 200 },
  );
  expect([...drawn].toSorted()).toEqual([...OP_KINDS].toSorted());
});

test("a state applied twice still counts its own blocks", () => {
  const s = withRegistry(docOf([["one", "two"]]));
  const doubled = s.apply(
    s.tr
      .insert(endOfSection(s, 0), blockNode(bid(0), "copy"))
      .setMeta("remote", true),
  );
  const typed = s.apply(s.tr.insertText("x", 2));
  expect(
    [s, doubled, typed].map((state) =>
      idRegistryKey.getState(state)!.count(bid(0)),
    ),
  ).toEqual([1, 2, 1]);
});

test("a duplicate is renamed where a later transaction of the same dispatch moved it", () => {
  // after a transaction marked "shift", one more puts a new block first
  const shifter = new Plugin({
    appendTransaction: (trs, _old, state) =>
      trs.some((tr) => tr.getMeta("shift") === true)
        ? state.tr.insert(1, blockNode("s000000000000001", "first"))
        : null,
  });
  const s = withRegistry(docOf([["one", "two"]]), [shifter]);
  const out = s.apply(
    s.tr
      .insert(endOfSection(s, 0), blockNode(bid(0), "copy"))
      .setMeta("shift", true),
  );
  expect(ids(out.doc)).toEqual([
    ["s000000000000001", bid(0), bid(1), "n000000000000001"],
  ]);
});
