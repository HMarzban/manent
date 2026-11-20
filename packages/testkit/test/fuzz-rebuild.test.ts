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
