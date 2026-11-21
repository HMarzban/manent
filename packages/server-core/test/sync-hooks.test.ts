import { expect, test } from "bun:test";
import type { Issue } from "@manent/schema";
import type { LockAnchorRecord, Message } from "@manent/sync-protocol";
import { DEFAULT_LIMITS, OWNER_CAPABILITIES } from "../src/index.ts";
import type { SubscribedExtras, SyncHooks } from "../src/index.ts";
import { BLOCK, DOC, HOME, createTypist } from "./seed.ts";
import {
  DANA_CLIENT,
  SAM_CLIENT,
  createServiceWorld,
  push,
  subscribe,
} from "./service-world.ts";

const ANCHOR: LockAnchorRecord = {
  level: 1,
  order: 1,
  label: "2",
  blockId: BLOCK,
  offset: 0,
  quote: "Rain",
  fallbackIds: [],
  source: "lock",
};

const EXTRAS: SubscribedExtras = {
  lockLevel: 1,
  lockAnchors: [ANCHOR],
  revision: { setId: "s1", baselineVersionId: "v1" },
};

/** A hook that writes each event it is told into `log`, under its own name. */
function spy(name: string, log: string[]): SyncHooks {
  return {
    committed: ({ room, sender, seq }) =>
      log.push(`${name} committed ${room.docId} ${sender?.userId} ${seq}`),
    editorLeft: (room, userId) =>
      log.push(`${name} left ${room.docId} ${userId}`),
    forgotten: (room) => log.push(`${name} forgot ${room.docId}`),
  };
}

const subscribedIn = (messages: Message[]): Message | undefined =>
  messages.find((m) => m.type === "SUBSCRIBED");

/** Sam's SUBSCRIBED to the empty DOC, with these lock and revision fields. */
const subscribedWith = (
  fields: Pick<
    Extract<Message, { type: "SUBSCRIBED" }>,
    "lockLevel" | "lockAnchors" | "revision"
  >,
): Message => ({
  type: "SUBSCRIBED",
  docId: DOC,
  generation: 1,
  role: "owner",
  capabilities: [...OWNER_CAPABILITIES],
  headSeq: 0,
  minSchemaVersion: 1,
  engineVersion: 0,
  ...fields,
  airWindow: null,
});

test("the service tells every hook what it committed, who left, and what it forgot", () => {
  const log: string[] = [];
  const { service, sam, clock } = createServiceWorld({
    hooks: [spy("a", log), spy("b", log)],
  });
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  service.receive(
    sam,
    push(DOC, 1, createTypist(SAM_CLIENT).insertBlock(BLOCK, null, "Rain")),
  );
  clock.runDeferred();
  expect(log).toEqual([`a committed ${DOC} sam 1`, `b committed ${DOC} sam 1`]);
  service.receive(sam, { type: "UNSUBSCRIBE", docId: DOC, generation: 1 });
  expect(log.slice(2)).toEqual([`a left ${DOC} sam`, `b left ${DOC} sam`]);
  clock.advance(DEFAULT_LIMITS.roomIdleMs);
  expect(log.slice(4)).toEqual([`a forgot ${DOC}`, `b forgot ${DOC}`]);
});

test("SUBSCRIBED carries the first lock fields a hook gives", () => {
  const asked: string[] = [];
  const { service, sam } = createServiceWorld({
    hooks: [
      {
        subscribed(docId) {
          asked.push(`a ${docId}`);
          return null;
        },
      },
      {
        subscribed(docId) {
          asked.push(`b ${docId}`);
          return EXTRAS;
        },
      },
      {
        subscribed(docId) {
          asked.push(`c ${docId}`);
          return { lockLevel: 2, lockAnchors: null, revision: null };
        },
      },
    ],
  });
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  expect(subscribedIn(sam.take())).toEqual(
    subscribedWith({
      lockLevel: 1,
      lockAnchors: { table: [ANCHOR] },
      revision: { setId: "s1", baselineVersionId: "v1" },
    }),
  );
  expect(asked).toEqual([`a ${DOC}`, `b ${DOC}`]);

  const plain = createServiceWorld();
  plain.service.receive(plain.sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  expect(subscribedIn(plain.sam.take())).toEqual(
    subscribedWith({ lockLevel: 0, lockAnchors: null, revision: null }),
  );
});

test("a push a hook refuses is answered invalid", () => {
  const refusal: Issue = {
    path: "blocks.0",
    code: "unknown_node",
    severity: "reject",
    message: "a locked page start was moved",
  };
  const asked: string[] = [];
  const { service, sam, clock, storage } = createServiceWorld({
    hooks: [
      {
        checkPush(room, report) {
          asked.push(
            `${room.docId} ${report.inserted.map((i) => i.block.attrs?.id).join(",")}`,
          );
          return [refusal];
        },
      },
    ],
  });
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  sam.take();
  service.receive(
    sam,
    push(DOC, 1, createTypist(SAM_CLIENT).insertBlock(BLOCK, null, "Rain")),
  );
  clock.runDeferred();
  expect(asked).toEqual([`${DOC} ${BLOCK}`]);
  expect(sam.take()).toEqual([
    {
      type: "ERROR",
      code: 4422,
      message: "invalid",
      retryAfterMs: null,
      permanent: true,
      doc: { docId: DOC, generation: 1 },
      clientSeq: 1,
    },
  ]);
  expect(storage.open(HOME).log.get(DOC)?.headSeq).toBe(0);
});

test("a broadcast reaches every editor and viewer of a loaded room, and nothing else", () => {
  const { service, sam, dana, ana, leo, clock } = createServiceWorld();
  const data = new TextEncoder().encode('{"kind":"restored"}');
  // a viewer alone holds the room without loading it
  service.receive(leo, subscribe(DOC, "view", []));
  leo.take();
  service.broadcast(DOC, "restored", data);
  expect(leo.take()).toEqual([]);
  service.receive(sam, subscribe(DOC, "edit", [SAM_CLIENT]));
  service.receive(dana, subscribe(DOC, "edit", [DANA_CLIENT]));
  service.receive(
    sam,
    push(DOC, 1, createTypist(SAM_CLIENT).insertBlock(BLOCK, null, "Rain")),
  );
  clock.runDeferred();
  for (const peer of [sam, dana, leo, ana]) peer.take();
  service.broadcast(DOC, "restored", data);
  const control: Message = {
    type: "CONTROL",
    docId: DOC,
    generation: 1,
    seq: 1,
    kind: "restored",
    data,
  };
  expect(sam.take()).toEqual([control]);
  expect(dana.take()).toEqual([control]);
  expect(leo.take()).toEqual([control]);
  expect(ana.take()).toEqual([]);
});
