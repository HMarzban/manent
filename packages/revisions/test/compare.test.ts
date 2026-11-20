import { expect, test } from "bun:test";
import { ENGINE_VERSION } from "@manent/pagination";
import type { BlockJSON, DocJSON } from "@manent/schema";
import {
  compareDocs,
  compareModeOf,
  filterComparison,
  sliceComparison,
} from "../src/index.ts";
import {
  A,
  B,
  C,
  D,
  E,
  H1,
  H2,
  T,
  b,
  corpusPair,
  doc,
  marked,
  scene,
} from "./history-docs.ts";

test("a word typed into a speech is one inserted change at its offset", () => {
  const c = compareDocs(
    doc(b(A, "No one has crossed")),
    doc(b(A, "No one has crossed since")),
  );
  expect(c.entries).toEqual([
    expect.objectContaining({
      id: A,
      kind: "changed",
      moved: false,
      attrs: [],
      inline: [
        { kind: "inserted", offset: 18, length: 6, text: " since", marks: [] },
      ],
    }),
  ]);
  expect(c.counts).toEqual({ added: 0, removed: 0, changed: 1, moved: 0 });
});

test("bold added to a word is a formatting change, not a retyping", () => {
  const c = compareDocs(
    doc(b(A, "rain falls")),
    doc(
      marked(A, [
        { text: "rain", marks: [{ type: "bold" }] },
        { text: " falls", marks: [] },
      ]),
    ),
  );
  expect(c.entries[0]!.inline).toEqual([
    { kind: "formatted", offset: 0, length: 4, text: "rain", marks: [] },
  ]);
});

test("an element change is an attribute change with the text untouched", () => {
  expect(
    compareDocs(doc(b(A, "JANE")), doc(b(A, "JANE", { type: "character" })))
      .entries[0],
  ).toMatchObject({ kind: "changed", attrs: ["type"], inline: [] });
});

test("added, removed and moved blocks are told apart, each removed one after its place", () => {
  const c = compareDocs(
    doc(b(A, "a"), b(B, "b"), b(C, "c"), b(D, "d")),
    doc(b(A, "a"), b(C, "c"), b(B, "b"), b(E, "e")),
  );
  expect(c.entries.map((e) => [e.id, e.kind, e.moved, e.after])).toEqual([
    [A, "unchanged", false, null],
    [C, "unchanged", false, null],
    [B, "unchanged", true, null],
    [E, "added", false, null],
    [D, "removed", false, C],
  ]);
});

test("a split tail names its origin, and a joined block names where its text went", () => {
  const split = compareDocs(
    doc(b(A, "Rain falls. He waits.")),
    doc(b(A, "Rain falls."), b(T, " He waits.", { from: `${A}:n1` })),
  );
  expect(split.entries.map((e) => [e.id, e.kind, e.splitFrom])).toEqual([
    [A, "changed", null],
    [T, "added", A],
  ]);
  const joined = compareDocs(
    doc(b(A, "Rain falls."), b(B, " He waits.")),
    doc(b(A, "Rain falls. He waits.")),
  );
  expect(joined.entries.map((e) => [e.id, e.kind, e.joinedInto])).toEqual([
    [A, "changed", null],
    [B, "removed", A],
  ]);
});

test("every change knows its scene", () => {
  const older = doc(...scene(H1, b(A, "a")), ...scene(H2, b(B, "b")));
  const changed = compareDocs(
    older,
    doc(...scene(H1, b(A, "a")), ...scene(H2, b(B, "b!"))),
  );
  expect(changed.entries.map((e) => [e.id, e.sceneId])).toEqual([
    [H1, H1],
    [A, H1],
    [H2, H2],
    [B, H2],
  ]);
  expect(changed.scenes).toEqual([H2]);
  const gone = compareDocs(older, doc(...scene(H1, b(A, "a"))));
  expect(gone.entries.map((e) => [e.id, e.kind, e.sceneId])).toEqual([
    [H1, "unchanged", H1],
    [A, "unchanged", H1],
    [H2, "removed", H2],
    [B, "removed", H2],
  ]);
  expect(gone.scenes).toEqual([H2]);
});

test("two versions of different builds are compared on text and elements", () => {
  const older = doc(b(A, "rain", { glow: 3 })),
    newer = doc(marked(A, [{ text: "rain", marks: [{ type: "blink" }] }]));
  expect(
    compareDocs(older, newer, { mode: "text_and_elements" }).entries[0]!.kind,
  ).toBe("unchanged");
  expect(
    compareDocs(
      older,
      doc(marked(A, [{ text: "rain", marks: [{ type: "bold" }] }])),
    ).entries[0],
  ).toMatchObject({
    kind: "changed",
    attrs: ["glow"],
    inline: [
      { kind: "formatted", offset: 0, length: 4, text: "rain", marks: [] },
    ],
  });
  expect([
    compareModeOf(
      { schemaVersion: 2, engineVersion: 1 },
      { schemaVersion: 1, engineVersion: 1 },
    ),
    compareModeOf(
      { schemaVersion: 1, engineVersion: 1 },
      { schemaVersion: 1, engineVersion: 2 },
    ),
    compareModeOf(
      { schemaVersion: 1, engineVersion: null },
      { schemaVersion: 1, engineVersion: ENGINE_VERSION },
    ),
  ]).toEqual([
    { mode: "text_and_elements", note: "newer" },
    { mode: "text_and_elements", note: "engines" },
    { mode: "full", note: null },
  ]);
});

test("a word bolded beside a typed word is one change of its whole words", () => {
  const c = compareDocs(
    doc(b(A, "rain falls")),
    doc(
      marked(A, [
        { text: "rain ", marks: [] },
        { text: "falls", marks: [{ type: "bold" }] },
        { text: " hard", marks: [] },
      ]),
    ),
  );
  expect(c.entries[0]!.inline.map((x) => [x.kind, x.text])).toEqual([
    ["deleted", "falls"],
    ["inserted", "falls hard"],
  ]);
});

test("text outside Latin is compared by whole characters", () => {
  expect(
    compareDocs(doc(b(A, "🎬 مرحبا")), doc(b(A, "🎬 مرحبا!"))).entries[0]!
      .inline,
  ).toEqual([{ kind: "inserted", offset: 8, length: 1, text: "!", marks: [] }]);
  // 🎬 and 🎥 share their first UTF-16 unit: the change still covers the whole of each
  expect(
    compareDocs(doc(b(A, "🎬 rain")), doc(b(A, "🎥 rain"))).entries[0]!.inline,
  ).toEqual([
    { kind: "deleted", offset: 0, length: 0, text: "🎬", marks: [] },
    { kind: "inserted", offset: 0, length: 2, text: "🎥", marks: [] },
  ]);
});

test("a filter keeps the changes of the scenes and blocks it names", () => {
  const c = compareDocs(
    doc(...scene(H1, b(A, "a")), ...scene(H2, b(B, "b"))),
    doc(...scene(H1, b(A, "a!")), ...scene(H2, b(B, "b!"))),
  );
  const inScene = filterComparison(c, { sceneIds: [H2], blockIds: null });
  expect([
    inScene.entries.map((e) => e.id),
    inScene.counts,
    inScene.scenes,
  ]).toEqual([[H2, B], { added: 0, removed: 0, changed: 1, moved: 0 }, [H2]]);
  const inBlock = filterComparison(c, { sceneIds: null, blockIds: [A] });
  expect([inBlock.entries.map((e) => e.id), inBlock.scenes]).toEqual([
    [A],
    [H1],
  ]);
  expect(filterComparison(c, { sceneIds: null, blockIds: null })).toEqual(c);
});

test("a comparison delivered in slices ends equal to the whole one", () => {
  const big = corpusPair(2_700, 220);
  let ticks = 0;
  const gen = sliceComparison(big.older, big.newer, {
    now: () => (ticks += 3),
    sliceMs: 8,
  });
  let step = gen.next();
  let partials = 0;
  while (!step.done) {
    partials++;
    step = gen.next();
  }
  expect(partials).toBeGreaterThan(1);
  expect(step.value).toEqual(compareDocs(big.older, big.newer));
});

/** `json` with every block counting each read of its text into `reads`. */
function countingReads(json: DocJSON, reads: { count: number }): DocJSON {
  const counted = (block: BlockJSON): BlockJSON => ({
    type: block.type,
    attrs: block.attrs,
    get content() {
      reads.count++;
      return block.content;
    },
  });
  return {
    ...json,
    content: (json.content ?? []).map((section) => ({
      ...section,
      content: (section.content ?? []).map(counted),
    })),
  };
}

test("each slice of a comparison reads only a slice's worth of blocks", () => {
  const big = corpusPair(2_700, 220);
  const reads = { count: 0 };
  const gen = sliceComparison(
    countingReads(big.older, reads),
    countingReads(big.newer, reads),
    { now: () => reads.count, sliceMs: 8 },
  );
  const steps: number[] = [];
  for (let done = false; !done;) {
    const before = reads.count;
    done = gen.next().done === true;
    steps.push(reads.count - before);
  }
  expect(Math.max(...steps)).toBeLessThanOrEqual(8 + 2);
  expect(reads.count).toBe(2 * 2_700);
});
