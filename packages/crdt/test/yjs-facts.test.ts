// The Yjs behaviour the block writer is built around, pinned on the installed version.
import { expect, test } from "bun:test";
import * as Y from "yjs";

test("Yjs gives inserted text the formatting around it", () => {
  const t = new Y.Doc().getText("t");
  t.insert(0, "abcdef", { bold: {} });
  t.insert(3, "X");
  expect(t.toDelta()).toEqual([
    { insert: "abcXdef", attributes: { bold: {} } },
  ]);
});

test("Yjs replaces both halves of a split surrogate pair with U+FFFD", () => {
  const t = new Y.Doc().getText("t");
  t.insert(0, "ab🎬cd");
  t.insert(3, "X");
  expect(t.toString()).toBe("ab�X�cd");
});
