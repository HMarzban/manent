import { expect, test } from "bun:test";
import * as Y from "yjs";
import * as crdt from "../src/index.ts";
import { createDoc, scriptBody } from "../src/index.ts";
import type { CrdtDoc, DocOptions } from "../src/index.ts";
import { block } from "./helpers.ts";

test("garbage collection cannot be turned off", () => {
  // the option does not exist; a test may cast to build wrong input
  const doc = createDoc({ gc: false } as unknown as DocOptions);
  scriptBody(doc).write((w) =>
    w.insertBlocks(null, [block("a".repeat(16), "x".repeat(10_000))]),
  );
  scriptBody(doc).write((w) => w.deleteBlock("a".repeat(16)));
  // with garbage collection off this is over 10,000
  expect(doc.encodeState().byteLength).toBeLessThan(500);
});

test("no Yjs class is exported", () => {
  for (const value of Object.values(crdt))
    expect(Object.values(Y)).not.toContain(value);
});

test("a client ID can be fixed for deterministic seeds", () => {
  expect(createDoc({ clientId: 7 }).clientId).toBe(7);
});

test("a document this package did not make is refused", () => {
  const foreign = { clientId: 1 } as CrdtDoc; // a test may cast to build wrong input
  expect(() => scriptBody(foreign)).toThrow(
    new TypeError("a CrdtDoc must come from this package"),
  );
});
