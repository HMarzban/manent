// The connection rules: a ticket opens the socket, HELLO is answered by WELCOME, and every
// document frame goes to the sync service, or is refused when the server serves no document.
import {
  CODE,
  FRAME_LIMIT_BYTES,
  MESSAGE_LIMIT_BYTES,
  ProtocolError,
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
  gateConnection,
} from "@manent/sync-protocol";
import type {
  Code,
  DocRef,
  FrameDecoder,
  FrameEncoder,
  Identity,
  Message,
  MessageIds,
  PushResult,
  ServerVersions,
} from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
import { peerOf } from "../sync/peer.ts";
import type { Clock, Peer, SyncLimits } from "../sync/ports.ts";
import type { SyncService } from "../sync/service.ts";
import { connectionBrand } from "./connection.ts";
import type {
  Connection,
  ConnectionData,
  ConnectionHandler,
} from "./connection.ts";
import type { TicketStore } from "./tickets.ts";

/**
 * The decoder's limits until WELCOME is sent: a stranger's frame and message are at most 64 KiB
 * and only one chunked message may be in progress, so a socket that never signs in pins little
 * memory.
 */
const HANDSHAKE_LIMITS = Object.freeze({
  frameLimitBytes: 64 * 1024,
  messageLimitBytes: 64 * 1024,
  maxPartial: 1,
});

type Stage =
  | { kind: "upgraded"; ticket: string | null }
  | {
      kind: "open";
      user: Identity;
      /** The connection's own message IDs, shared by everything that frames for it. */
      ids: MessageIds;
      encoder: FrameEncoder;
      decoder: FrameDecoder;
      welcomed: boolean;
      /** Once WELCOME is sent, when the server serves documents. */
      peer: Peer | null;
      /** Cancels the wait for HELLO; null when nothing waits. */
      cancelHello: (() => void) | null;
    }
  | { kind: "closed" };

type OpenStage = Extract<Stage, { kind: "open" }>;

class SocketState implements ConnectionData {
  readonly [connectionBrand] = true as const;
  stage: Stage;
  /** The caller's address as the listener saw it. */
  readonly address: string;

  constructor(ticket: string | null, address: string) {
    this.stage = { kind: "upgraded", ticket };
    this.address = address;
  }
}

/**
 * The data of a socket about to open with `ticket`, which is null when the request named none,
 * from `address`.
 */
export function createConnectionData(
  ticket: string | null,
  address: string,
): ConnectionData {
  return new SocketState(ticket, address);
}

function stateOf(connection: Connection): SocketState {
  if (connection.data instanceof SocketState) return connection.data;
  throw new TypeError(
    "a connection's data must come from createConnectionData",
  );
}

// A close's reason is its code's name in CODE, in lower case.
const REASONS: ReadonlyMap<number, string> = new Map(
  Object.entries(CODE).map(([name, code]) => [code, name.toLowerCase()]),
);

/** The sync service, the clock the wait for HELLO runs on, and the limits it keeps to. */
export interface SocketSync {
  service: SyncService;
  clock: Clock;
  limits: SyncLimits;
}

interface Rules {
  directory: Directory;
  versions: ServerVersions;
  /** Null: no document is served. */
  sync: SocketSync | null;
}

/** The connection's stage ends: nothing waits for its HELLO and its peer leaves the service. */
function release(state: SocketState, rules: Rules): void {
  const { stage } = state;
  state.stage = { kind: "closed" };
  if (stage.kind !== "open") return;
  stage.cancelHello?.();
  if (stage.peer !== null) rules.sync?.service.detach(stage.peer);
}

/** Closes the socket and drops its decoder, with any half-received message, at once. */
function shut(
  connection: Connection,
  state: SocketState,
  code: Code,
  rules: Rules,
): void {
  release(state, rules);
  // REASONS holds every Code
  connection.close(code, REASONS.get(code)!);
}

function send(
  connection: Connection,
  stage: OpenStage,
  message: Message,
): void {
  for (const frame of stage.encoder.encode(message)) connection.send(frame);
}

function refusal(code: Code, message: string, doc: DocRef): Message {
  return {
    type: "ERROR",
    code,
    message,
    retryAfterMs: null,
    permanent: false,
    doc,
    clientSeq: null,
  };
}

/** The frame's result, or the refusal a malformed or oversized frame earns. */
function push(
  decoder: FrameDecoder,
  frame: Uint8Array,
): PushResult | ProtocolError {
  try {
    return decoder.push(frame);
  } catch (error) {
    if (error instanceof ProtocolError) return error;
    throw error;
  }
}

/** The peer the sync service knows this connection by; null when it is refused. */
function attach(
  connection: Connection,
  state: SocketState,
  stage: OpenStage,
  hello: Extract<Message, { type: "HELLO" }>,
  sync: SocketSync,
): Peer | null {
  const peer = peerOf(
    connection,
    {
      identity: stage.user,
      deviceId: hello.deviceId,
      versions: hello.versions,
      address: state.address,
    },
    stage.ids,
    sync.limits,
  );
  const attached = sync.service.attach(peer);
  if (attached.ok) return peer;
  connection.close(attached.code, "rate_limited");
  return null;
}

function welcome(
  connection: Connection,
  state: SocketState,
  stage: OpenStage,
  hello: Extract<Message, { type: "HELLO" }>,
  rules: Rules,
): void {
  const { versions, sync } = rules;
  const gate = gateConnection(hello.versions, versions);
  if (!gate.ok) return shut(connection, state, gate.code, rules);
  // the directory is asked again: the person may have gone since the ticket was redeemed
  const user = rules.directory.user(stage.user.userId);
  if (user === null)
    return shut(connection, state, CODE.UNAUTHENTICATED, rules);
  stage.cancelHello?.();
  send(connection, stage, {
    type: "WELCOME",
    session: user,
    limits: {
      frameBytes: FRAME_LIMIT_BYTES,
      messageBytes: MESSAGE_LIMIT_BYTES,
    },
    server: versions,
  });
  const welcomed = { ...stage, user, cancelHello: null };
  const peer =
    sync === null ? null : attach(connection, state, welcomed, hello, sync);
  if (sync !== null && peer === null) {
    state.stage = { kind: "closed" };
    return;
  }
  // a chunked message begun before the handshake is dropped with the small decoder
  state.stage = {
    ...welcomed,
    decoder: createFrameDecoder({ from: "client" }),
    welcomed: true,
    peer,
  };
}

function handle(
  connection: Connection,
  state: SocketState,
  stage: OpenStage,
  message: Message,
  rules: Rules,
): void {
  if (!stage.welcomed) {
    if (message.type === "HELLO")
      return welcome(connection, state, stage, message, rules);
    return shut(connection, state, CODE.BAD_FRAME, rules);
  }
  if (message.type === "HELLO")
    return shut(connection, state, CODE.BAD_FRAME, rules);
  if (message.type === "PING")
    return send(connection, stage, { type: "PONG", nonce: message.nonce });
  const { peer } = stage;
  if (peer !== null) return rules.sync?.service.receive(peer, message);
  if ("docId" in message) {
    const doc = { docId: message.docId, generation: message.generation };
    return send(connection, stage, refusal(CODE.FORBIDDEN, "forbidden", doc));
  }
  switch (message.type) {
    // the server sends no PING and no ticket expires on an open socket yet
    case "PONG":
    case "AUTH_REFRESH":
    // a client's decoder refuses these before they reach here
    case "WELCOME":
    case "AUTH_EXPIRING":
    case "ERROR":
      return;
    default:
      message satisfies never;
  }
}

/** The wait for HELLO; null when the server serves no document. */
function awaitHello(
  connection: Connection,
  state: SocketState,
  rules: Rules,
): (() => void) | null {
  const { sync } = rules;
  if (sync === null) return null;
  return sync.clock.schedule(() => {
    if (state.stage.kind === "open" && !state.stage.welcomed)
      shut(connection, state, CODE.BAD_FRAME, rules);
  }, sync.limits.helloTimeoutMs);
}

/** A newer client is told at once that this build did not read its frame for `doc`. */
function skipped(
  connection: Connection,
  stage: OpenStage,
  doc: DocRef,
  rules: Rules,
): void {
  if (stage.peer !== null) return rules.sync?.service.skipped(stage.peer, doc);
  send(connection, stage, refusal(CODE.BAD_FRAME, "unknown_frame", doc));
}

/**
 * One socket's life: `open` redeems its ticket, `message` applies the rules, `close` forgets it.
 * With `sync`, a socket that sends no HELLO within `helloTimeoutMs` is closed with 4400.
 */
export function createConnectionHandler(options: {
  tickets: TicketStore;
  directory: Directory;
  versions: ServerVersions;
  sync: SocketSync | null;
}): ConnectionHandler {
  const { tickets, directory } = options;
  const rules: Rules = options;

  return {
    maxFrameBytes: FRAME_LIMIT_BYTES,
    open(connection) {
      const state = stateOf(connection);
      if (state.stage.kind !== "upgraded") return;
      const { ticket } = state.stage;
      const redeemed = ticket === null ? null : tickets.redeem(ticket);
      const user = redeemed === null ? null : directory.user(redeemed.userId);
      if (user === null)
        return shut(connection, state, CODE.UNAUTHENTICATED, rules);
      const ids = createMessageIds();
      state.stage = {
        kind: "open",
        user,
        ids,
        encoder: createFrameEncoder({ ids }),
        decoder: createFrameDecoder({
          from: "client",
          ...HANDSHAKE_LIMITS,
        }),
        welcomed: false,
        peer: null,
        cancelHello: awaitHello(connection, state, rules),
      };
    },
    message(connection, frame) {
      const state = stateOf(connection);
      const { stage } = state;
      if (stage.kind !== "open") return;
      if (typeof frame === "string")
        return shut(connection, state, CODE.BAD_FRAME, rules);
      const result = push(stage.decoder, frame);
      if (result instanceof ProtocolError)
        return shut(connection, state, result.code, rules);
      switch (result.kind) {
        case "message":
          return handle(connection, state, stage, result.message, rules);
        case "pending":
          return;
        case "skipped":
          if (stage.welcomed && result.doc !== null)
            skipped(connection, stage, result.doc, rules);
          return;
        default:
          result satisfies never;
      }
    },
    drain() {
      // nothing is queued yet, so there is nothing to resume
    },
    close(connection) {
      release(stateOf(connection), rules);
    },
  };
}
