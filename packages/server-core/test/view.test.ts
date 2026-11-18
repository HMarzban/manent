import { expect, test } from "bun:test";
import { sectionize } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import fc from "fast-check";
import {
  VIEW_FORMAT_VERSION,
  encodeView,
  viewPatch,
  viewSnapshot,
} from "../src/index.ts";

const ID_A = "AAAAAAAAAAAAAAAA";
const ID_B = "BBBBBBBBBBBBBBBB";
const ID_C = "CCCCCCCCCCCCCCCC";

/** An action block in the canonical form. */
const block = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: {
    id,
    type: "action",
    omitted: false,
    synopsis: "",
    noContd: false,
    noTiming: false,
  },
  content: [{ type: "text", text }],
});

/** The same block as a writer may hold it: defaults left out. */
const bare = (id: string, text: string): BlockJSON => ({
  type: "block",
  attrs: { id, type: "action" },
  content: [{ type: "text", text }],
});

const decode = (bytes: Uint8Array): unknown =>
  JSON.parse(new TextDecoder().decode(bytes));

test("the viewer's payloads are pinned at version 1", () => {
  expect(VIEW_FORMAT_VERSION).toBe(1);
  const doc = sectionize([block(ID_A, "one"), block(ID_B, "two")]);
  expect(decode(encodeView(viewSnapshot(doc)))).toEqual({
    v: 1,
    blocks: [block(ID_A, "one"), block(ID_B, "two")],
  });
  expect(
    viewPatch({
      inserted: [{ block: block(ID_C, "three"), after: ID_A }],
      changed: [block(ID_B, "TWO")],
      removed: [ID_A],
    }),
  ).toEqual({
    v: 1,
    remove: [ID_A],
    insert: [{ block: block(ID_C, "three"), after: ID_A }],
    update: [block(ID_B, "TWO")],
  });
});

test("a snapshot holds blocks and nothing else", () => {
  const doc = sectionize(
    [bare(ID_A, "one"), bare(ID_B, "two"), bare(ID_C, "three")],
    2,
  );
  expect(viewSnapshot(doc)).toEqual({
    v: 1,
    blocks: [block(ID_A, "one"), block(ID_B, "two"), block(ID_C, "three")],
  });
  expect(
    viewSnapshot({
      type: "doc",
      content: [{ type: "section" }, { type: "section", content: [] }],
    }),
  ).toEqual({ v: 1, blocks: [] });
  expect(viewSnapshot({ type: "doc" })).toEqual({ v: 1, blocks: [] });
});

test("a block that is new is inserted, not also updated; a change nobody can see is no patch", () => {
  expect(
    viewPatch({
      inserted: [{ block: block(ID_C, "x"), after: null }],
      changed: [block(ID_C, "x")],
      removed: [],
    })!.update,
  ).toEqual([]);
  expect(viewPatch({ inserted: [], changed: [], removed: [] })).toBeNull();
});

test("a viewer reads back exactly the blocks that were encoded", () => {
  // any UTF-16 code unit, lone surrogates included: JSON escapes them
  const codeUnit = fc
    .integer({ min: 0, max: 0xffff })
    .map((code) => String.fromCharCode(code));
  const blocks = fc.array(
    fc
      .tuple(
        fc.stringMatching(/^[A-Za-z0-9_-]{16}$/),
        fc.string({ unit: codeUnit, minLength: 1 }),
      )
      .map(([id, text]) => block(id, text)),
    { maxLength: 5 },
  );
  fc.assert(
    fc.property(blocks, (list) => {
      const snapshot = viewSnapshot(sectionize(list));
      expect(decode(encodeView(snapshot))).toEqual(snapshot);
    }),
    { numRuns: 200 },
  );
});
