import { expect, test } from "bun:test";
import fc from "fast-check";
import { canonicalDoc, sectionize } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { changeCount, compareDocs, invertComparison } from "../src/index.ts";
import { arbHistoryPair, arbScript, blockJSONs } from "./history-docs.ts";

/** Each block's canonical JSON text by id, in document order. */
function textsById(json: DocJSON): Map<string, string> {
  return new Map(
    blockJSONs(json).map((block) => [
      String(block.attrs!.id),
      JSON.stringify(block),
    ]),
  );
}

/** The length of the longest strictly increasing subsequence, by the quadratic recurrence. */
function increasingLength(values: readonly number[]): number {
  const ending = values.map(() => 1);
  values.forEach((value, i) => {
    for (let j = 0; j < i; j++)
      if (values[j]! < value) ending[i] = Math.max(ending[i]!, ending[j]! + 1);
  });
  return Math.max(0, ...ending);
}

test("a document compared with itself has no change", () => {
  fc.assert(
    fc.property(arbScript, (d) => {
      expect(changeCount(compareDocs(d, d))).toBe(0);
    }),
    { numRuns: 500 },
  );
});

test("undoing a comparison gives back the older document", () => {
  fc.assert(
    fc.property(arbHistoryPair, ({ older, newer }) => {
      expect(
        JSON.stringify(invertComparison(newer, compareDocs(older, newer))),
      ).toBe(JSON.stringify(canonicalDoc(sectionize(blockJSONs(older)))));
    }),
    { numRuns: 1_000 },
  );
});

test("blocks are counted once, whatever happened to them", () => {
  fc.assert(
    fc.property(arbHistoryPair, ({ older, newer }) => {
      const c = compareDocs(older, newer);
      const [was, now] = [textsById(older), textsById(newer)];
      const differing = [...new Set([...was.keys(), ...now.keys()])].filter(
        (id) => was.get(id) !== now.get(id),
      );
      const olderOrder = [...was.keys()];
      const common = [...now.keys()].filter((id) => was.has(id));
      const moved = c.entries.filter((e) => e.moved).map((e) => e.id);
      expect(moved.length).toBe(
        common.length -
          increasingLength(common.map((id) => olderOrder.indexOf(id))),
      );
      expect(changeCount(c)).toBe(new Set([...differing, ...moved]).size);
    }),
    { numRuns: 1_000 },
  );
});
