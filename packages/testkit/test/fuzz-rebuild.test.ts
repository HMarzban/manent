import { expect, test } from "bun:test";
import {
  ORIGIN_REPLAY,
  applyBlockOps,
  scriptBody,
  scriptDocFromJSON,
} from "@manent/crdt";
import { applyBlockOpsToJSON } from "@manent/revisions";
import { canonicalBlock } from "@manent/schema";
import type { BlockJSON, BlockOp, DocJSON, MarkJSON } from "@manent/schema";
import fc from "fast-check";
import { createWorld } from "../src/index.ts";
import { applyOp, arbRun } from "./fuzz-ops.ts";
import type { Op } from "./fuzz-ops.ts";

const TEXTS = ["a", "bc", "🎬", "م "] as const;
const MARKS: readonly MarkJSON[][] = [
  [],
  [{ type: "bold" }],
  [{ type: "italic" }, { type: "underline" }],
];
const ELEMENTS = ["action", "dialogue", "character", "scene_heading"] as const;
/** A block id that neither the document nor any operation's block holds. */
const ABSENT = "z".repeat(16);

const heldId = (n: number): string => `d${String(n).padStart(15, "0")}`;
const freshId = (n: number): string => `f${String(n).padStart(15, "0")}`;

interface Body {
  element: string;
  runs: { text: string; marks: MarkJSON[] }[];
}

const arbBody: fc.Arbitrary<Body> = fc.record({
  element: fc.constantFrom(...ELEMENTS),
  runs: fc.array(
    fc.record({
      text: fc.constantFrom(...TEXTS),
      marks: fc.constantFrom(...MARKS),
    }),
    { maxLength: 3 },
  ),
});

function blockOf(id: string, body: Body): BlockJSON {
  return {
    type: "block",
    attrs: { id, type: body.element },
    content: body.runs.map((run) => ({ type: "text", ...run })),
  };
}

/** `at` picks among the document's ids, the inserted ones and ABSENT; an insert's 0 is the start. */
type Shape =
  | { op: "insert"; at: number; body: Body }
  | { op: "replace"; at: number; body: Body }
  | { op: "delete"; at: number };

const at = fc.nat({ max: 40 });
const arbShape: fc.Arbitrary<Shape> = fc.oneof(
  fc.record({ op: fc.constant("insert"), at, body: arbBody }),
  fc.record({ op: fc.constant("replace"), at, body: arbBody }),
  fc.record({ op: fc.constant("delete"), at }),
);

/** A document, and operations on its own ids, the ids they insert and one no block holds. */
const arbDocAndOps = fc
  .record({
    sections: fc.array(fc.array(arbBody, { maxLength: 4 }), { maxLength: 3 }),
    shapes: fc.array(arbShape, { maxLength: 12 }),
  })
  .map(({ sections, shapes }) => {
    let held = 0;
    const doc: DocJSON = {
      type: "doc",
      content: sections.map((bodies) => ({
        type: "section",
        content: bodies.map((body) => blockOf(heldId(++held), body)),
      })),
    };
    const inserts = shapes.filter((shape) => shape.op === "insert").length;
    const ids = [
      ...Array.from({ length: held }, (_, n) => heldId(n + 1)),
      ...Array.from({ length: inserts }, (_, n) => freshId(n + 1)),
      ABSENT,
    ];
    // each insert brings an id no block holds yet, as a merge's inserts do
    let made = 0;
    const ops = shapes.map((shape): BlockOp => {
      if (shape.op === "insert") {
        const anchor = shape.at % (ids.length + 1);
        const after = anchor === 0 ? null : ids[anchor - 1]!;
        return {
          op: "insert",
          after,
          block: blockOf(freshId(++made), shape.body),
        };
      }
      const id = ids[shape.at % ids.length]!;
      if (shape.op === "delete") return { op: "delete", id };
      return { op: "replace", block: blockOf(id, shape.body) };
    });
    return { doc, ops };
  });

/** Every block in order and in canonical form, whatever section holds it. */
const flatBlocks = (json: DocJSON): BlockJSON[] =>
  (json.content ?? [])
    .flatMap((section) => section.content ?? [])
    .map(canonicalBlock);

test("block operations give the same blocks on a document and on its JSON", () => {
  fc.assert(
    fc.property(arbDocAndOps, ({ doc, ops }) => {
      const live = scriptDocFromJSON(doc);
      applyBlockOps(live, ops, ORIGIN_REPLAY);
      const written = flatBlocks(scriptBody(live).materialize());
      live.destroy();
      expect(written).toEqual(flatBlocks(applyBlockOpsToJSON(doc, ops)));
    }),
    { numRuns: 1_000 },
  );
});

test("every character typed is in the script, in Recovered text or in a recovered version, across rebuilds", async () => {
  await fc.assert(
    fc.asyncProperty(arbRun, async (run) => {
      const world = await createWorld({
        seed: run.seed,
        users: run.users,
        devicesPerUser: run.devices,
        faults: run.faults,
        limits: { checkpointEvery: 1 },
      });
      for (const op of run.ops) applyOp(world, op);
      await world.settle();
      world.check();
    }),
    { numRuns: Number(process.env.MANENT_FUZZ_RUNS ?? 100) },
  );
}, 300_000);

/**
 * Found with seed 1740975719: a moved device whose first SUBSCRIBE timed out took that SUBSCRIBE's
 * step 2, and missed what was committed while the second was on its way.
 */
const SUBSCRIBED_AGAIN_WHILE_LOADING: Op[] = [
  { device: 0, kind: "rebuild" },
  { device: 0, kind: "quiet" },
  { device: 5, kind: "delete", block: 0 },
  { device: 0, kind: "deliver", frames: 6 },
  { device: 0, kind: "type", block: 0, at: 0 },
  { device: 0, kind: "element", block: 0, element: 0 },
  { device: 0, kind: "online" },
  { device: 0, kind: "insert", block: 0 },
  { device: 0, kind: "restore", block: 0, at: 0 },
  { device: 0, kind: "type", block: 0, at: 0 },
  { device: 0, kind: "type", block: 0, at: 0 },
  { device: 0, kind: "delete", block: 0 },
  { device: 3, kind: "restore", block: 0, at: 0 },
  { device: 0, kind: "restore", block: 0, at: 0 },
  { device: 0, kind: "insert", block: 0 },
  { device: 0, kind: "offline" },
  { device: 0, kind: "move", block: 0, length: 2, target: 0 },
  { device: 0, kind: "online" },
  { device: 0, kind: "online" },
  { device: 5, kind: "delete", block: 0 },
  { device: 0, kind: "quiet" },
  { device: 0, kind: "element", block: 0, element: 0 },
  { device: 0, kind: "offline" },
  { device: 0, kind: "join", block: 0 },
];

test("a device that subscribes again while it loads a rebuilt script misses nothing committed meanwhile", async () => {
  const world = await createWorld({
    seed: 1_740_975_719,
    users: ["dana", "sam"],
    devicesPerUser: 2,
    faults: { duplicate: 0 },
    limits: { checkpointEvery: 1 },
  });
  for (const op of SUBSCRIBED_AGAIN_WHILE_LOADING) applyOp(world, op);
  await world.settle();
  world.check();
});

/**
 * Found with seed 1333182596: a device that subscribed again after it loaded a rebuilt script took
 * the second answer's step 2 merged with the deletions sent before it, whose delete set then hid the
 * text of its own that someone had removed unseen with a block.
 */
const SUBSCRIBED_AGAIN_AFTER_LOADING: Op[] = [
  { device: 2, kind: "delete", block: 0 },
  { device: 3, kind: "type", block: 0, at: 0 },
  { device: 0, kind: "rebuild" },
  { device: 0, kind: "restore", block: 0, at: 0 },
  { device: 1, kind: "restore", block: 0, at: 0 },
  { device: 2, kind: "delete", block: 1 },
  { device: 0, kind: "element", block: 0, element: 0 },
  { device: 0, kind: "quiet" },
  { device: 0, kind: "element", block: 0, element: 0 },
  { device: 0, kind: "element", block: 0, element: 0 },
  { device: 0, kind: "type", block: 1, at: 0 },
  { device: 0, kind: "move", block: 0, length: 2, target: 0 },
  { device: 0, kind: "deliver", frames: 4 },
  { device: 0, kind: "quiet" },
  { device: 0, kind: "quiet" },
  { device: 0, kind: "type", block: 0, at: 0 },
  { device: 5, kind: "element", block: 0, element: 0 },
  { device: 0, kind: "delete", block: 0 },
  { device: 0, kind: "element", block: 0, element: 0 },
  { device: 0, kind: "join", block: 0 },
  { device: 0, kind: "quiet" },
  { device: 2, kind: "delete", block: 0 },
  { device: 0, kind: "move", block: 0, length: 2, target: 0 },
];

test("a device that subscribes again after it loads a rebuilt script keeps its text someone removed unseen", async () => {
  const world = await createWorld({
    seed: 1_333_182_596,
    users: ["dana", "sam"],
    devicesPerUser: 2,
    faults: { duplicate: 0.05 },
  });
  for (const op of SUBSCRIBED_AGAIN_AFTER_LOADING) applyOp(world, op);
  await world.settle();
  world.check();
});
