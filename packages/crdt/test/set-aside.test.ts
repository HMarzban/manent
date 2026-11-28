import { expect, test } from "bun:test";
import { sectionize } from "@manent/schema";
import * as Y from "yjs";
import {
  CrdtUpdateError,
  applyRemote,
  blockIds,
  deletionsOf,
  loadDoc,
  observeScript,
  scriptBody,
  updateMeta,
  yXmlFragmentForBinding,
} from "../src/index.ts";
import type { CrdtDoc } from "../src/index.ts";
import {
  ID_A,
  ID_B,
  block,
  capture,
  textOf,
  twoReplicasOf,
} from "./helpers.ts";

const ID_K = "k".repeat(16);

/** Two replicas of a line and a keeper, and the second one's own client ids. */
function replicas(): { a: CrdtDoc; b: CrdtDoc; own: Set<number> } {
  const [a, b] = twoReplicasOf(
    sectionize([block(ID_A, "only line"), block(ID_K, "keeper")]),
  );
  return { a, b, own: new Set([b.clientId]) };
}

test("text typed into a block someone deleted at the same moment is set aside", () => {
  const { a, b, own } = replicas();
  const ua = capture(a, (w) => w.deleteBlock(ID_A));
  scriptBody(b).write((w) => w.insertText(ID_A, 4, " typed"));
  expect(applyRemote(b, ua, own)).toEqual([
    { blockId: ID_A, nearBlockId: ID_K, text: " typed" },
  ]);
  expect(blockIds(b)).toEqual([ID_K]);
});

test("text someone had seen and then deleted is not", () => {
  const { a, b, own } = replicas();
  const ub = capture(b, (w) => w.insertText(ID_A, 4, " typed"));
  a.applyUpdate(ub);
  expect(
    applyRemote(
      b,
      capture(a, (w) => w.deleteBlock(ID_A)),
      own,
    ),
  ).toEqual([]);
});

test("a block inserted into a section a peer emptied is set aside whole", () => {
  const [p, q] = twoReplicasOf(sectionize([block(ID_A, "only line")]));
  const up = capture(p, (w) => w.deleteBlock(ID_A));
  scriptBody(q).write((w) =>
    w.insertBlocks(ID_A, [block(ID_B, "typed at the same moment")]),
  );
  expect(applyRemote(q, up, new Set([q.clientId]))).toEqual([
    { blockId: ID_B, nearBlockId: null, text: "typed at the same moment" },
  ]);
});

test("the nearest surviving block is the one before, else the one after, across sections", () => {
  const cases = [
    { sections: [[ID_K, ID_A]], near: ID_K },
    { sections: [[ID_K], [ID_A]], near: ID_K },
    { sections: [[ID_A], [ID_K]], near: ID_K },
  ];
  const found = cases.map(({ sections }) => {
    const [p, q] = twoReplicasOf({
      type: "doc",
      content: sections.map((ids) => ({
        type: "section",
        content: ids.map((id) => block(id, id === ID_A ? "line" : "keeper")),
      })),
    });
    const up = capture(p, (w) => w.deleteBlock(ID_A));
    scriptBody(q).write((w) => w.insertText(ID_A, 0, "typed "));
    return applyRemote(q, up, new Set([q.clientId])).map(
      (item) => item.nearBlockId,
    );
  });
  expect(found).toEqual(cases.map(({ near }) => [near]));
});

test("offline text meets a merge that removed its block", () => {
  const { a, b, own } = replicas();
  scriptBody(b).write((w) => w.insertText(ID_A, 0, "OFFLINE "));
  scriptBody(a).write((w) => w.deleteBlock(ID_A));
  expect(applyRemote(b, a.diff(b.encodeStateVector()), own)).toEqual([
    { blockId: ID_A, nearBlockId: ID_K, text: "OFFLINE " },
  ]);
});

test("own text the server holds goes with a block its deleter never saw it in: the deletions alone set it aside", () => {
  const { a, b, own } = replicas();
  const server = loadDoc(a.encodeState(), { clientId: 3 });
  const typed = capture(b, (w) => w.insertText(ID_A, 9, " [b]"));
  const deleted = capture(a, (w) => w.deleteBlock(ID_A));
  server.applyUpdate(typed);
  server.applyUpdate(deleted);
  const deletions = deletionsOf([typed, deleted]);
  if (deletions === null) throw new RangeError("the updates deleted nothing");
  const setAside = [
    applyRemote(b, deletions, own),
    applyRemote(b, server.diff(b.encodeStateVector()), own),
  ];
  expect(setAside).toEqual([
    [{ blockId: ID_A, nearBlockId: ID_K, text: " [b]" }],
    [],
  ]);
  expect(b.encodeStateVector()).toEqual(server.encodeStateVector());
  expect(blockIds(b)).toEqual([ID_K]);
});

test("the deletions of updates carry none of their text, and are nothing when nothing was deleted", () => {
  const { a } = replicas();
  const typed = capture(a, (w) => w.insertText(ID_A, 0, "new "));
  const deleted = capture(a, (w) => w.deleteText(ID_A, 0, 4));
  const deletions = deletionsOf([typed, deleted]);
  if (deletions === null) throw new RangeError("the updates deleted nothing");
  expect([deletionsOf([typed]), updateMeta(deletions)]).toEqual([null, []]);
  const { b } = replicas();
  b.applyUpdate(typed);
  b.applyUpdate(deletions);
  expect(textOf(b, ID_A)).toBe("only line");
});

test("typing beside a deleted range survives and is not reported", () => {
  const { a, b, own } = replicas();
  const ua = capture(a, (w) => w.deleteText(ID_A, 0, 9));
  scriptBody(b).write((w) => w.insertText(ID_A, 4, "XYZ"));
  expect(applyRemote(b, ua, own)).toEqual([]);
  expect(textOf(b, ID_A)).toBe("XYZ");
});

test("set-aside text is whole characters in document order", () => {
  const { a, b, own } = replicas();
  scriptBody(b).write((w) => w.insertText(ID_A, 9, " 🎬 مرحبا é"));
  scriptBody(b).write((w) => w.insertText(ID_A, 0, "أول "));
  const [item] = applyRemote(
    b,
    capture(a, (w) => w.deleteBlock(ID_A)),
    own,
  );
  expect(item!.text).toBe("أول  🎬 مرحبا é");
});

test("half of a character the sender deleted knowingly is never set aside", () => {
  const cases = [
    // a high surrogate the sender saw, then its low half typed after it
    { seen: [9, "\uD83C"], unseen: [10, "\uDFACok"] },
    // a low surrogate the sender saw, then its high half typed before it
    { seen: [9, "\uDFAC"], unseen: [9, "ok\uD83C"] },
  ] as const;
  const kept = cases.map(({ seen, unseen }) => {
    const { a, b, own } = replicas();
    a.applyUpdate(capture(b, (w) => w.insertText(ID_A, seen[0], seen[1])));
    scriptBody(b).write((w) => w.insertText(ID_A, unseen[0], unseen[1]));
    return applyRemote(
      b,
      capture(a, (w) => w.deleteBlock(ID_A)),
      own,
    ).map((item) => item.text);
  });
  expect(kept).toEqual([["ok"], ["ok"]]);
});

test("text from two texts of one block keeps their order", () => {
  const { a, b, own } = replicas();
  scriptBody(b).write((w) => w.insertText(ID_A, 9, " end"));
  const [section] = yXmlFragmentForBinding(b).toArray();
  const line = section instanceof Y.XmlElement ? section.get(0) : null;
  if (!(line instanceof Y.XmlElement)) throw new RangeError("no block");
  const start = new Y.XmlText();
  start.insert(0, "start ");
  line.insert(0, [start]);
  const [item] = applyRemote(
    b,
    capture(a, (w) => w.deleteBlock(ID_A)),
    own,
  );
  expect(item!.text).toBe("start  end");
});

test("someone else's lost text is theirs to report", () => {
  const { a, b } = replicas();
  scriptBody(b).write((w) => w.insertText(ID_A, 4, " typed"));
  expect(
    applyRemote(
      b,
      capture(a, (w) => w.deleteBlock(ID_A)),
      new Set([999]),
    ),
  ).toEqual([]);
});

test("an update that arrives after the delete is caught too", () => {
  const { a, b, own } = replicas();
  const late = capture(b, (w) => w.insertText(ID_A, 4, " typed"));
  const c = loadDoc(a.encodeState(), { clientId: 3 });
  c.applyUpdate(capture(a, (w) => w.deleteBlock(ID_A)));
  // Yjs collected the deleted block before the update came: where the text was is no longer known
  expect(applyRemote(c, late, own)).toEqual([
    { blockId: null, nearBlockId: null, text: " typed" },
  ]);
});

test("bytes that are not an update are refused and change nothing", () => {
  const { b, own } = replicas();
  const before = b.encodeState();
  expect(() => applyRemote(b, new Uint8Array([1, 2, 3]), own)).toThrow(
    CrdtUpdateError,
  );
  expect(b.encodeState()).toEqual(before);
});

test("relaying a block deletion onto a replica that already holds unseen text keeps the delete set free of that text", () => {
  const { a, b, own } = replicas();
  const relay = loadDoc(a.encodeState(), { clientId: 3 });
  // b inserts unseen text and sends it to the relay before a's delete arrives
  const typed = capture(b, (w) => w.insertText(ID_A, 9, " unseen"));
  relay.applyUpdate(typed);
  // a deletes the block without having seen b's text
  const deleted = capture(a, (w) => w.deleteBlock(ID_A));
  const emitted: Uint8Array[] = [];
  const stop = observeScript(relay, (report) => emitted.push(report.update));
  relay.applyUpdate(deleted, "relay");
  stop();
  expect(emitted).toHaveLength(1);
  // b receiving the relayed update must still recognise its unseen text and set it aside
  expect(applyRemote(b, emitted[0]!, own)).toEqual([
    { blockId: ID_A, nearBlockId: ID_K, text: " unseen" },
  ]);
});

test("resolving pre-existing pending structs with a custom origin emits all newly integrated structs in report.update", () => {
  const { a } = replicas();
  const relay = loadDoc(a.encodeState(), { clientId: 3 });
  const follower = loadDoc(a.encodeState(), { clientId: 4 });
  const first = capture(a, (w) => w.insertText(ID_A, 9, " one"));
  const second = capture(a, (w) => w.insertText(ID_A, 13, " two"));

  // Apply second before first so relay holds pending structs.
  relay.applyUpdate(second, "relay");
  expect(relay.hasPendingStructs()).toBe(true);

  const emitted: Uint8Array[] = [];
  const stop = observeScript(relay, (report) => emitted.push(report.update));
  relay.applyUpdate(first, "relay");
  stop();

  expect(relay.hasPendingStructs()).toBe(false);
  expect(emitted).toHaveLength(1);
  follower.applyUpdate(emitted[0]!);
  expect(scriptBody(follower).materialize()).toEqual(
    scriptBody(relay).materialize(),
  );
});
