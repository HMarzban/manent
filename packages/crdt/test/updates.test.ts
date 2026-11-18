import { expect, test } from "bun:test";
import { parseDoc, rejects, validateDoc } from "@manent/schema";
import fc from "fast-check";
import {
  CrdtUpdateError,
  ORIGIN_REMOTE,
  createDoc,
  loadDoc,
  mergeUpdates,
  scriptBody,
  scriptDocFromJSON,
  updateMeta,
} from "../src/index.ts";
import type { CrdtDoc, Update } from "../src/index.ts";
import {
  FIRST_ID,
  ID,
  SAMPLE,
  SECOND_ID,
  capture,
  docWith,
  runs,
  twoDependentUpdates,
  twoReplicasOf,
} from "./helpers.ts";

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** True when applying `update` leaves `doc` exactly as it was. */
function appliesAsNothing(update: Update, doc: CrdtDoc): boolean {
  const before = doc.encodeState();
  doc.applyUpdate(update);
  return equalBytes(doc.encodeState(), before);
}

/** A document with one edited block, and the update holding all of it. */
function editedDoc(): { doc: CrdtDoc; state: Update } {
  const doc = scriptDocFromJSON(SAMPLE, { clientId: 1 });
  scriptBody(doc).write((w) => {
    w.insertText(FIRST_ID, 0, "Hello ");
    w.deleteText(SECOND_ID, 2, 4);
  });
  return { doc, state: doc.encodeState() };
}

const realUpdate = editedDoc().state;

/** The whole state of a document after a few insertions and deletions. */
const arbRealUpdate: fc.Arbitrary<Update> = fc
  .array(
    fc.record({
      insert: fc.boolean(),
      at: fc.nat({ max: 40 }),
      text: fc.constantFrom("a", "🎬", "word ", "مرحبا"),
      length: fc.integer({ min: 1, max: 5 }),
    }),
    { minLength: 1, maxLength: 8 },
  )
  .map((edits) => {
    const doc = scriptDocFromJSON(
      docWith({ id: ID, type: "action" }, "Rain on the window"),
    );
    for (const edit of edits)
      scriptBody(doc).write((w) =>
        edit.insert
          ? w.insertText(ID, edit.at, edit.text)
          : w.deleteText(ID, edit.at, edit.length),
      );
    return doc.encodeState();
  });

test("a peer catches up from a diff against its state vector", () => {
  const a = scriptDocFromJSON(SAMPLE, { clientId: 1 });
  const b = loadDoc(a.encodeState(), { clientId: 2 });
  scriptBody(a).write((w) => w.insertText(FIRST_ID, 0, "Hello "));
  b.applyUpdate(a.diff(b.encodeStateVector()));
  expect(scriptBody(b).materialize()).toEqual(scriptBody(a).materialize());
  expect(appliesAsNothing(a.diff(a.encodeStateVector()), b)).toBe(true);
});

test("subscribers get one update per transaction, with its origin", () => {
  const a = scriptDocFromJSON(SAMPLE, { clientId: 1 });
  const b = loadDoc(a.encodeState(), { clientId: 2 });
  const updateFromB = capture(b, (w) => w.insertText(SECOND_ID, 0, "b"));
  const seen: unknown[] = [];
  const stop = a.subscribe((u, origin) =>
    seen.push([u.byteLength > 0, origin]),
  );
  scriptBody(a).write((w) => {
    w.insertText(FIRST_ID, 0, "a");
    w.insertText(FIRST_ID, 1, "b");
  }, "typing");
  a.applyUpdate(updateFromB); // default origin
  stop();
  scriptBody(a).write((w) => w.insertText(FIRST_ID, 0, "c"));
  expect(seen).toEqual([
    [true, "typing"],
    [true, ORIGIN_REMOTE],
  ]);
});

test("applying an update twice changes nothing", () => {
  const { state } = editedDoc();
  const b = createDoc();
  b.applyUpdate(state);
  expect(appliesAsNothing(state, b)).toBe(true);
});

test("bytes that are not an update are refused and leave the document as it was", () => {
  const { doc: a } = editedDoc();
  const before = a.encodeState();
  for (const bad of [
    new Uint8Array([1, 2, 3]),
    new Uint8Array(),
    new Uint8Array(6).fill(255),
  ]) {
    const thrown = (() => {
      try {
        a.applyUpdate(bad);
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(thrown).toBeInstanceOf(CrdtUpdateError);
    expect(thrown).toMatchObject({
      name: "CrdtUpdateError",
      code: "bad_update",
    });
    expect((thrown as CrdtUpdateError).cause).toBeDefined(); // what Yjs threw is kept
    expect((thrown as CrdtUpdateError).cause).toBeInstanceOf(Error);
  }
  expect(a.encodeState()).toEqual(before);
});

test("any prefix of a real update applies or changes nothing", () => {
  fc.assert(
    fc.property(arbRealUpdate, fc.nat(), (update, cut) => {
      const doc = createDoc();
      const before = doc.encodeState();
      const prefix = update.slice(0, cut % update.length);
      try {
        doc.applyUpdate(prefix);
      } catch (e) {
        expect(e).toBeInstanceOf(CrdtUpdateError);
        expect(doc.encodeState()).toEqual(before);
      }
    }),
    { numRuns: 300 },
  );
});

test("updateMeta refuses garbage with CrdtUpdateError", () => {
  for (const bad of [
    new Uint8Array([1, 2, 3]),
    new Uint8Array(),
    realUpdate.slice(0, realUpdate.length - 1),
  ])
    expect(() => updateMeta(bad)).toThrow(CrdtUpdateError);
});

test("an update names the client IDs and clock ranges it carries", () => {
  const [a, b] = twoReplicasOf(docWith({ id: ID, type: "action" }, "Rain"));
  capture(a, (w) => w.insertText(ID, 4, "!"));
  const fromA = capture(a, (w) => w.insertText(ID, 5, " falls"));
  const fromB = capture(b, (w) => w.insertText(ID, 0, "Cold "));
  expect(updateMeta(fromA)).toEqual([
    { clientId: 1, fromClock: 1, toClock: 7 },
  ]);
  expect(updateMeta(mergeUpdates([fromA, fromB]))).toEqual([
    { clientId: 2, fromClock: 0, toClock: 5 },
    { clientId: 1, fromClock: 1, toClock: 7 },
  ]);
});

test("an update that arrives before the one it depends on is held", () => {
  const {
    source,
    updates: [u1, u2],
  } = twoDependentUpdates();
  const b = createDoc();
  b.applyUpdate(u2);
  expect(b.hasPendingStructs()).toBe(true);
  b.applyUpdate(u1);
  expect(b.hasPendingStructs()).toBe(false);
  expect(scriptBody(b).materialize()).toEqual(scriptBody(source).materialize());
});

test("a deletion that arrives before what it deletes is held", () => {
  const source = createDoc({ clientId: 3 });
  const written = capture(source, (w) =>
    w.insertBlocks(null, [
      docWith({ id: ID, type: "action" }, "Rain").content![0]!.content![0]!,
    ]),
  );
  const deleted = capture(source, (w) => w.deleteText(ID, 0, 2));
  const b = createDoc();
  b.applyUpdate(deleted);
  expect(b.hasPendingStructs()).toBe(true);
  b.applyUpdate(written);
  expect(b.hasPendingStructs()).toBe(false);
  expect(runs(b, ID)).toEqual([["in", []]]);
});

test("merged updates equal the updates applied one by one", () => {
  const a = scriptDocFromJSON(SAMPLE, { clientId: 1 });
  const base = a.encodeState();
  const updates = [
    capture(a, (w) => w.insertText(FIRST_ID, 0, "Hello ")),
    capture(a, (w) => w.deleteText(SECOND_ID, 0, 2)),
    capture(a, (w) => w.addMark(SECOND_ID, 0, 3, { type: "bold" })),
  ];
  const oneByOne = loadDoc(base);
  for (const update of updates) oneByOne.applyUpdate(update);
  const merged = loadDoc(base);
  merged.applyUpdate(mergeUpdates(updates));
  expect(merged.encodeState()).toEqual(oneByOne.encodeState());
  expect(scriptBody(merged).materialize()).toEqual(scriptBody(a).materialize());
});

test("load keeps the content", () => {
  const { doc } = editedDoc();
  const loaded = loadDoc(doc.encodeState());
  expect(scriptBody(loaded).materialize()).toEqual(
    scriptBody(doc).materialize(),
  );
  expect(scriptBody(loaded).materializeRaw()).toEqual(
    scriptBody(doc).materializeRaw(),
  );
});

test("one suggestion stored in two forms merges into one mark", () => {
  const base = scriptDocFromJSON(
    docWith({ id: ID, type: "action" }, "Rain on the window"),
    { clientId: 9 },
  );
  const [a, b] = [1, 2].map((clientId) =>
    loadDoc(base.encodeState(), { clientId }),
  ) as [CrdtDoc, CrdtDoc];
  const ua = capture(a, (w) =>
    w.addMark(ID, 0, 4, {
      type: "suggest_insert",
      attrs: { id: "s1", authorUserId: "dana", at: 0 },
    }),
  );
  const ub = capture(b, (w) =>
    w.addMark(ID, 0, 4, {
      type: "suggest_insert",
      attrs: { authorUserId: "dana", id: "s1" },
    }),
  ); // `at` left out, keys reordered
  a.applyUpdate(ub);
  b.applyUpdate(ua);
  expect(scriptBody(a).materialize()).toEqual(scriptBody(b).materialize());
  expect(runs(a, ID)[0]).toEqual(["Rain", ["suggest_insert"]]); // one mark, not two
  expect(rejects(validateDoc(scriptBody(a).materializeRaw()))).toBe(false);
  expect(() => parseDoc(scriptBody(a).materialize())).not.toThrow();
});

test("what a newer build wrote survives a load, a local edit and a merge", () => {
  const newer = scriptDocFromJSON(
    docWith({ id: ID, type: "action", glow: 3 }, [
      { text: "Rain", marks: [{ type: "blink", attrs: { rate: 2 } }] },
    ]),
    { clientId: 9 },
  );
  const mine = loadDoc(newer.encodeState(), { clientId: 1 });
  const update = capture(mine, (w) => {
    w.setBlockAttrs(ID, { type: "character" });
    w.insertText(ID, 4, " falls");
  });
  newer.applyUpdate(update);
  for (const doc of [mine, newer]) {
    const block = scriptBody(doc).materialize().content![0]!.content![0]!;
    expect(block.attrs).toMatchObject({ glow: 3, type: "character" });
    expect(block.content![0]).toEqual({
      type: "text",
      text: "Rain",
      marks: [{ type: "blink", attrs: { rate: 2 } }],
    });
  }
});
