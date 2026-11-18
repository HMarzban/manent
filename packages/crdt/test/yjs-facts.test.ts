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

test("a cut-off update can leave a raw Yjs document half-applied, and decodeUpdate refuses every cut", () => {
  const a = new Y.Doc();
  const t = a.getText("t");
  t.insert(0, "hello world");
  t.delete(2, 3);
  t.insert(4, "ZZ");
  t.delete(0, 1);
  const full = Y.encodeStateAsUpdate(a);
  let halfApplied = 0;
  for (let n = 0; n < full.length; n++) {
    const b = new Y.Doc();
    let threw = false;
    try {
      Y.applyUpdate(b, full.slice(0, n));
    } catch {
      threw = true;
    }
    if (threw && b.getText("t").toString() !== "") halfApplied++;
    expect(() => Y.decodeUpdate(full.slice(0, n))).toThrow();
  }
  expect(halfApplied).toBeGreaterThan(0); // 11 of 79 cuts on 13.6.33: so applyUpdate decodes first
});
