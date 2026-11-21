// Restoring a whole script on the server after edits, at 120 pages here and at 2,000 in its
// sibling; and the world every server history scenario runs in: the sync service with the
// history service among its hooks.
import { loadDoc, scriptBody } from "@manent/crdt";
import { ENGINE_VERSION, TABLE_VERSION } from "@manent/pagination";
import { corpusDoc, generateBlocks } from "@manent/pagination/testing";
import { canonicalBlocksOf } from "@manent/revisions";
import { SCHEMA_VERSION } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { createHistoryService, createSyncService } from "@manent/server-core";
import type { HistoryService, SyncService } from "@manent/server-core";
import { fakeClock } from "@manent/server-core/testing";
import type { Storage } from "@manent/storage";
import { createMemoryStorage } from "@manent/storage/testing";
import { FRAME, PROTOCOL_VERSION } from "@manent/sync-protocol";
import type { Message, PreparedMessage } from "@manent/sync-protocol";
import type { Measurement, Scenario } from "../../harness.ts";
import {
  EMPTY_VECTOR,
  HOME,
  OWNER,
  createBenchPeer,
  docIdOf,
  joinAsEditor,
  placeScript,
  scriptOfPages,
  stateOf,
} from "../support.ts";

/** Who types in the history scenarios; OWNER restores and saves. */
export const WRITER = "leo";
/** 1 June 2027, midnight UTC. */
export const T0 = 1_811_808_000_000;
/** No connection is ever slowed down: the edits of a scenario arrive at once. */
const OPEN_LIMITS = {
  framesPerSecond: 1e9,
  frameBurst: 1e9,
  bytesPerSecond: 1e12,
  byteBurst: 1e12,
};

/** One person's connection, editing a replica of the script as the server held it when they joined. */
interface Editor {
  /** One character typed at the start of each block, each its own PUSH; resolves once every one is acknowledged. */
  type(blockIds: readonly string[]): Promise<void>;
  /** Resolves at the next CONTROL the room sends this connection. */
  control(): Promise<void>;
  leave(): void;
}

interface HistoryWorld {
  readonly docId: string;
  readonly history: HistoryService;
  /** Every block id of the script, in order. */
  readonly blockIds: readonly string[];
  /** `userId` joins the script as an editor under `clientId`. */
  join(userId: string, clientId: number): Editor;
}

const ids = (): string => crypto.randomUUID();

/** The idempotency key of the n-th request a scenario makes. */
export const keyOf = (n: number): string => n.toString(16).padStart(32, "0");

function joined(
  service: SyncService,
  docId: string,
  person: { userId: string; clientId: number },
): Editor {
  const { clientId } = person;
  let state: Uint8Array | null = null;
  let acked = 0;
  /** Settles with null once `seq` is acknowledged, or with the refusal that came first. */
  let awaiting: { seq: number; settle(refusal: string | null): void } | null =
    null;
  let told: (() => void) | null = null;
  const heard = (message: Message | PreparedMessage): void => {
    if ("body" in message) {
      if (message.type === FRAME.CONTROL) told?.();
      return;
    }
    if (message.type === "SYNC" && message.step === "step2")
      state = message.data;
    if (message.type === "ACK") acked = message.clientSeq;
    if (message.type === "ERROR") awaiting?.settle(message.message);
    else if (awaiting !== null && acked >= awaiting.seq) awaiting.settle(null);
  };
  const peer = createBenchPeer(person.userId, heard);
  joinAsEditor(service, peer, { docId, clientId, vector: EMPTY_VECTOR });
  if (state === null) throw new Error(`${person.userId} was sent no state`);
  const replica = loadDoc(state, { clientId });
  const body = scriptBody(replica);
  let clientSeq = 0;
  // each typed character is pushed as the update it made
  replica.subscribe((update) => {
    clientSeq += 1;
    service.receive(peer, {
      type: "PUSH",
      docId,
      generation: 1,
      clientSeq,
      update,
      heal: false,
    });
  });
  return {
    async type(blockIds) {
      for (const blockId of blockIds)
        body.write((w) => w.insertText(blockId, 0, "x"));
      const seq = clientSeq;
      const refusal =
        acked >= seq
          ? null
          : await new Promise<string | null>((settle) => {
              awaiting = { seq, settle };
            });
      awaiting = null;
      if (refusal !== null) throw new Error(`an edit was refused: ${refusal}`);
    },
    control: () =>
      new Promise<void>((resolve) => {
        told = resolve;
      }),
    leave() {
      service.receive(peer, { type: "UNSUBSCRIBE", docId, generation: 1 });
    },
  };
}

/** `script` placed by OWNER, which WRITER may edit, served with its history kept in `storage`. */
export function createHistoryWorld(options: {
  script: DocJSON;
  storage?: Storage;
}): HistoryWorld {
  const { clock } = fakeClock(T0);
  const storage = options.storage ?? createMemoryStorage({ now: clock.now });
  const versions = {
    protocol: PROTOCOL_VERSION,
    schema: SCHEMA_VERSION,
    engine: ENGINE_VERSION,
    table: TABLE_VERSION,
  };
  const history = createHistoryService({
    sync: () => service,
    storage,
    clock,
    ids,
  });
  const service = createSyncService({
    storage,
    clock,
    defer: setImmediate,
    ids,
    versions: { current: versions, min: versions },
    limits: OPEN_LIMITS,
    hooks: [history],
  });
  const docId = docIdOf(0);
  const state = stateOf(options.script);
  placeScript(service, storage, {
    docId,
    home: HOME,
    state,
    editors: [WRITER],
  });
  return {
    docId,
    history,
    blockIds: canonicalBlocksOf(options.script).map((b) => String(b.attrs?.id)),
    join: (userId, clientId) => joined(service, docId, { userId, clientId }),
  };
}

/** `count` of `blockIds`, spread evenly through them. */
export function spread(blockIds: readonly string[], count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => blockIds[Math.floor((i * blockIds.length) / count)]!,
  );
}

const RESTORES = {
  120: { script: () => scriptOfPages(120), edits: 220, workload: "W1" },
  2000: {
    script: () => corpusDoc(generateBlocks("screenplay", 45_000, 7)),
    edits: 2_000,
    workload: "W7",
  },
} as const;

async function restoreTimes(
  pages: keyof typeof RESTORES,
  samples: number,
): Promise<number[]> {
  const { script, edits } = RESTORES[pages];
  const world = createHistoryWorld({ script: script() });
  const { docId, history } = world;
  const saved = await history.save(OWNER, {
    docId,
    key: keyOf(0),
    kind: "saved",
  });
  if (!saved.ok) throw new Error(`the version was refused: ${saved.code}`);
  const versionId = saved.value.version.id;
  const edited = spread(world.blockIds, edits);
  const times: number[] = [];
  let typist: Editor | null = null;
  for (let n = 1; n <= samples; n++) {
    // the next typist joins before the last leaves, so the writer's session never ends
    const next = world.join(WRITER, 1000 + n);
    typist?.leave();
    typist = next;
    await typist.type(edited);
    const start = performance.now();
    const restored = await history.restore(OWNER, {
      docId,
      key: keyOf(n),
      versionId,
      scope: { kind: "script" },
    });
    times.push(performance.now() - start);
    if (!restored.ok)
      throw new Error(`the restore was refused: ${restored.code}`);
  }
  return times;
}

/**
 * `restore_ms`: `samples` restores (default 3) of a whole script of `pages` pages, through the
 * history service, each after 220 edits at 120 pages or 2,000 at 2,000, one block each.
 */
export function restoreScenario(options: {
  pages: keyof typeof RESTORES;
  samples?: number;
}): Scenario {
  const { pages, samples = 3 } = options;
  return {
    id: `history.restore.${pages}`,
    workload: RESTORES[pages].workload,
    processes: 5,
    run: async (): Promise<Measurement[]> => [
      {
        metric: "restore_ms",
        unit: "ms",
        samples: await restoreTimes(pages, samples),
      },
    ],
  };
}

export default restoreScenario({ pages: 120 });
