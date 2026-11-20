import { expect, test } from "bun:test";
import { createDoc, scriptBody } from "@manent/crdt";
import type { BlockWriter, CrdtDoc } from "@manent/crdt";
import { createMemoryStorage } from "@manent/storage/testing";
import { encodeReplayUpdates } from "@manent/sync-protocol";
import type { Message } from "@manent/sync-protocol";
import { createServer } from "../src/index.ts";
import type { ManentServer } from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import { makeConfig } from "./config.ts";
import { DOC, PROJECT } from "./seed.ts";
import { EMPTY_VECTOR } from "./service-world.ts";

const B1 = "b000000000000001";
const KEY = "00112233445566778899aabbccddeeff";
const OTHER_KEY = "ffeeddccbbaa99887766554433221100";
const ANA_CLIENT = 3003;

/** The one update `write` makes to `doc`. */
function written(
  doc: CrdtDoc,
  write: (writer: BlockWriter) => void,
): Uint8Array {
  const made: Uint8Array[] = [];
  const stop = doc.subscribe((update) => made.push(update));
  scriptBody(doc).write(write);
  stop();
  const [update] = made;
  if (update === undefined) throw new RangeError("the write changed nothing");
  return update;
}

async function post(
  server: ManentServer,
  body: string,
  token: string | null,
): Promise<[number, unknown]> {
  const headers: Record<string, string> =
    token === null ? {} : { Authorization: `Bearer ${token}` };
  const response = await server.fetch(
    new Request("http://127.0.0.1:4747/api/docs/replay", {
      method: "POST",
      headers,
      body,
    }),
    { remoteAddress: "127.0.0.1", upgrade: () => false },
  );
  if (response === null) throw new TypeError("the replay was upgraded");
  return [response.status, await response.json()];
}

/**
 * Ana wrote B1 in generation 1 and went on offline; the document has since been rebuilt. Every
 * commit happens in the turn that asks for it.
 */
function rebuiltServer() {
  const clock = fakeClock(1_000);
  const storage = createMemoryStorage({ now: () => clock.clock.now() });
  const config = makeConfig({
    sync: {
      storage,
      clock: clock.clock,
      defer: (fn) => fn(),
      limits: {
        rebuildClientIds: 0,
        checkpointEvery: 1,
        replayBodyBytes: 4096,
      },
    },
  });
  const server = createServer(config);
  const service = server.sync;
  if (service === null) throw new RangeError("the server serves no document");
  const ana = fakePeer({ userId: "ana", name: "Ana Costa" });
  service.attach(ana);
  service.access.create("ana", {
    docId: DOC,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  const join: Message[] = [
    {
      type: "SUBSCRIBE",
      docId: DOC,
      generation: 0,
      mode: "edit",
      clientIds: [ANA_CLIENT],
      lastServerSeq: 0,
    },
    {
      type: "SYNC",
      docId: DOC,
      generation: 1,
      step: "step1",
      data: EMPTY_VECTOR,
    },
  ];
  for (const message of join) service.receive(ana, message);
  const doc = createDoc({ clientId: ANA_CLIENT });
  const update = written(doc, (w) =>
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id: B1, type: "action" },
        content: [{ type: "text", text: "Rain." }],
      },
    ]),
  );
  service.receive(ana, {
    type: "PUSH",
    docId: DOC,
    generation: 1,
    clientSeq: 1,
    update,
    heal: false,
  });
  const offline = written(doc, (w) => w.insertText(B1, 0, "Night. "));
  clock.advance(10_000);
  const body = (key: string): string =>
    JSON.stringify({
      docId: DOC,
      generation: 1,
      lastServerSeq: 1,
      key,
      updates: encodeReplayUpdates([offline]),
    });
  return { server, clock, body, token: config.auth.sessions.issue("ana") };
}

test("the replay route answers as its table says", async () => {
  const { server, clock, body, token } = rebuiltServer();
  expect(await post(server, body(KEY), token)).toEqual([
    200,
    {
      docId: DOC,
      generation: 2,
      serverSeq: 2,
      applied: 1,
      overlaps: [],
      setAside: [],
    },
  ]);
  expect(await post(server, body(OTHER_KEY), null)).toEqual([
    401,
    { error: "unauthenticated" },
  ]);
  expect(await post(server, "{not json", token)).toEqual([
    400,
    { error: "bad_request" },
  ]);
  expect(await post(server, "x".repeat(4097), token)).toEqual([
    413,
    { error: "too_large" },
  ]);
  clock.advance(7_776_000_001);
  expect(await post(server, body(OTHER_KEY), token)).toEqual([
    409,
    { error: "past_window" },
  ]);
  const unsynced = createServer(makeConfig());
  expect(await post(unsynced, body(KEY), token)).toEqual([
    404,
    { error: "not_found" },
  ]);
});
