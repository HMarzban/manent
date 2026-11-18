import { expect, test } from "bun:test";
import {
  createDoc,
  loadDoc,
  mergeUpdates,
  scriptBody,
  scriptDocFromJSON,
  updateMeta,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocJSON } from "@manent/schema";
import { planOutbox, waitingCount } from "../src/index.ts";
import type { OutboxItem, StoredSetting, StoredUpdate } from "../src/index.ts";

const BLOCK = "block-0000000001";

/** The update of one write, made by `fn` on `doc`. */
function capture(doc: CrdtDoc, fn: () => void): Uint8Array {
  const updates: Uint8Array[] = [];
  const stop = doc.subscribe((update) => updates.push(update));
  fn();
  stop();
  const [update] = updates;
  if (updates.length !== 1 || update === undefined)
    throw new RangeError(`the write gave ${updates.length} updates, not 1`);
  return update;
}

// what an update inserting one block holds besides the block's text
const BLOCK_UPDATE_BYTES = 150;

/** An own, unacknowledged update holding a real update of about `bytes` bytes. */
function entry(localSeq: number, bytes: number): StoredUpdate {
  const id = `block-${String(localSeq).padStart(10, "0")}`;
  const doc = createDoc({ clientId: localSeq });
  const update = capture(doc, () =>
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [
        {
          type: "block",
          attrs: { id, type: "action" },
          content: [
            {
              type: "text",
              text: "x".repeat(Math.max(1, bytes - BLOCK_UPDATE_BYTES)),
            },
          ],
        },
      ]),
    ),
  );
  return {
    kind: "update",
    localSeq,
    update,
    own: true,
    acked: false,
    applied: true,
    elements: [id],
  };
}

function setting(localSeq: number): StoredSetting {
  return {
    kind: "set",
    localSeq,
    key: "script.paper",
    value: '"a4"',
    acked: false,
  };
}

const ONE_BLOCK: DocJSON = {
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: BLOCK, type: "action" },
          content: [{ type: "text", text: "The kettle sings." }],
        },
      ],
    },
  ],
};

/** Three insertions, then two deletions of what they typed, on a replica of `base`. */
function typedThenDeletedOffline(): {
  base: Uint8Array;
  doc: CrdtDoc;
  entries: StoredUpdate[];
} {
  const base = scriptDocFromJSON(ONE_BLOCK, { clientId: 9 }).encodeState();
  const doc = loadDoc(base, { clientId: 1 });
  const body = scriptBody(doc);
  const writes = [
    () => body.write((w) => w.insertText(BLOCK, 0, "Low ")),
    () => body.write((w) => w.insertText(BLOCK, 4, "and ")),
    () => body.write((w) => w.insertText(BLOCK, 8, "then ")),
    () => body.write((w) => w.deleteText(BLOCK, 4, 4)),
    () => body.write((w) => w.deleteText(BLOCK, 0, 4)),
  ];
  const entries = writes.map((write, index): StoredUpdate => ({
    kind: "update",
    localSeq: index + 1,
    update: capture(doc, write),
    own: true,
    acked: false,
    applied: true,
    elements: [BLOCK],
  }));
  return { base, doc, entries };
}

test("the outbox goes out in order, in batches under the limits", () => {
  const items = planOutbox(
    [entry(1, 400), entry(2, 400), entry(3, 400), entry(4, 400)],
    { bytes: 1000, entries: 1024 },
  );
  expect(
    items.map((b) => [b.kind, b.clientSeq, b.kind === "push" ? b.entries : 0]),
  ).toEqual([
    ["push", 2, 2],
    ["push", 4, 2],
  ]);
  expect(
    planOutbox([entry(1, 10), entry(2, 10), entry(3, 10)], {
      bytes: 1000,
      entries: 2,
    }).map((b) => b.clientSeq),
  ).toEqual([2, 3]);
});

test("a setting travels alone, in its place, and text is never merged across it", () => {
  const items = planOutbox([
    entry(1, 10),
    entry(2, 10),
    setting(3),
    entry(4, 10),
    setting(5),
  ]);
  expect(items.map((b) => [b.kind, b.clientSeq])).toEqual([
    ["push", 2],
    ["set", 3],
    ["push", 4],
    ["set", 5],
  ]);
  expect(items[1]).toEqual({
    kind: "set",
    clientSeq: 3,
    key: "script.paper",
    value: '"a4"',
  });
});

test("an entry over the limit travels alone, and acknowledged or foreign entries are skipped", () => {
  const entries = [
    { ...entry(1, 10), acked: true },
    { ...entry(2, 10), own: false, acked: true },
    entry(3, 5000),
    entry(4, 10),
    { ...setting(5), acked: true },
  ];
  expect(
    planOutbox(entries, { bytes: 1000 }).map((b) => [b.kind, b.clientSeq]),
  ).toEqual([
    ["push", 3],
    ["push", 4],
  ]);
  expect(planOutbox([])).toEqual([]);
});

test("a lone entry is sent as it is, and a run as the merge of its entries", () => {
  const lone = entry(1, 10);
  const run = [entry(2, 10), entry(3, 10)];
  const [sent] = planOutbox([lone]);
  expect(sent).toEqual({
    kind: "push",
    clientSeq: 1,
    update: lone.update,
    entries: 1,
  });
  expect(sent?.kind === "push" && sent.update).toBe(lone.update);
  expect(planOutbox(run)).toEqual([
    {
      kind: "push",
      clientSeq: 3,
      update: mergeUpdates(run.map((e) => e.update)),
      entries: 2,
    },
  ]);
});

test("a batch is the same edits as its entries, including text typed and deleted", () => {
  const { base, doc, entries } = typedThenDeletedOffline();
  const [batch] = planOutbox(entries) as [
    Extract<OutboxItem, { kind: "push" }>,
  ];
  const peer = loadDoc(base);
  peer.applyUpdate(batch.update);
  expect(scriptBody(peer).materialize()).toEqual(scriptBody(doc).materialize());
  // the insertions travel, though nothing of them is visible
  expect(updateMeta(batch.update)).toEqual(
    updateMeta(mergeUpdates(entries.map((e) => e.update))),
  );
  expect(updateMeta(batch.update)).toEqual([
    { clientId: 1, fromClock: 0, toClock: 13 },
  ]);
});

test("an update that came from elsewhere is never sent, nor counted as waiting", () => {
  const foreign = [{ ...entry(1, 10), own: false }];
  expect([planOutbox(foreign), waitingCount(foreign)]).toEqual([[], 0]);
});

test("waiting counts edited elements once each, and each waiting setting", () => {
  expect(
    waitingCount([
      { ...entry(1, 1), elements: ["a", "b"] },
      { ...entry(2, 1), elements: ["b"] },
      { ...entry(3, 1), elements: ["c"], acked: true },
      setting(4),
    ]),
  ).toBe(3);
});
