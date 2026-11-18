// The connection rules: a ticket opens the socket, HELLO is answered by WELCOME, and every
// document frame is refused, since no document is served yet.
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
  PushResult,
  ServerVersions,
  VersionSet,
} from "@manent/sync-protocol";
import type { Directory } from "../auth/directory.ts";
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
      /** Everything this connection sends goes through it, under the connection's own message IDs. */
      encoder: FrameEncoder;
      decoder: FrameDecoder;
      welcomed: boolean;
    }
  | { kind: "closed" };

type OpenStage = Extract<Stage, { kind: "open" }>;

class SocketState implements ConnectionData {
  readonly [connectionBrand] = true as const;
  stage: Stage;

  constructor(ticket: string | null) {
    this.stage = { kind: "upgraded", ticket };
  }
}

/** The data of a socket about to open with `ticket`, which is null when the request named none. */
export function createConnectionData(ticket: string | null): ConnectionData {
  return new SocketState(ticket);
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

/** Closes the socket and drops its decoder, with any half-received message, at once. */
function shut(connection: Connection, state: SocketState, code: Code): void {
  state.stage = { kind: "closed" };
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

function welcome(
  connection: Connection,
  state: SocketState,
  stage: OpenStage,
  client: VersionSet,
  versions: ServerVersions,
): void {
  const gate = gateConnection(client, versions);
  if (!gate.ok) return shut(connection, state, gate.code);
  send(connection, stage, {
    type: "WELCOME",
    session: stage.user,
    limits: {
      frameBytes: FRAME_LIMIT_BYTES,
      messageBytes: MESSAGE_LIMIT_BYTES,
    },
    server: versions,
  });
  // a chunked message begun before the handshake is dropped with the small decoder
  state.stage = {
    ...stage,
    decoder: createFrameDecoder({ from: "client" }),
    welcomed: true,
  };
}

function handle(
  connection: Connection,
  state: SocketState,
  stage: OpenStage,
  message: Message,
  versions: ServerVersions,
): void {
  if (!stage.welcomed) {
    if (message.type === "HELLO")
      return welcome(connection, state, stage, message.versions, versions);
    return shut(connection, state, CODE.BAD_FRAME);
  }
  if ("docId" in message) {
    const doc = { docId: message.docId, generation: message.generation };
    return send(connection, stage, refusal(CODE.FORBIDDEN, "forbidden", doc));
  }
  switch (message.type) {
    case "HELLO":
      return shut(connection, state, CODE.BAD_FRAME);
    case "PING":
      return send(connection, stage, { type: "PONG", nonce: message.nonce });
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

/** One socket's life: `open` redeems its ticket, `message` applies the rules, `close` forgets it. */
export function createConnectionHandler(options: {
  tickets: TicketStore;
  directory: Directory;
  versions: ServerVersions;
}): ConnectionHandler {
  const { tickets, directory, versions } = options;

  return {
    maxFrameBytes: FRAME_LIMIT_BYTES,
    open(connection) {
      const state = stateOf(connection);
      if (state.stage.kind !== "upgraded") return;
      const { ticket } = state.stage;
      const redeemed = ticket === null ? null : tickets.redeem(ticket);
      const user = redeemed === null ? null : directory.user(redeemed.userId);
      if (user === null) return shut(connection, state, CODE.UNAUTHENTICATED);
      state.stage = {
        kind: "open",
        user,
        encoder: createFrameEncoder({ ids: createMessageIds() }),
        decoder: createFrameDecoder({
          from: "client",
          ...HANDSHAKE_LIMITS,
        }),
        welcomed: false,
      };
    },
    message(connection, frame) {
      const state = stateOf(connection);
      const { stage } = state;
      if (stage.kind !== "open") return;
      if (typeof frame === "string")
        return shut(connection, state, CODE.BAD_FRAME);
      const result = push(stage.decoder, frame);
      if (result instanceof ProtocolError)
        return shut(connection, state, result.code);
      switch (result.kind) {
        case "message":
          return handle(connection, state, stage, result.message, versions);
        case "pending":
          return;
        case "skipped":
          // a newer client is told at once that this build did not read the frame
          if (stage.welcomed && result.doc !== null)
            send(
              connection,
              stage,
              refusal(CODE.BAD_FRAME, "unknown_frame", result.doc),
            );
          return;
        default:
          result satisfies never;
      }
    },
    drain() {
      // nothing is queued yet, so there is nothing to resume
    },
    close(connection) {
      stateOf(connection).stage = { kind: "closed" };
    },
  };
}
