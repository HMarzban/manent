import { expect, test } from "bun:test";
import { sectionize, validateBlocks, validateDoc } from "@manent/schema";
import type { BlockJSON, DocJSON, Issue } from "@manent/schema";
import fc from "fast-check";
import * as Y from "yjs";
import {
  CrdtUpdateError,
  ORIGIN_REMOTE,
  ORIGIN_REPLAY,
  applyInspecting,
  loadDoc,
  mergeUpdates,
  observeScript,
  scriptBody,
  scriptDocFromJSON,
  yXmlFragmentForBinding,
} from "../src/index.ts";
import type { CrdtDoc, TransactionReport, Update } from "../src/index.ts";
import {
  FIRST_ID,
  ID,
  SAMPLE,
  SECOND_ID,
  THIRD_ID,
  block,
  capture,
  docWith,
  idOf,
} from "./helpers.ts";

const ID_X = "x".repeat(16);
const ID_Y = "y".repeat(16);
const ID_Z = "z".repeat(16);

/** The sample script on client 1, and a copy of it on client 2. */
function pair(): { a: CrdtDoc; b: CrdtDoc } {
  const a = scriptDocFromJSON(SAMPLE, { clientId: 1 });
  return { a, b: loadDoc(a.encodeState(), { clientId: 2 }) };
}

function idsOf(blocks: readonly BlockJSON[]): unknown[] {
  return blocks.map((found) => found.attrs?.id);
}

function blockOf(doc: CrdtDoc, id: string): BlockJSON | undefined {
  return (scriptBody(doc).materialize().content ?? [])
    .flatMap((section) => section.content ?? [])
    .find((found) => found.attrs?.id === id);
}

test("typing reports the one block it changed", () => {
  const { a, b } = pair();
  const report = applyInspecting(
    b,
    capture(a, (w) => w.insertText(FIRST_ID, 0, "Hello ")),
  )!;
  expect([
    idsOf(report.changed),
    report.inserted,
    report.removed,
    report.maps,
  ]).toEqual([[FIRST_ID], [], [], []]);
  expect(JSON.stringify(report.changed[0])).toBe(
    JSON.stringify(blockOf(b, FIRST_ID)),
  );
  expect(report.origin).toBe(ORIGIN_REMOTE);
});

test("new blocks come in document order with the block each follows", () => {
  const { a, b } = pair();
  const report = applyInspecting(
    b,
    capture(a, (w) =>
      w.insertBlocks(FIRST_ID, [block(ID_X, "x"), block(ID_Y, "y")]),
    ),
  )!;
  expect(report.inserted.map((i) => [i.block.attrs!.id, i.after])).toEqual([
    [ID_X, FIRST_ID],
    [ID_Y, ID_X],
  ]);
  const first = applyInspecting(
    b,
    capture(a, (w) => w.insertBlocks(null, [block(ID_Z, "z")])),
  )!;
  expect(first.inserted.map((i) => [i.block.attrs!.id, i.after])).toEqual([
    [ID_Z, null],
  ]);
});

test("blocks added in two sections come in document order, each after the block before it", () => {
  const { a, b } = pair();
  const report = applyInspecting(
    b,
    capture(a, (w) => {
      w.insertBlocks("s000000000000005", [block(ID_X, "x")]);
      w.insertBlocks(THIRD_ID, [block(ID_Y, "y"), block(ID_Z, "z")]);
    }),
  )!;
  expect(report.inserted.map((i) => [i.block.attrs!.id, i.after])).toEqual([
    [ID_Y, THIRD_ID],
    [ID_Z, ID_Y],
    [ID_X, "s000000000000005"],
  ]);
});

test("a block added and deleted within one change is neither inserted nor removed", () => {
  const { a, b } = pair();
  const report = applyInspecting(
    b,
    mergeUpdates([
      capture(a, (w) => w.insertBlocks(FIRST_ID, [block(ID_X, "x")])),
      capture(a, (w) => w.deleteBlock(ID_X)),
    ]),
  )!;
  expect([
    report.inserted,
    report.changed,
    report.removed,
    report.touched(),
  ]).toEqual([[], [], [], []]);
});

test("a block changed and then deleted in one write is only removed", () => {
  const { a } = pair();
  const seen: TransactionReport[] = [];
  const stop = observeScript(a, (r) => seen.push(r));
  scriptBody(a).write((w) => {
    w.setBlockAttrs(SECOND_ID, { type: "character" });
    w.deleteBlock(SECOND_ID);
  });
  stop();
  expect(seen.map((r) => [r.changed, r.removed, r.touched()])).toEqual([
    [[], [SECOND_ID], []],
  ]);
});

test("what a listener deletes while a change is applied is not reported", () => {
  const { a, b } = pair();
  const raw = new Y.Doc();
  raw.clientID = 6;
  Y.applyUpdate(raw, a.encodeState());
  const updates: Uint8Array[] = [];
  raw.on("update", (update: Uint8Array) => updates.push(update));
  raw.transact(() => {
    const [first, second] = raw.getXmlFragment("prosemirror").toArray();
    if (!(first instanceof Y.XmlElement && second instanceof Y.XmlElement))
      throw new RangeError("no sections");
    first.setAttribute("x", "1");
    first.insert(0, [new Y.XmlElement("page")]);
    second.insert(0, [new Y.XmlElement("block")]);
  });
  const body = yXmlFragmentForBinding(b);
  const clear = () => {
    body.unobserveDeep(clear);
    body.delete(0, body.length);
  };
  body.observeDeep(clear);
  const report = applyInspecting(b, Y.mergeUpdates(updates))!;
  expect([report.inserted, report.changed, report.touched()]).toEqual([
    [],
    [],
    [],
  ]);
});

test("a deleted block is named by its id, and a moved one is both removed and inserted", () => {
  const { a, b } = pair();
  expect(
    applyInspecting(
      b,
      capture(a, (w) => w.deleteBlock(SECOND_ID)),
    )!.removed,
  ).toEqual([SECOND_ID]);
  const moved = applyInspecting(
    b,
    capture(a, (w) => {
      w.deleteBlock(THIRD_ID);
      w.insertBlocks(FIRST_ID, [block(THIRD_ID, "three")]);
    }),
  )!;
  expect([moved.removed, idsOf(moved.inserted.map((i) => i.block))]).toEqual([
    [THIRD_ID],
    [THIRD_ID],
  ]);
});

test("an update that changes nothing reports nothing", () => {
  const { a, b } = pair();
  const update = capture(a, (w) => w.deleteBlock(SECOND_ID));
  applyInspecting(b, update);
  expect(applyInspecting(b, update)).toBeNull();
});

test("bytes that are not an update are refused and change nothing", () => {
  const { b } = pair();
  const before = b.encodeState();
  let thrown: unknown = null;
  try {
    applyInspecting(b, new Uint8Array([1, 2, 3]));
  } catch (error) {
    thrown = error;
  }
  expect(thrown instanceof CrdtUpdateError && thrown.code).toBe("bad_update");
  expect(b.encodeState()).toEqual(before);
});

test("local writes are observed with their origin", () => {
  const { a } = pair();
  const seen: TransactionReport[] = [];
  const stop = observeScript(a, (r) => seen.push(r));
  scriptBody(a).write(
    (w) => w.setBlockAttrs(FIRST_ID, { type: "character" }),
    "typing",
  );
  scriptBody(a).write(
    (w) => w.addMark(FIRST_ID, 0, 2, { type: "bold" }),
    ORIGIN_REPLAY,
  );
  stop();
  scriptBody(a).write((w) => w.insertText(FIRST_ID, 0, "c"));
  expect(seen.map((r) => [r.origin, idsOf(r.changed)])).toEqual([
    ["typing", [FIRST_ID]],
    [ORIGIN_REPLAY, [FIRST_ID]],
  ]);
});

test("what a listener throws reaches the writer once Yjs has finished, and later writes are still seen", () => {
  const { a } = pair();
  const seen: unknown[] = [];
  const stop = observeScript(a, (r) => {
    seen.push(r.origin);
    if (r.origin === "first") throw new RangeError("first");
  });
  expect(() =>
    scriptBody(a).write((w) => w.insertText(FIRST_ID, 0, "a"), "first"),
  ).toThrow(new RangeError("first"));
  scriptBody(a).write((w) => w.insertText(FIRST_ID, 0, "b"), "second");
  stop();
  expect(seen).toEqual(["first", "second"]);
});

test("every throw of one round of changes reaches the writer", () => {
  const { a } = pair();
  const stop = observeScript(a, (r) => {
    if (r.origin === "first")
      scriptBody(a).write((w) => w.insertText(FIRST_ID, 0, "b"), "second");
    throw new RangeError(String(r.origin));
  });
  let thrown: unknown = null;
  try {
    scriptBody(a).write((w) => w.insertText(FIRST_ID, 0, "a"), "first");
  } catch (error) {
    thrown = error;
  }
  stop();
  expect(thrown instanceof AggregateError && thrown.errors).toEqual([
    new RangeError("first"),
    new RangeError("second"),
  ]);
});

test("the formatting Yjs tidies after a remote change is a report of its own", () => {
  const base = scriptDocFromJSON(
    docWith({ id: ID, type: "action" }, [
      { text: "Rain", marks: [{ type: "bold" }] },
    ]),
    { clientId: 9 },
  ).encodeState();
  const updates = [
    capture(loadDoc(base, { clientId: 1 }), (w) => w.deleteText(ID, 0, 4)),
    capture(loadDoc(base, { clientId: 2 }), (w) => w.insertText(ID, 1, "Rain")),
  ];
  const doc = loadDoc(base, { clientId: 3 });
  const seen: TransactionReport[] = [];
  const delivered: Update[] = [];
  const stop = observeScript(doc, (r) => seen.push(r));
  const unsubscribe = doc.subscribe((update) => delivered.push(update));
  for (const update of updates) doc.applyUpdate(update);
  stop();
  unsubscribe();
  expect(seen.map((r) => [r.origin, idsOf(r.changed)])).toEqual([
    [ORIGIN_REMOTE, [ID]],
    [ORIGIN_REMOTE, [ID]],
    [null, [ID]],
  ]);
  expect(seen.map((r) => r.update)).toEqual(delivered);
});

/** How a raw Yjs client, which no writer checks, can damage a copy of the script. */
const HOSTILE = [
  "page_at_top",
  "block_at_top",
  "page_in_section",
  "text_in_section",
  "img_in_block",
  "img_in_deleted_block",
  "dual_middle",
  "blink_mark",
  "section_attr",
] as const;
type Hostile = (typeof HOSTILE)[number];

const ORDINARY = [
  "type_text",
  "delete_text",
  "retype",
  "delete_block",
  "insert_blocks",
  "bold",
] as const;
type Ordinary = (typeof ORDINARY)[number];

interface Edit {
  kind: Hostile | Ordinary;
  /** Picks a section and a block, modulo their counts. */
  section: number;
  block: number;
}

function nth<T>(items: readonly T[], i: number): T {
  return items[i % items.length]!;
}

function rawChild(parent: Y.XmlFragment, i: number): Y.XmlElement {
  const child = nth(parent.toArray(), i);
  if (!(child instanceof Y.XmlElement)) throw new RangeError("not an element");
  return child;
}

function rawText(text: string): Y.XmlText {
  const created = new Y.XmlText();
  created.insert(0, text);
  return created;
}

function hostileEdit(fragment: Y.XmlFragment, edit: Edit, kind: Hostile): void {
  const section = rawChild(fragment, edit.section);
  const at = edit.block % section.length;
  const target = rawChild(section, at);
  const writes: Record<Hostile, () => void> = {
    page_at_top: () => fragment.insert(0, [new Y.XmlElement("page")]),
    block_at_top: () => {
      const stray = new Y.XmlElement("block");
      stray.setAttribute("id", ID_X);
      fragment.insert(fragment.length, [stray]);
    },
    page_in_section: () => section.insert(at, [new Y.XmlElement("page")]),
    text_in_section: () => section.insert(at, [rawText("loose")]),
    img_in_block: () => target.insert(0, [new Y.XmlElement("img")]),
    img_in_deleted_block: () => {
      target.insert(0, [new Y.XmlElement("img")]);
      section.delete(at, 1);
    },
    dual_middle: () => target.setAttribute("dual", "middle"),
    blink_mark: () => {
      const text = target.get(0);
      if (text instanceof Y.XmlText) text.format(0, 1, { blink: {} });
    },
    section_attr: () => section.setAttribute("x", "1"),
  };
  writes[kind]();
}

function ordinaryEdit(doc: CrdtDoc, edit: Edit, kind: Ordinary): Update {
  const ids = (scriptBody(doc).materialize().content ?? [])
    .flatMap((section) => section.content ?? [])
    .map((found) => String(found.attrs?.id));
  const id = nth(ids, edit.section + edit.block);
  const updates: Update[] = [];
  const stop = doc.subscribe((update) => updates.push(update));
  scriptBody(doc).write((w) => {
    const writes: Record<Ordinary, () => boolean> = {
      type_text: () => w.insertText(id, 1, "typed"),
      delete_text: () => w.deleteText(id, 0, 2),
      retype: () => w.setBlockAttrs(id, { type: "dialogue" }),
      delete_block: () => w.deleteBlock(id),
      insert_blocks: () =>
        w.insertBlocks(id, [block(ID_Y, "new"), block(ID_Z, "")]),
      bold: () => w.addMark(id, 0, 3, { type: "bold" }),
    };
    writes[kind]();
  });
  stop();
  // an edit of an empty block may write nothing: the empty update
  return mergeUpdates(updates);
}

function isHostile(kind: Edit["kind"]): kind is Hostile {
  return HOSTILE.some((hostile) => hostile === kind);
}

/** One update made on a copy of `doc`. */
function editOf(doc: CrdtDoc, edit: Edit): Update {
  const { kind } = edit;
  if (!isHostile(kind))
    return ordinaryEdit(
      loadDoc(doc.encodeState(), { clientId: 5 }),
      edit,
      kind,
    );
  const raw = new Y.Doc();
  raw.clientID = 6;
  Y.applyUpdate(raw, doc.encodeState());
  const updates: Uint8Array[] = [];
  raw.on("update", (update: Uint8Array) => updates.push(update));
  raw.transact(() =>
    hostileEdit(raw.getXmlFragment("prosemirror"), edit, kind),
  );
  return Y.mergeUpdates(updates);
}

const arbScript: fc.Arbitrary<DocJSON> = fc
  .array(
    fc.array(fc.constantFrom("", "Rain", "a🎬b"), {
      minLength: 1,
      maxLength: 3,
    }),
    {
      minLength: 1,
      maxLength: 3,
    },
  )
  .map((sections) => {
    let n = 0;
    return {
      type: "doc",
      content: sections.map((texts) => ({
        type: "section",
        content: texts.map((text) => block(idOf(n++), text)),
      })),
    };
  });

const arbValidDocAndUpdate = fc
  .record({
    script: arbScript,
    kind: fc.constantFrom<Edit["kind"]>(...HOSTILE, ...ORDINARY),
    section: fc.nat(5),
    block: fc.nat(5),
  })
  .map(({ script, ...edit }) => {
    const doc = scriptDocFromJSON(script, { clientId: 1 });
    return { doc, update: editOf(doc, edit) };
  });

function isStrict(issues: readonly Issue[]): boolean {
  return issues.some(
    (issue) => issue.severity === "reject" || issue.severity === "newer",
  );
}

test("what was touched validates like the whole document", () => {
  fc.assert(
    fc.property(arbValidDocAndUpdate, ({ doc, update }) => {
      const report = applyInspecting(doc, update);
      if (report === null) return;
      expect(
        isStrict(validateBlocks(report.touched(), { isIdTaken: () => false })),
      ).toBe(isStrict(validateDoc(scriptBody(doc).materializeRaw())));
    }),
    { numRuns: 500 },
  );
});

/** A script of `blocks` blocks, and a copy of it on another client. */
function longScript(blocks: number): { big: CrdtDoc; peer: CrdtDoc } {
  const big = scriptDocFromJSON(
    sectionize(
      Array.from({ length: blocks }, (_, i) => block(idOf(i), `line ${i}`)),
    ),
    { clientId: 1 },
  );
  return { big, peer: loadDoc(big.encodeState(), { clientId: 2 }) };
}

test("the cost of looking at a keystroke does not grow with the script", () => {
  const sizes = [200, 20_000].map((blocks) => {
    const { big, peer } = longScript(blocks);
    return applyInspecting(
      peer,
      capture(big, (w) => w.insertText(idOf(blocks / 2), 0, "x")),
    )!.touched().length;
  });
  expect(sizes).toEqual([1, 1]);
});

test("a block added to a long script is found without reading the script", () => {
  const { big, peer } = longScript(20_000);
  const report = applyInspecting(
    peer,
    capture(big, (w) => w.insertBlocks(idOf(10_000), [block(ID_X, "added")])),
  )!;
  expect(report.touched()).toEqual([
    {
      type: "block",
      attrs: {
        id: ID_X,
        type: "action",
        omitted: false,
        synopsis: "",
        noContd: false,
        noTiming: false,
        tags: [],
      },
      content: [{ type: "text", text: "added", marks: [] }],
    },
  ]);
  expect(report.inserted.map((i) => [i.block.attrs!.id, i.after])).toEqual([
    [ID_X, idOf(10_000)],
  ]);
});
