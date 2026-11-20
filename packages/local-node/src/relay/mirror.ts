// A document made elsewhere, placed on the node as the cloud describes it, so a window can open it
// here, and the windows' connections as the node knows them.
import { SCHEMA_VERSION } from "@manent/schema";
import type {
  Connection,
  ConnectionData,
  ConnectionHandler,
} from "@manent/server-core";
import type { Storage } from "@manent/storage";
import { parseHome } from "@manent/storage";
import { ConnectError } from "@manent/sync-client";
import { CODE, createFrameDecoder, encodeMessage } from "@manent/sync-protocol";
import type { ControlKind, FrameDecoder, Message } from "@manent/sync-protocol";
import type { CloudApi } from "../node/ports.ts";
import type { NodeRecords } from "../records/ports.ts";

export interface Mirror {
  ensure(
    userId: string,
    docId: string,
  ): Promise<
    { ok: true } | { ok: false; code: "unreachable" | "forbidden" | "deleted" }
  >;
}

type MirrorRefusal = Extract<
  Awaited<ReturnType<Mirror["ensure"]>>,
  { ok: false }
>["code"];

const REFUSALS: Readonly<
  Record<
    "unauthenticated" | "forbidden" | "deleted" | "bad_request",
    MirrorRefusal
  >
> = Object.freeze({
  // a session the cloud no longer takes: the person reaches it again once signed in
  unauthenticated: "unreachable",
  forbidden: "forbidden",
  deleted: "deleted",
  bad_request: "forbidden",
});

/**
 * Describes the document at the cloud as that person, then records it as synced at the described
 * generation before anything else is written, places it with the cloud's kind and home, and gives
 * the person the cloud's role. A person with no cloud session cannot reach the cloud.
 */
export function createMirror(options: {
  storage: Storage;
  records: NodeRecords;
  cloud: CloudApi;
  tokenOf: (userId: string) => string | null;
}): Mirror {
  const { storage, records, cloud } = options;
  return {
    async ensure(userId, docId) {
      const token = options.tokenOf(userId);
      if (token === null) return { ok: false, code: "unreachable" };
      let described;
      try {
        described = await cloud.describe(token, { docId });
      } catch (error) {
        if (!(error instanceof ConnectError)) throw error;
        return { ok: false, code: "unreachable" };
      }
      if (!described.ok) return { ok: false, code: REFUSALS[described.code] };
      const { kind, home, generation, role, capabilities } = described.body;
      const placed = parseHome(home);
      if (placed === null) return { ok: false, code: "forbidden" };
      if (records.docState(docId) === null)
        records.setDocState(docId, userId, "synced", generation);
      storage.directory.place(docId, placed, kind, userId);
      storage.open(placed).log.create({
        id: docId,
        kind,
        ownerUserId: kind === "private" ? userId : null,
        schemaVersion: SCHEMA_VERSION,
        engineVersion: null,
      });
      storage.directory.setRole(docId, userId, role, capabilities);
      return { ok: true };
    },
  };
}

/** An unknown document's SUBSCRIBE while the cloud cannot be reached is answered busy, to be tried again after this. */
export const MIRROR_RETRY_AFTER_MS = 5_000;

/** A window's connection: who it is, and the documents it holds, each at its generation. */
export interface Editor {
  readonly userId: string | null;
  readonly docs: ReadonlyMap<string, number>;
  /** A CONTROL frame for one of its documents, at the generation it holds. */
  control(docId: string, kind: ControlKind, data: Uint8Array): void;
}

interface Watched extends Editor {
  userId: string | null;
  readonly docs: Map<string, number>;
  readonly fromServer: FrameDecoder;
  readonly fromClient: FrameDecoder;
  /** Frames held while a SUBSCRIBE waits for its mirror, in order; null when none waits. */
  held: (Uint8Array | string)[] | null;
}

/** The one message a frame holds; null for part of one, or for a frame that is not one. */
function messageOf(
  decoder: FrameDecoder,
  frame: Uint8Array | string,
): Message | null {
  if (typeof frame === "string") return null;
  try {
    const read = decoder.push(frame);
    return read.kind === "message" ? read.message : null;
  } catch {
    // the server's own decoder answers a bad frame; this copy only watches
    return null;
  }
}

/** The answer to a SUBSCRIBE the cloud cannot settle now: busy, to be tried again later. */
function busy(
  connection: Connection,
  doc: { docId: string; generation: number },
): void {
  const message = "busy";
  const retryAfterMs = MIRROR_RETRY_AFTER_MS;
  const error = {
    type: "ERROR",
    code: CODE.RATE_LIMITED,
    message,
    retryAfterMs,
  } as const;
  connection.send(
    encodeMessage({ ...error, permanent: false, doc, clientSeq: null }),
  );
}

/**
 * The windows' connections in front of the server's: a SUBSCRIBE of a document the node has never
 * placed waits for the mirror (and what the window sends after it waits too), and is answered 4429
 * `busy` while the cloud cannot be reached. Every connection is watched for the person it is and the
 * documents it holds; `subscribed` hears each SUBSCRIBED.
 */
export function guardSubscribe(options: {
  inner: ConnectionHandler;
  storage: Storage;
  mirror: Mirror;
  tokenOf: (userId: string) => string | null;
  subscribed(editor: Editor, docId: string): void;
}): { connections: ConnectionHandler; editors(): Editor[] } {
  const { inner, storage } = options;
  const watched = new Map<ConnectionData, Watched>();

  function watch(connection: Connection): Watched {
    const editor: Watched = {
      userId: null,
      docs: new Map(),
      fromServer: createFrameDecoder({ from: "server" }),
      fromClient: createFrameDecoder({ from: "client" }),
      held: null,
      control(docId, kind, data) {
        const generation = editor.docs.get(docId);
        if (generation === undefined) return;
        const control = {
          type: "CONTROL",
          docId,
          generation,
          seq: 0,
          kind,
          data,
        } as const;
        connection.send(encodeMessage(control));
      },
    };
    watched.set(connection.data, editor);
    return editor;
  }

  /** The connection as the server sees it: what it is sent is read on the way. */
  function seen(connection: Connection, editor: Watched): Connection {
    return {
      data: connection.data,
      get bufferedBytes() {
        return connection.bufferedBytes;
      },
      send(frame) {
        const message = messageOf(editor.fromServer, frame);
        if (message?.type === "WELCOME") editor.userId = message.session.userId;
        if (message?.type === "SUBSCRIBED") {
          editor.docs.set(message.docId, message.generation);
          const sent = connection.send(frame);
          options.subscribed(editor, message.docId);
          return sent;
        }
        if (message?.type === "GENERATION_MOVED")
          editor.docs.set(message.docId, message.newGeneration);
        return connection.send(frame);
      },
      close: (code, reason) => connection.close(code, reason),
    };
  }

  /** Whether the SUBSCRIBE may go on now: the document is placed, or the mirror placed it, or the cloud refused it. */
  async function mirrored(
    userId: string | null,
    docId: string,
  ): Promise<boolean> {
    if (userId === null || options.tokenOf(userId) === null) return true;
    const ensured = await options.mirror.ensure(userId, docId);
    return ensured.ok || ensured.code !== "unreachable";
  }

  function receive(connection: Connection, frame: Uint8Array | string): void {
    const editor = watched.get(connection.data) ?? watch(connection);
    if (editor.held !== null) return void editor.held.push(frame);
    const message = messageOf(editor.fromClient, frame);
    if (message?.type === "UNSUBSCRIBE") editor.docs.delete(message.docId);
    const unknown =
      message?.type === "SUBSCRIBE" &&
      storage.directory.placeOf(message.docId) === null;
    if (!unknown) return inner.message(seen(connection, editor), frame);
    const doc = { docId: message.docId, generation: message.generation };
    editor.held = [];
    void mirrored(editor.userId, doc.docId).then((pass) => {
      const later = editor.held ?? [];
      editor.held = null;
      if (pass) inner.message(seen(connection, editor), frame);
      else busy(connection, doc);
      for (const next of later) receive(connection, next);
    });
  }

  return {
    connections: {
      maxFrameBytes: inner.maxFrameBytes,
      open: (connection) => inner.open(seen(connection, watch(connection))),
      message: receive,
      drain: (connection) =>
        inner.drain(
          seen(connection, watched.get(connection.data) ?? watch(connection)),
        ),
      close(connection) {
        const editor = watched.get(connection.data) ?? watch(connection);
        watched.delete(connection.data);
        inner.close(seen(connection, editor));
      },
    },
    editors: () => [...watched.values()],
  };
}
