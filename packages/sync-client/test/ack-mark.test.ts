import { afterEach, beforeEach, expect, test } from "bun:test";
import { clearMarks, readMarks, setMarksEnabled } from "@manent/perf";
import { CODE } from "@manent/sync-protocol";
import { DOC, setup, type, utf8 } from "./scripted-server.ts";

beforeEach(() => {
  setMarksEnabled(true);
  clearMarks();
});

afterEach(() => {
  clearMarks();
  setMarksEnabled(false);
});

const acks = (): string[] => readMarks("sync.ack").map((r) => r.name);

test("each acknowledged push is one sync.ack record, and a refused push records none", async () => {
  const w = await setup();
  const h = await w.makeClient().open(DOC);
  await w.online();
  for (const text of ["a", "b", "c"]) {
    type(h, text);
    await w.settle();
    w.server.ackAll(DOC);
    await w.settle();
  }
  const acknowledged = acks();
  type(h, "d");
  await w.settle();
  w.server.error(DOC, {
    code: CODE.TOO_LARGE,
    message: "too_large",
    permanent: true,
    clientSeq: 4,
  });
  await w.settle();
  // an answer that still comes for the refused push finds no time to record
  w.server.ack(DOC, 4, 9);
  await w.settle();
  expect([acknowledged, acks()]).toEqual([
    ["sync.ack", "sync.ack", "sync.ack"],
    ["sync.ack", "sync.ack", "sync.ack"],
  ]);
});

test("a push whose connection closed before its answer records none", async () => {
  const w = await setup();
  const h = await w.makeClient().open(DOC);
  await w.online();
  type(h, "a");
  await w.settle();
  w.network.partition(true);
  await w.settle();
  // the new connection is not answered, so the push is not sent again
  w.server.answer.subscribe = false;
  w.network.partition(false);
  w.fake.advance(30_000);
  await w.settle();
  w.server.ack(DOC, 1, 9);
  await w.settle();
  expect([w.server.got("PUSH").length, acks()]).toEqual([1, []]);
});

test("a push the node refused upstream records none", async () => {
  const w = await setup();
  const h = await w.makeClient().open(DOC);
  await w.online();
  type(h, "a");
  await w.settle();
  w.server.send({
    type: "CONTROL",
    docId: DOC,
    generation: 1,
    seq: 0,
    kind: "upstream_refused",
    data: utf8('{"clientSeq":1,"message":"locked"}'),
  });
  await w.settle();
  w.server.ack(DOC, 1, 9);
  await w.settle();
  expect(acks()).toEqual([]);
});
