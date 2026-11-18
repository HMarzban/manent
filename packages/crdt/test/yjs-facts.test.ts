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

/** The update one raw write produced, merged when Yjs ran more than one transaction for it. */
function captureRaw(doc: Y.Doc, fn: () => void): Uint8Array {
  const updates: Uint8Array[] = [];
  const onUpdate = (update: Uint8Array) => updates.push(update);
  doc.on("update", onUpdate);
  doc.transact(fn);
  doc.off("update", onUpdate);
  return Y.mergeUpdates(updates);
}

function sectionOf(doc: Y.Doc): Y.XmlElement {
  const section = doc.getXmlFragment("prosemirror").get(0);
  if (!(section instanceof Y.XmlElement)) throw new RangeError("no section");
  return section;
}

function blockOf(doc: Y.Doc): Y.XmlElement {
  const block = sectionOf(doc).get(0);
  if (!(block instanceof Y.XmlElement)) throw new RangeError("no block");
  return block;
}

function textOf(doc: Y.Doc): Y.XmlText {
  const text = blockOf(doc).get(0);
  if (!(text instanceof Y.XmlText)) throw new RangeError("no text");
  return text;
}

/** Two raw documents holding one section, one block and its text, synced. */
function twoRawDocs() {
  const a = new Y.Doc();
  a.clientID = 1;
  const block = new Y.XmlElement("block");
  const text = new Y.XmlText();
  text.insert(0, "line");
  block.insert(0, [text]);
  const section = new Y.XmlElement("section");
  section.insert(0, [block]);
  a.getXmlFragment("prosemirror").insert(0, [section]);
  const b = new Y.Doc();
  b.clientID = 2;
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  return { a, b, section: sectionOf, block: blockOf, text: textOf };
}

function nameOf(type: unknown): string {
  if (type instanceof Y.XmlText) return "text";
  if (type instanceof Y.XmlElement) return type.nodeName;
  return "root";
}

/** The second of two updates by one client, which needs the first. */
const secondOfTwoDependentUpdates = (() => {
  const source = new Y.Doc();
  const text = source.getText("t");
  captureRaw(source, () => text.insert(0, "first"));
  return captureRaw(source, () => text.insert(5, " second"));
})();

test("a transaction names the types it changed, and a duplicate update changes none", () => {
  const { a, b, section, block, text } = twoRawDocs();
  const seen: string[][] = [];
  let updates = 0;
  b.on("afterTransaction", (tr: Y.Transaction) =>
    seen.push([...tr.changed.keys()].map(nameOf)),
  );
  b.on("update", () => updates++);
  const typed = captureRaw(a, () => text(a).insert(0, "x"));
  Y.applyUpdate(b, typed);
  const attr = captureRaw(a, () => block(a).setAttribute("type", "character"));
  Y.applyUpdate(b, attr);
  const added = captureRaw(a, () =>
    section(a).insert(1, [new Y.XmlElement("block")]),
  );
  Y.applyUpdate(b, added);
  expect(seen).toEqual([["text"], ["block"], ["section"]]);
  const before = updates;
  Y.applyUpdate(b, typed);
  Y.applyUpdate(b, added);
  expect(updates).toBe(before);
});

test("formatting can take two transactions, and pending structs can be dropped", () => {
  const { a, b, text } = twoRawDocs();
  let count = 0;
  b.on("afterTransaction", () => count++);
  Y.applyUpdate(
    b,
    captureRaw(a, () => text(a).format(0, 1, { bold: {} })),
  );
  expect(count).toBeGreaterThanOrEqual(1); // 2 on 13.6.33: reports are gathered across all of them
  const c = new Y.Doc();
  Y.applyUpdate(c, secondOfTwoDependentUpdates);
  expect(c.store.pendingStructs).not.toBeNull();
  c.store.pendingStructs = null;
  c.store.pendingDs = null;
  expect(Y.encodeStateAsUpdate(c).byteLength).toBe(2); // the empty update: nothing of the dropped structs is left
});
