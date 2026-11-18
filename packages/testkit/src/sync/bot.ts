// A headless person: the real sync client over a real socket, typing lines and keeping a ledger
// of which of them the server has acknowledged.
import { browserClock, browserRandom, webTransport } from "@manent/client-web";
import type { SocketLike } from "@manent/client-web";
import { scriptBody } from "@manent/crdt";
import { ENGINE_VERSION, TABLE_VERSION } from "@manent/pagination";
import {
  SCHEMA_VERSION,
  blockText,
  blocksOf,
  randomBlockId,
} from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import {
  createMemoryStore,
  createSyncClient,
  soloLeader,
} from "@manent/sync-client";
import type {
  DocHandle,
  Frames,
  LocalStore,
  SyncClient,
} from "@manent/sync-client";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import { createAckLedger } from "./ledger.ts";
import type { AckLedger } from "./ledger.ts";

export interface Bot {
  readonly userId: string;
  readonly client: SyncClient;
  readonly ledger: AckLedger;
  open(docId: string): Promise<DocHandle>;
  /**
   * Appends one block holding `marker` after the last block. It is recorded in
   * the ledger as typed, and as acknowledged when the handle next reports
   * nothing waiting.
   */
  typeLine(handle: DocHandle, marker: string): void;
  /** Appends `text` to the end of the block; RangeError when the script holds no such block. */
  typeInto(handle: DocHandle, blockId: string, text: string): void;
  close(): Promise<void>;
}

const VERSIONS = {
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: ENGINE_VERSION,
  table: TABLE_VERSION,
};

/** A hidden tab's frames: none ever comes, so remote updates are shown by the fallback timer. */
const NO_FRAMES: Frames = { request: () => () => {} };

/** Bun's WebSocket, which sends the origin a browser would, as the transport's socket. */
function bunSocket(url: string, origin: string): SocketLike {
  // Bun's constructor takes headers; the DOM's WebSocket type, also in force, does not declare them
  const socket: unknown = Reflect.construct(WebSocket, [
    url,
    { headers: { Origin: origin } },
  ]);
  if (!(socket instanceof WebSocket))
    throw new TypeError(`no socket for ${url}`);
  socket.binaryType = "arraybuffer";
  const like: SocketLike = {
    binaryType: "arraybuffer",
    send: (data) => socket.send(new Uint8Array(data)),
    close: (code, reason) => socket.close(code, reason),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  socket.addEventListener("open", () => like.onopen?.());
  socket.addEventListener("message", (event) => like.onmessage?.(event));
  socket.addEventListener("close", (event) => like.onclose?.(event));
  socket.addEventListener("error", () => like.onerror?.());
  return like;
}

function lastBlockId(handle: DocHandle): string | null {
  return (
    blocksOf(scriptBody(handle.doc()).materialize()).at(-1)?.attrs.id ?? null
  );
}

/** A block of the element `action` holding `marker`, under a fresh id. */
function actionLine(marker: string): BlockJSON {
  return {
    type: "block",
    attrs: { id: randomBlockId(), type: "action" },
    content: [{ type: "text", text: marker }],
  };
}

/**
 * Records each marker in the ledger as typed, and as acknowledged once the handle it was typed on
 * next reports nothing waiting; the acknowledged prefix advances in typing order.
 */
function watchAcknowledgements(ledger: AckLedger): {
  typed(handle: DocHandle, marker: string): void;
  stop(): void;
} {
  /** By ledger position: whether that marker is acknowledged. */
  const acknowledged: boolean[] = [];
  /** Per handle typed on: the ledger positions not yet acknowledged, and the status listener. */
  const watched = new Map<DocHandle, { waiting: number[]; stop: () => void }>();

  const settle = (positions: number[]): void => {
    for (const position of positions.splice(0)) acknowledged[position] = true;
    const through = acknowledged.findIndex((done) => !done);
    ledger.acknowledgedThrough(through === -1 ? acknowledged.length : through);
  };

  const waitingOn = (handle: DocHandle): number[] => {
    const known = watched.get(handle);
    if (known !== undefined) return known.waiting;
    const waiting: number[] = [];
    const stop = handle.status.subscribe((status) => {
      if (status.waiting === 0) settle(waiting);
    });
    watched.set(handle, { waiting, stop });
    return waiting;
  };

  return {
    typed(handle, marker) {
      waitingOn(handle).push(acknowledged.length);
      acknowledged.push(false);
      ledger.typed(marker);
    },
    stop() {
      for (const { stop } of watched.values()) stop();
      watched.clear();
    },
  };
}

/** A memory store unless one is given, and a fresh device unless one is named. */
export function createBot(options: {
  server: { url: string };
  userId: string;
  token: string | null;
  store?: LocalStore;
  deviceId?: string;
}): Bot {
  const { userId, token } = options;
  const baseUrl = options.server.url;
  const client = createSyncClient({
    userId,
    deviceId: options.deviceId ?? browserRandom.bytes(8).toHex(),
    build: "testkit",
    versions: VERSIONS,
    minServer: VERSIONS,
    ports: {
      transport: webTransport({
        baseUrl,
        session: () => token,
        socket: (url) => bunSocket(url, baseUrl),
      }),
      store: options.store ?? createMemoryStore(userId),
      leader: soloLeader(userId),
      clock: browserClock,
      random: browserRandom,
      frames: NO_FRAMES,
    },
  });
  const ledger = createAckLedger();
  const acknowledgements = watchAcknowledgements(ledger);

  return {
    userId,
    client,
    ledger,
    open: (docId) => client.open(docId),
    typeLine(handle, marker) {
      const after = lastBlockId(handle);
      acknowledgements.typed(handle, marker);
      scriptBody(handle.doc()).write((writer) =>
        writer.insertBlocks(after, [actionLine(marker)]),
      );
    },
    typeInto(handle, blockId, text) {
      const target = blocksOf(scriptBody(handle.doc()).materialize()).find(
        (block) => block.attrs.id === blockId,
      );
      if (target === undefined)
        throw new RangeError(
          `the script ${handle.docId} holds no block ${blockId}`,
        );
      const end = blockText(target).length;
      scriptBody(handle.doc()).write((writer) =>
        writer.insertText(blockId, end, text),
      );
    },
    async close() {
      acknowledgements.stop();
      await client.close();
    },
  };
}
