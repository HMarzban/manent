import { expect, test } from "bun:test";
import fc from "fast-check";
import {
  layoutPage,
  lineStartsOf,
  paginate,
  profileFor,
  toLayoutBlocks,
} from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { changedLineSet, compareDocs, markedLines } from "../src/index.ts";
import { A, B, C, applyEdits, arbHistoryPair, b, doc } from "./history-docs.ts";

const LONG_ACTION =
  "The ferry leaves the pier at dusk and the gulls follow it out past the breakwater while the deckhands coil the wet ropes and the passengers stand at the rail watching the lights of the town go small behind the rain until the harbour is only a glow.";
// the line starts once "cold " is typed at 140, read once from a run so that the fixture itself is pinned
const LONG_ACTION_LINE_STARTS = [0, 58, 115, 176, 230];

function paginateDoc(d: DocJSON): Pagination {
  return paginate(toLayoutBlocks(blocksOf(d)), profileFor("screenplay")!);
}

function insertAt(text: string, offset: number, inserted: string): string {
  return text.slice(0, offset) + inserted + text.slice(offset);
}

test("a change on the third line of a long action marks that line only", () => {
  const older = doc(b(A, LONG_ACTION));
  const newer = doc(b(A, insertAt(LONG_ACTION, 140, "cold ")));
  const p = paginateDoc(newer);
  expect([...lineStartsOf(p, 0)]).toEqual(LONG_ACTION_LINE_STARTS);
  expect(changedLineSet(compareDocs(older, newer), p)).toEqual(
    new Map([[A, [2]]]),
  );
});

test("a removed block marks the deletion point", () => {
  const between = doc(b(A, "Rain falls."), b(C, "Silence."));
  expect(
    changedLineSet(
      compareDocs(
        doc(b(A, "Rain falls."), b(B, "A horn sounds."), b(C, "Silence.")),
        between,
      ),
      paginateDoc(between),
    ),
  ).toEqual(new Map([[C, [0]]]));
  const last = doc(b(A, LONG_ACTION));
  expect(
    changedLineSet(
      compareDocs(doc(b(A, LONG_ACTION), b(B, "A horn sounds.")), last),
      paginateDoc(last),
    ),
  ).toEqual(new Map([[A, [4]]]));
});

test("a deletion at the very end of a line marks that line", () => {
  // the word goes from the end of line 0, and line 1 now starts where it sat
  const newer = doc(b(A, LONG_ACTION.slice(0, 57) + LONG_ACTION.slice(61)));
  const c = compareDocs(doc(b(A, LONG_ACTION)), newer);
  expect(c.entries[0]!.inline).toEqual([
    { kind: "deleted", offset: 58, length: 0, text: "out ", marks: [] },
  ]);
  expect(changedLineSet(c, paginateDoc(newer))).toEqual(new Map([[A, [0]]]));
});

test("type then delete leaves no mark", () => {
  expect(
    changedLineSet(
      compareDocs(doc(b(A, "rain")), doc(b(A, "rain"))),
      paginateDoc(doc(b(A, "rain"))),
    ),
  ).toEqual(new Map());
});

test("marked lines are the text lines of a page, at their heights, with their authors", () => {
  const newer = doc(
    b(A, "Thunder."),
    b(B, insertAt(LONG_ACTION, 140, "cold ")),
  );
  const p = paginateDoc(newer);
  const lines = changedLineSet(compareDocs(doc(b(B, LONG_ACTION)), newer), p);
  expect(lines).toEqual(
    new Map([
      [A, [0]],
      [B, [2]],
    ]),
  );
  expect(markedLines(layoutPage(p, 0), lines, new Map([[A, "dana"]]))).toEqual([
    { y: 0, blockId: A, authorUserId: "dana" },
    { y: 8, blockId: B, authorUserId: null },
  ]);
});

/** Two edit sequences from one script that end in equal documents: the second types two letters and deletes them again. */
const arbTwoHistories = arbHistoryPair.chain(({ older, newer, edits }) =>
  fc
    .record({ cut: fc.nat({ max: edits.length }), block: fc.nat({ max: 40 }) })
    .map(({ cut, block }) => ({
      base: older,
      end1: newer,
      end2: applyEdits(older, [
        ...edits.slice(0, cut),
        { kind: "type", block, at: 0, text: "zz" },
        { kind: "delete_text", block, at: 0, length: 2 },
        ...edits.slice(cut),
      ]),
    })),
);

test("the same document reached by two histories marks the same lines", () => {
  fc.assert(
    fc.property(arbTwoHistories, ({ base, end1, end2 }) => {
      expect(
        changedLineSet(compareDocs(base, end1), paginateDoc(end1)),
      ).toEqual(changedLineSet(compareDocs(base, end2), paginateDoc(end2)));
    }),
    { numRuns: 300 },
  );
});
