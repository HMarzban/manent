import { expect, test } from "bun:test";
import { createSyncService } from "@manent/server-core";
import { fakeClock, fakePeer } from "@manent/server-core/testing";
import { createMemoryStorage } from "@manent/storage/testing";
import type {
  PrompterHandle,
  PrompterStatus,
  SyncClient,
} from "@manent/sync-client";
import type { Message } from "@manent/sync-protocol";
import {
  RELAYED_CONTROL_KINDS,
  createPrompterRelay,
  relayControl,
} from "../src/index.ts";
import type { Editor, NodeRecords, UpstreamFactory } from "../src/index.ts";

const PROJECT = "11111111-1111-7111-8111-111111111111";
const RUNDOWN = "22222222-2222-7222-8222-222222222222";
const V1 = { protocol: 1, schema: 1, engine: 0, table: 0 };

function createSubscribableValue<T>(initial: T) {
  let current = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    view: {
      get: () => current,
      subscribe(fn: (v: T) => void) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
    set(next: T) {
      current = next;
      for (const fn of listeners) fn(next);
    },
  };
}

test("sent_to_prompter is relayed to windows holding the rundown", () => {
  expect(RELAYED_CONTROL_KINDS).toContain("sent_to_prompter");
  const seen: { docId: string; kind: string; data: Uint8Array }[] = [];
  const editor: Editor = {
    userId: "sam",
    docs: new Map([[RUNDOWN, 1]]),
    control(docId, kind, data) {
      seen.push({ docId, kind, data });
    },
  };
  const payload = new TextEncoder().encode('{"rowId":"r1"}');
  relayControl([editor], RUNDOWN, { kind: "sent_to_prompter", data: payload });
  expect(seen).toEqual([
    { docId: RUNDOWN, kind: "sent_to_prompter", data: payload },
  ]);
});

test("a local peer whose role is revoked while upstream is lost is evicted on the next sweep", () => {
  const fc = fakeClock(10_000);
  const storage = createMemoryStorage({ now: () => fc.clock.now() });
  const runOrder = createSubscribableValue<readonly []>([]);
  const stories = createSubscribableValue(new Map());
  const status = createSubscribableValue<PrompterStatus>({
    feed: "lost",
    lastReceivedAt: null,
  });
  let handleClosed = false;
  const fakeHandle: PrompterHandle = {
    runOrder: runOrder.view,
    stories: stories.view,
    status: status.view,
    close() {
      handleClosed = true;
    },
  };
  const fakeUpstream: UpstreamFactory = {
    create() {
      return {
        setOnline() {},
        prompter: () => fakeHandle,
        close: async () => {},
      } as unknown as SyncClient;
    },
    store() {
      throw new Error("store not used");
    },
  };
  const records = {
    person: () => ({ cloudToken: "tok" }),
  } as unknown as NodeRecords;

  let idSeq = 0;
  let sync!: ReturnType<typeof createSyncService>;
  const relay = createPrompterRelay({
    storage,
    records,
    upstream: fakeUpstream,
    sync: () => sync,
    clock: fc.clock,
    airWindowOf: () => null,
  });
  sync = createSyncService({
    storage,
    clock: fc.clock,
    defer: fc.defer,
    ids: () => `id-${++idSeq}`,
    versions: { current: V1, min: V1 },
    prompterSubscribe: relay.subscribe,
  });

  sync.access.create("sam", {
    docId: RUNDOWN,
    kind: "rundown",
    home: `project:${PROJECT}`,
  });
  storage.directory.setRole(RUNDOWN, "dana", "view", []);

  const dana = fakePeer({ userId: "dana", name: "Dana" });
  sync.attach(dana);
  sync.receive(dana, {
    type: "SUBSCRIBE",
    docId: RUNDOWN,
    generation: 0,
    mode: "prompter",
    clientIds: [],
    lastServerSeq: 0,
  });
  expect(dana.take().map((m: Message) => m.type)).toEqual(["SUBSCRIBED"]);

  // Revoke Dana locally while upstream remains lost; the 1 s sweep must evict Dana and close upstream
  storage.directory.removeRole(RUNDOWN, "dana");
  fc.advance(1_000);

  expect(dana.take()).toEqual([
    expect.objectContaining({
      type: "ERROR",
      code: 4403,
      message: "forbidden",
    }),
  ]);
  expect(handleClosed).toBe(true);
  relay.stop();
});
