import { expect, test } from "bun:test";
import {
  formatFrom,
  normalizeDoc,
  parseDoc,
  rejects,
  sectionize,
  validateDoc,
} from "@manent/schema";
import type { BlockJSON, DocJSON, IdSource, MarkJSON } from "@manent/schema";
import fc from "fast-check";
import {
  ORIGIN_REMOTE,
  loadDoc,
  scriptBody,
  scriptDocFromJSON,
} from "../src/index.ts";
import type { CrdtDoc, Update } from "../src/index.ts";
import {
  ID_A,
  ID_B,
  block,
  bodyBlockIds,
  capture,
  idOf,
  textOf,
  twoReplicasOf,
} from "./helpers.ts";

const MAX_OPS = 30;
const OP_KINDS = [
  "insert",
  "delete",
  "retype",
  "dual",
  "type_text",
  "delete_text",
  "mark",
  "split",
] as const;
type OpKind = (typeof OP_KINDS)[number];
const TEXTS = ["", "Rain", "a🎬b", "مرحبا", "x"];
const ELEMENTS = ["action", "dialogue", "character", "scene_heading"];

interface Op {
  replica: number;
  kind: OpKind;
  /** Picks the block, modulo the replica's current block count. */
  target: number;
  atStart: boolean;
  count: number;
  at: number;
  length: number;
  text: string;
  element: string;
  dual: "left" | null;
  mark: MarkJSON | null;
}

interface Scenario {
  base: DocJSON;
  ops: Op[];
  /** Per replica and update: two sort keys and whether it arrives twice. */
  deliveries: [number, number, boolean][][];
}

/** A suggestion in a random spelling: `at` present or left out, keys in either order. */
const arbSuggestion: fc.Arbitrary<MarkJSON> = fc
  .record({
    id: fc.constantFrom("s1", "s2"),
    authorUserId: fc.constantFrom("dana", "omar"),
    at: fc.constantFrom(null, 0, 7),
    reversed: fc.boolean(),
  })
  .map(({ id, authorUserId, at, reversed }) => {
    const entries: [string, unknown][] = [
      ["id", id],
      ["authorUserId", authorUserId],
    ];
    if (at !== null) entries.push(["at", at]);
    return {
      type: "suggest_insert",
      attrs: Object.fromEntries(reversed ? entries.toReversed() : entries),
    };
  });

const arbMark: fc.Arbitrary<MarkJSON> = fc.oneof(
  fc.constantFrom<MarkJSON>(
    { type: "bold" },
    { type: "italic" },
    { type: "link", attrs: { href: "https://example.com" } },
  ),
  arbSuggestion,
);

const arbBase: fc.Arbitrary<DocJSON> = fc
  .array(
    fc.array(
      fc.record({
        element: fc.constantFrom(...ELEMENTS),
        text: fc.constantFrom(...TEXTS),
        newer: fc.boolean(),
      }),
      {
        minLength: 1,
        maxLength: 5,
      },
    ),
    { minLength: 1, maxLength: 3 },
  )
  .map((sections) => {
    let n = 0;
    return {
      type: "doc",
      content: sections.map((blocks) => ({
        type: "section",
        content: blocks.map(({ element, text, newer }): BlockJSON => ({
          type: "block",
          attrs: newer
            ? { id: idOf(n++), type: element, glow: 3 }
            : { id: idOf(n++), type: element },
          content:
            text === ""
              ? []
              : [
                  {
                    type: "text",
                    text,
                    marks: newer ? [{ type: "blink", attrs: { rate: 2 } }] : [],
                  },
                ],
        })),
      })),
    };
  });

const arbOp: fc.Arbitrary<Op> = fc.record({
  replica: fc.integer({ min: 0, max: 2 }),
  kind: fc.constantFrom(...OP_KINDS),
  target: fc.nat(),
  atStart: fc.boolean(),
  count: fc.integer({ min: 1, max: 3 }),
  at: fc.nat({ max: 8 }),
  length: fc.integer({ min: 1, max: 4 }),
  text: fc.constantFrom(...TEXTS.filter((text) => text !== "")),
  element: fc.constantFrom(...ELEMENTS),
  dual: fc.constantFrom("left" as const, null),
  mark: fc.option(arbMark, { nil: null }),
});

const arbScenario: fc.Arbitrary<Scenario> = fc.record({
  base: arbBase,
  ops: fc.array(arbOp, { minLength: 1, maxLength: MAX_OPS }),
  deliveries: fc.array(
    fc.array(fc.tuple(fc.nat(), fc.nat(), fc.boolean()), {
      minLength: MAX_OPS,
      maxLength: MAX_OPS,
    }),
    { minLength: 3, maxLength: 3 },
  ),
});

/** An ID no base block and no other op uses. */
function newId(op: number, j: number): string {
  return `n${String(op * 10 + j).padStart(15, "0")}`;
}

/** One op as one write on its replica; an op that finds no block inserts one at the start. */
function apply(doc: CrdtDoc, op: Op, index: number): void {
  const ids = bodyBlockIds(doc);
  const id = ids.length === 0 ? null : ids[op.target % ids.length]!;
  const { kind } = op;
  if (kind === "insert" || id === null) {
    const blocks = Array.from({ length: op.count }, (_, j) =>
      block(newId(index, j), op.text),
    );
    scriptBody(doc).write((w) =>
      w.insertBlocks(op.atStart ? null : id, blocks),
    );
    return;
  }
  const text = textOf(doc, id);
  scriptBody(doc).write((w) => {
    switch (kind) {
      case "delete":
        w.deleteBlock(id);
        return;
      case "retype":
        w.setBlockAttrs(id, { type: op.element });
        return;
      case "dual":
        w.setBlockAttrs(id, { dual: op.dual });
        return;
      case "type_text":
        w.insertText(id, op.at, op.text, op.mark === null ? [] : [op.mark]);
        return;
      case "delete_text":
        w.deleteText(id, op.at, op.length);
        return;
      case "mark":
        w.addMark(id, op.at, op.length, op.mark ?? { type: "bold" });
        return;
      case "split": {
        // the new block holds exactly what the deletion took, whole characters only
        w.deleteText(id, op.at, text.length);
        const tail = text.slice(textOf(doc, id).length);
        w.insertBlocks(id, [
          {
            type: "block",
            attrs: {
              id: newId(index, 0),
              type: "action",
              from: formatFrom(id, `k${index}`),
            },
            content: tail === "" ? [] : [{ type: "text", text: tail }],
          },
        ]);
        return;
      }
      default:
        kind satisfies never;
    }
  });
}

/** Runs every op on its replica, before any replica hears from another. */
function runOpsCapturingUpdates(
  replicas: readonly CrdtDoc[],
  ops: readonly Op[],
): Update[] {
  const updates: Update[] = [];
  const stops = replicas.map((replica) =>
    replica.subscribe((update) => updates.push(update)),
  );
  ops.forEach((op, index) => apply(replicas[op.replica]!, op, index));
  for (const stop of stops) stop();
  return updates;
}

/** Rounds of tidying a delivery may set off before the replicas must be quiet. */
const MAX_FOLLOW_UP_ROUNDS = 10;

/**
 * Every update reaches every replica at least once, in a shuffled order, some
 * twice. After a remote change Yjs tidies formatting in a transaction of its
 * own, whose origin is not ORIGIN_REMOTE; like a sync client, this passes those
 * updates on to every replica until none is left.
 */
function deliver(
  replicas: readonly CrdtDoc[],
  updates: readonly Update[],
  deliveries: Scenario["deliveries"],
): void {
  const followUps: Update[] = [];
  const stops = replicas.map((replica) =>
    replica.subscribe((update, origin) => {
      if (origin !== ORIGIN_REMOTE) followUps.push(update);
    }),
  );
  replicas.forEach((replica, r) => {
    const arrivals = updates.flatMap((update, i): [number, Update][] => {
      const [first, second, twice] = deliveries[r]![i]!;
      return twice
        ? [
            [first, update],
            [second, update],
          ]
        : [[first, update]];
    });
    for (const [, update] of arrivals.toSorted(([a], [b]) => a - b))
      replica.applyUpdate(update);
  });
  for (let round = 0; followUps.length > 0; round++) {
    if (round === MAX_FOLLOW_UP_ROUNDS)
      throw new RangeError(`tidying still writes after ${round} rounds`);
    const batch = followUps.splice(0);
    for (const replica of replicas)
      for (const update of batch) replica.applyUpdate(update);
  }
  for (const stop of stops) stop();
}

/** Distinct IDs, from one counter per call. */
function counterIds(): IdSource {
  let next = 0;
  return () => `r${String(next++).padStart(15, "0")}`;
}

function converges({ base, ops, deliveries }: Scenario): void {
  const replicas = [1, 2, 3].map((clientId) =>
    loadDoc(scriptDocFromJSON(base, { clientId: 9 }).encodeState(), {
      clientId,
    }),
  );
  const updates = runOpsCapturingUpdates(replicas, ops); // each op is one write on one replica, applied concurrently
  deliver(replicas, updates, deliveries); // every update reaches every replica at least once, shuffled, some twice
  const [a, b, c] = replicas.map((r) => scriptBody(r).materialize());
  expect(b).toEqual(a);
  expect(c).toEqual(a);
  for (const r of replicas) expect(r.hasPendingStructs()).toBe(false);
  expect(rejects(validateDoc(scriptBody(replicas[0]!).materializeRaw()))).toBe(
    false,
  );
  const ids = counterIds();
  const n = normalizeDoc(a!, ids);
  expect(() => parseDoc(n)).not.toThrow(); // a merge cannot produce an invalid document
  // what a newer build wrote is kept, and a duplicate ID is the authority's to repair
  expect(
    validateDoc(n).filter(
      (i) => i.code !== "duplicate_id" && i.severity !== "newer",
    ),
  ).toEqual([]);
  expect(normalizeDoc(n, ids)).toEqual(n); // repair reaches a fixed point
}

/** The ops in the order given, every update delivered once, in the order it was made. */
function inOrder(base: DocJSON, ops: Partial<Op>[]): Scenario {
  const defaults: Op = {
    replica: 0,
    kind: "type_text",
    target: 0,
    atStart: false,
    count: 1,
    at: 1,
    length: 2,
    text: "x",
    element: "character",
    dual: "left",
    mark: null,
  };
  return {
    base,
    ops: ops.map((op) => ({ ...defaults, ...op })),
    deliveries: [0, 1, 2].map(() =>
      Array.from({ length: MAX_OPS }, (_, i): [number, number, boolean] => [
        i,
        i,
        false,
      ]),
    ),
  };
}

test("replicas converge under reordering, duplication and delay, and a merge is never invalid", () => {
  fc.assert(fc.property(arbScenario, converges), { numRuns: 500 });
});

test("the races the property is built to reach converge as well", () => {
  const two = sectionize(
    [
      block(idOf(0), "Rain on the window"),
      block(idOf(1), ""),
      block(idOf(2), "Cold"),
    ],
    2,
  );
  const races: Partial<Op>[][] = [
    [
      { replica: 0, kind: "retype" },
      { replica: 1, kind: "type_text" },
    ], // an element change against typing in the same block
    [
      { replica: 0, kind: "delete" },
      { replica: 1, kind: "type_text" },
    ], // deleting a block someone is typing in
    [
      { replica: 0, kind: "delete", target: 0 },
      { replica: 0, kind: "delete", target: 0 },
      { replica: 1, kind: "delete", target: 0 },
      { replica: 1, kind: "delete", target: 0 },
    ], // two replicas deleting every block of one section
    [
      { replica: 0, kind: "type_text", target: 1, text: "Hi" },
      { replica: 1, kind: "type_text", target: 1, text: "Yo" },
    ], // two replicas typing into the same empty block
    [
      { replica: 0, kind: "split", at: 4 },
      { replica: 1, kind: "split", at: 8 },
    ], // two replicas splitting the same block
  ];
  for (const ops of races) converges(inOrder(two, ops));
});

test("a split inside a surrogate pair moves the whole character to the new block", () => {
  converges(
    inOrder(sectionize([block(idOf(0), "a🎬b")]), [
      { kind: "split", at: 2 },
      { kind: "insert", text: "Rain" },
    ]),
  );
});

test("formatting Yjs tidies after a remote change reaches every replica", () => {
  const base = sectionize([
    {
      type: "block",
      attrs: { id: idOf(0), type: "action", glow: 3 },
      content: [
        {
          type: "text",
          text: "Rain",
          marks: [{ type: "blink", attrs: { rate: 2 } }],
        },
      ],
    },
  ]);
  converges(
    inOrder(base, [
      { replica: 0, kind: "split", at: 0 },
      { replica: 2, kind: "type_text", at: 1, text: "Rain" },
      { replica: 1, kind: "type_text", at: 1, text: "Rain" },
    ]),
  );
});

test("KNOWN LOSS: a block inserted into a section a peer emptied at the same moment is gone on every replica", () => {
  const [a, b] = twoReplicasOf(sectionize([block(ID_A, "only line")]));
  const ua = capture(a, (w) => w.deleteBlock(ID_A)); // empties the section, so deletes it
  const ub = capture(b, (w) =>
    w.insertBlocks(ID_A, [block(ID_B, "typed at the same moment")]),
  );
  a.applyUpdate(ub);
  b.applyUpdate(ua);
  expect(scriptBody(a).materialize()).toEqual(scriptBody(b).materialize()); // they agree …
  expect(bodyBlockIds(a)).not.toContain(ID_B); // … that the new line is gone
}); // Convergence is not conservation. This is the case Recovered text exists for; set-aside
// detection must turn this test's last line into "the text is in Recovered text".
