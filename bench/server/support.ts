// What the server scenarios share: scripts of a chosen size, the sync service in this process with
// peers that frame what they are sent, keystrokes, and a script shared on a running test server.
import { join } from "node:path";
import {
  loadDoc,
  scriptBody,
  scriptDocFromJSON,
  updateMeta,
} from "@manent/crdt";
import {
  ENGINE_VERSION,
  TABLE_VERSION,
  paginate,
  profileFor,
} from "@manent/pagination";
import {
  corpusDoc,
  generateBlocks,
  layoutBlocksOf,
} from "@manent/pagination/testing";
import type { CorpusBlock } from "@manent/pagination/testing";
import { SCHEMA_VERSION } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { createSyncService } from "@manent/server-core";
import type {
  Checkpointer,
  Clock,
  Peer,
  SyncService,
} from "@manent/server-core";
import { openSqliteStorage } from "@manent/storage";
import type { Home, Storage } from "@manent/storage";
import {
  PROTOCOL_VERSION,
  createFrameEncoder,
  createMessageIds,
  docIdV7,
} from "@manent/sync-protocol";
import type {
  Message,
  PreparedMessage,
  VersionSet,
} from "@manent/sync-protocol";
import type { TestServer } from "@manent/testkit";

const VERSIONS: VersionSet = Object.freeze({
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: ENGINE_VERSION,
  table: TABLE_VERSION,
});

/** The owner of every script a scenario places. */
export const OWNER = "dana";
export const HOME: Home = Object.freeze({
  kind: "project",
  id: "5d2a9c41-7e36-4b80-9f15-c3a8e06b72d9",
});
/** The state vector of an empty document. */
export const EMPTY_VECTOR = new Uint8Array([0]);
const NO_RANDOM = new Uint8Array(10);
const POLL_MS = 10;

/** The id of the n-th script a scenario places, from 0. */
export function docIdOf(n: number): string {
  return docIdV7(n + 1, NO_RANDOM);
}

/** Resolves once `condition` holds, checking every 10 ms; rejects after `timeoutMs`. */
export async function until(
  condition: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline)
      throw new Error(`the condition did not hold within ${timeoutMs} ms`);
    await delay(POLL_MS);
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The fewest blocks of the seeded screenplay corpus that paginate on Letter to `pages` pages, as a
 * script. The corpus grows by appending, so the page count never falls as blocks are added and the
 * count can be bisected. RangeError for a count that is not a positive integer.
 */
export function scriptOfPages(pages: number): DocJSON {
  if (!Number.isInteger(pages) || pages < 1)
    throw new RangeError(
      `a script needs a positive whole number of pages, not ${pages}`,
    );
  const profile = profileFor("screenplay");
  if (profile === null) throw new Error("no screenplay profile");
  const pagesOf = (blocks: readonly CorpusBlock[]): number =>
    paginate(layoutBlocksOf(blocks), profile).pages.length;
  let high = 1;
  while (pagesOf(generateBlocks("screenplay", high, 1)) < pages) high *= 2;
  const blocks = generateBlocks("screenplay", high, 1);
  // the fewest blocks that give `pages` pages are more than `low` and at most `high`
  let low = Math.floor(high / 2);
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (pagesOf(blocks.slice(0, mid)) < pages) low = mid;
    else high = mid;
  }
  return corpusDoc(blocks.slice(0, high));
}

/** The encoded state of `script`, as one update a log can hold. */
export function stateOf(script: DocJSON): Uint8Array {
  const doc = scriptDocFromJSON(script);
  const state = doc.encodeState();
  doc.destroy();
  return state;
}

/** The sync service over `storage`, speaking this build's versions. */
export function createBenchService(options: {
  storage: Storage;
  clock: Clock;
  defer(fn: () => void): void;
  checkpointer?: Checkpointer;
}): SyncService {
  return createSyncService({
    ...options,
    ids: () => crypto.randomUUID(),
    versions: { current: VERSIONS, min: VERSIONS },
  });
}

/** Places a script owned by OWNER in `home`, whose log holds `state`, and lets each of `editors` edit it. */
export function placeScript(
  service: SyncService,
  storage: Storage,
  script: {
    docId: string;
    home: Home;
    state: Uint8Array;
    editors: readonly string[];
  },
): void {
  const { docId, home, state } = script;
  const made = service.access.create(OWNER, {
    docId,
    kind: "script",
    home: `project:${home.id}`,
  });
  if (!made.ok) throw new Error(`placing ${docId} was refused: ${made.code}`);
  storage.open(home).log.append({
    docId,
    generation: 1,
    update: state,
    userId: OWNER,
    origin: "import",
    clocks: updateMeta(state).map(({ clientId, toClock }) => ({
      clientId,
      clock: toClock,
    })),
  });
  for (const userId of script.editors)
    storage.directory.setRole(docId, userId, "edit", []);
}

/**
 * A connection after WELCOME, in this process: each message is framed by its own encoder, as on
 * the wire, and then handed to `heard`.
 */
export function createBenchPeer(
  userId: string,
  heard: (message: Message | PreparedMessage) => void,
): Peer {
  const encoder = createFrameEncoder({ ids: createMessageIds() });
  return {
    userId,
    name: userId,
    deviceId: `device-${userId}`,
    versions: VERSIONS,
    address: "127.0.0.1",
    send(message) {
      encoder.encode(message);
      heard(message);
    },
    close() {},
  };
}

/** Attaches `peer` and subscribes it to edit `docId` with `clientId`, sending its state vector. */
export function joinAsEditor(
  service: SyncService,
  peer: Peer,
  editing: { docId: string; clientId: number; vector: Uint8Array },
): void {
  const { docId } = editing;
  const attached = service.attach(peer);
  if (!attached.ok)
    throw new Error(`${peer.userId} was refused with ${attached.code}`);
  service.receive(peer, {
    type: "SUBSCRIBE",
    docId,
    generation: 0,
    mode: "edit",
    clientIds: [editing.clientId],
    lastServerSeq: 0,
  });
  service.receive(peer, {
    type: "SYNC",
    docId,
    generation: 1,
    step: "step1",
    data: editing.vector,
  });
}

/** Single keystrokes by one client into one block of a script that holds `state`. */
export interface Keystrokes {
  readonly vector: Uint8Array;
  /** The PUSH of the next keystroke: one character typed at the start of the block. */
  next(): Message;
}

export function createKeystrokes(options: {
  docId: string;
  state: Uint8Array;
  clientId: number;
  blockId: string;
}): Keystrokes {
  const { docId, blockId } = options;
  const doc = loadDoc(options.state, { clientId: options.clientId });
  const body = scriptBody(doc);
  let clientSeq = 0;
  let made: Uint8Array | null = null;
  // the listener only keeps the update: it never throws into the document
  doc.subscribe((update) => {
    made = update;
  });
  return {
    vector: doc.encodeStateVector(),
    next() {
      made = null;
      body.write((writer) => writer.insertText(blockId, 0, "x"));
      if (made === null) throw new RangeError(`no keystroke in ${blockId}`);
      clientSeq += 1;
      return {
        type: "PUSH",
        docId,
        generation: 1,
        clientSeq,
        update: made,
        heal: false,
      };
    },
  };
}

/** The id of the first block of a corpus script. */
export function firstBlockOf(script: DocJSON): string {
  const id = script.content?.[0]?.content?.[0]?.attrs?.id;
  if (typeof id !== "string") throw new RangeError("the script has no block");
  return id;
}

/**
 * A script Dana creates in HOME on the running `server`, which each of `editors` may edit: their
 * roles are written to its storage while it is stopped.
 */
export async function shareScript(
  server: TestServer,
  docId: string,
  editors: readonly string[],
): Promise<void> {
  await server.createDocument(OWNER, {
    docId,
    kind: "script",
    home: `project:${HOME.id}`,
  });
  await server.stop();
  const storage = openSqliteStorage({
    dir: join(server.dataDir, "data"),
    now: Date.now,
  });
  for (const userId of editors)
    storage.directory.setRole(docId, userId, "edit", []);
  storage.close();
  await server.start();
}
