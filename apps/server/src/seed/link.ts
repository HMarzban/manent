// One person on the real socket seam, and a sync client transport over the same seam.
import { createDoc } from "@manent/crdt";
import type { HeadlessLink } from "@manent/demo";
import { SeedDriverError } from "@manent/demo";
import type {
  Connection,
  ConnectionData,
  ManentServer,
  SessionStore,
} from "@manent/server-core";
import { ConnectError } from "@manent/sync-client";
import type { Transport } from "@manent/sync-client";
import {
  createFrameDecoder,
  createFrameEncoder,
  createMessageIds,
  encodeReplayUpdates,
} from "@manent/sync-protocol";
import type { DocRole, Message } from "@manent/sync-protocol";
import {
  BUILD_VERSIONS,
  SEED_CALLER,
  SEED_HOST,
  SEED_ORIGIN,
  callRoute,
} from "./server.ts";

/** What a person reaches a server through: its routes, its sockets and its sessions. */
export interface SeamTarget {
  server: ManentServer;
  sessions: SessionStore;
}

export const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** How long the seed waits for any one answer, in wall-clock time. */
const ANSWER_TIMEOUT_MS = 30_000;
const UTF8 = new TextEncoder();

/** The person's socket, upgraded through the ticket route and the socket route; null when either refuses. */
async function upgrade(
  target: SeamTarget,
  token: string,
): Promise<ConnectionData | null> {
  const ticketRoute = { method: "POST", path: "/api/ws-ticket" } as const;
  const answer = await callRoute(target.server, token, ticketRoute);
  const body: unknown = answer.status === 200 ? await answer.json() : null;
  const ticket = isFields(body) ? body.ticket : null;
  if (typeof ticket !== "string") return null;
  let data: ConnectionData | null = null;
  const url = `http://${SEED_HOST}/ws?ticket=${encodeURIComponent(ticket)}`;
  const upgradeTo = (given: ConnectionData) => {
    data = given;
    return true;
  };
  await target.server.fetch(
    new Request(url, { headers: { Origin: SEED_ORIGIN } }),
    { ...SEED_CALLER, upgrade: upgradeTo },
  );
  return data;
}

/** Settles a promise one way or the other. */
interface Settle<T> {
  resolve(value: T): void;
  reject(error: Error): void;
}

/** Settles once; rejects with "timeout" when nothing settles it within ANSWER_TIMEOUT_MS. */
function awaitAnswer<T>(
  what: string,
  register: (settle: Settle<T>) => void,
): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  const timer = setTimeout(
    () => reject(new SeedDriverError("timeout", what)),
    ANSWER_TIMEOUT_MS,
  );
  register({ resolve, reject });
  return promise.finally(() => clearTimeout(timer));
}

/** How the server answered one PUSH or SET: its ACK's sequence, or the ERROR that refused it. */
type EntryAnswer =
  { ok: true; serverSeq: number } | { ok: false; error: SeedDriverError };

interface Subscribed {
  generation: number;
  clientSeq: number;
  pending: Map<number, Settle<EntryAnswer>>;
  hear: (update: Uint8Array) => void;
}

/** HeadlessLink, whose subscribe also gives the server's state and hands `hear` each update the server sends after it. */
export interface SeamLink extends HeadlessLink {
  subscribe(
    docId: string,
    clientId: number,
    hear?: (update: Uint8Array) => void,
  ): Promise<{ role: DocRole; headSeq: number; state: Uint8Array }>;
}

/** One person's socket: every frame the server sends is read as it is sent, and answers settle what waits for them. */
class Seam implements SeamLink {
  readonly userId: string;
  private readonly server: ManentServer;
  private readonly connection: Connection;
  private readonly encoder = createFrameEncoder({ ids: createMessageIds() });
  private readonly decoder = createFrameDecoder({ from: "server" });
  private readonly docs = new Map<string, Subscribed>();
  /** What waits for one message: WELCOME under "", a SUBSCRIBED or a step 2 under its document. */
  private readonly waiting = new Map<string, Settle<Message>>();
  private closed: SeedDriverError | null = null;

  constructor(server: ManentServer, userId: string, data: ConnectionData) {
    this.server = server;
    this.userId = userId;
    this.connection = {
      data,
      bufferedBytes: 0,
      send: (frame) => {
        const read = this.decoder.push(frame);
        if (read.kind === "message") this.receive(read.message);
        return "sent";
      },
      close: (code, reason) =>
        this.fail(new SeedDriverError("refused", `closed ${code} ${reason}`)),
    };
  }

  async hello(): Promise<void> {
    this.server.connections.open(this.connection);
    const welcome = this.next("", "WELCOME");
    const versions = BUILD_VERSIONS;
    const deviceId = `seed-${this.userId}`;
    this.send({ type: "HELLO", versions, build: "seed", deviceId });
    await welcome;
  }

  async subscribe(
    docId: string,
    clientId: number,
    hear: (update: Uint8Array) => void = () => {},
  ) {
    const subscribed = this.next(docId, `${docId} SUBSCRIBED`);
    const clientIds = [clientId];
    const ask = { docId, generation: 0, lastServerSeq: 0, clientIds };
    this.send({ type: "SUBSCRIBE", mode: "edit", ...ask });
    const reply = await subscribed;
    if (reply.type !== "SUBSCRIBED")
      throw new SeedDriverError("refused", `${docId} moved generation`);
    const { generation, role, headSeq } = reply;
    this.docs.set(docId, {
      generation,
      clientSeq: 0,
      pending: new Map(),
      hear,
    });
    const stepTwo = this.next(docId, `${docId} SYNC step 2`);
    const empty = createDoc();
    const data = empty.encodeStateVector();
    empty.destroy();
    this.send({ type: "SYNC", docId, generation, step: "step1", data });
    const step = await stepTwo;
    const state = step.type === "SYNC" ? step.data : new Uint8Array();
    return { role, headSeq, state };
  }

  async push(docId: string, update: Uint8Array): Promise<number> {
    const answer = await this.entry(docId, (generation, clientSeq) => ({
      type: "PUSH",
      docId,
      generation,
      clientSeq,
      update,
      heal: false,
    }));
    if (!answer.ok) throw answer.error;
    return answer.serverSeq;
  }

  async set(
    docId: string,
    key: string,
    value: unknown,
  ): Promise<"ok" | "refused"> {
    const answer = await this.entry(docId, (generation, clientSeq) => ({
      type: "SET",
      docId,
      generation,
      clientSeq,
      key,
      value: UTF8.encode(JSON.stringify(value)),
    }));
    return answer.ok ? "ok" : "refused";
  }

  async unsubscribe(docId: string): Promise<void> {
    const { generation } = this.subscribed(docId);
    this.docs.delete(docId);
    this.send({ type: "UNSUBSCRIBE", docId, generation });
  }

  async close(): Promise<void> {
    if (this.closed !== null) return;
    this.fail(
      new SeedDriverError("refused", `${this.userId}'s link is closed`),
    );
    this.server.connections.close(this.connection);
  }

  private send(message: Message): void {
    if (this.closed !== null) throw this.closed;
    for (const frame of this.encoder.encode(message))
      this.server.connections.message(this.connection, frame);
  }

  private next(key: string, what: string): Promise<Message> {
    return awaitAnswer<Message>(what, (settle) => {
      if (this.closed !== null) settle.reject(this.closed);
      else this.waiting.set(key, settle);
    });
  }

  private entry(
    docId: string,
    message: (generation: number, clientSeq: number) => Message,
  ): Promise<EntryAnswer> {
    const doc = this.subscribed(docId);
    const clientSeq = ++doc.clientSeq;
    const answered = awaitAnswer<EntryAnswer>(
      `${docId} entry ${clientSeq}`,
      (settle) => doc.pending.set(clientSeq, settle),
    );
    this.send(message(doc.generation, clientSeq));
    return answered;
  }

  private subscribed(docId: string): Subscribed {
    const doc = this.docs.get(docId);
    if (doc === undefined)
      throw new RangeError(`${this.userId} is not subscribed to ${docId}`);
    return doc;
  }

  private receive(message: Message): void {
    if (message.type === "WELCOME") return this.answer("", message);
    if (message.type === "ERROR") return this.refuse(message);
    if (message.type === "PING") {
      const pong: Message = { type: "PONG", nonce: message.nonce };
      return queueMicrotask(() => this.send(pong));
    }
    if (!("docId" in message)) return;
    const doc = this.docs.get(message.docId);
    if (message.type === "SUBSCRIBED" || message.type === "GENERATION_MOVED")
      return this.answer(message.docId, message);
    if (doc === undefined) return;
    if (message.type === "ACK")
      for (const [seq, settle] of doc.pending) {
        if (seq > message.clientSeq) continue;
        doc.pending.delete(seq);
        settle.resolve({ ok: true, serverSeq: message.serverSeq });
      }
    if (message.type !== "SYNC") return;
    if (message.step === "step2") this.answer(message.docId, message);
    else if (message.step === "update") doc.hear(message.data);
  }

  /** An ERROR answers the entry it names, else what waits on its document, else everything. */
  private refuse(message: Extract<Message, { type: "ERROR" }>): void {
    const error = new SeedDriverError("refused", message.message);
    if (message.doc === null) return this.fail(error);
    const { docId } = message.doc;
    const pending = this.docs.get(docId)?.pending;
    const settle =
      message.clientSeq === null ? undefined : pending?.get(message.clientSeq);
    if (settle !== undefined && message.clientSeq !== null) {
      pending?.delete(message.clientSeq);
      return settle.resolve({ ok: false, error });
    }
    this.waiting.get(docId)?.reject(error);
    this.waiting.delete(docId);
  }

  private answer(key: string, message: Message): void {
    this.waiting.get(key)?.resolve(message);
    this.waiting.delete(key);
  }

  private fail(error: SeedDriverError): void {
    this.closed ??= error;
    for (const settle of this.waiting.values()) settle.reject(error);
    this.waiting.clear();
    for (const doc of this.docs.values()) {
      for (const settle of doc.pending.values()) settle.reject(error);
      doc.pending.clear();
    }
  }
}

/** The person signed in, their socket opened, HELLO answered by WELCOME. */
export async function openSeamLink(
  target: SeamTarget,
  userId: string,
): Promise<SeamLink> {
  const data = await upgrade(target, target.sessions.issue(userId));
  if (data === null)
    throw new SeedDriverError("refused", `${userId} could not open a socket`);
  const seam = new Seam(target.server, userId, data);
  await seam.hello();
  return seam;
}

export function openHeadlessLink(
  server: SeamTarget,
  userId: string,
): Promise<HeadlessLink> {
  return openSeamLink(server, userId);
}

/** Answers a refusal the transport has no outcome for: a refused session asks for sign-in, anything else is unreachable. */
const unreachable = (status: number): ConnectError =>
  new ConnectError(status === 401 ? "sign_in" : "unreachable");

/**
 * A sync client's transport as `userId`, over the server's own ticket and socket routes and its
 * document route; a replay goes to the sync service the replay route calls. Frames from the server
 * arrive on a later microtask, as a socket's would.
 */
export function inProcessTransport(
  server: SeamTarget,
  userId: string,
): Transport {
  const token = server.sessions.issue(userId);
  return {
    async connect(handlers) {
      const data = await upgrade(server, token);
      if (data === null) throw new ConnectError("unreachable");
      let open = true;
      const end = (code: number, reason: string): void => {
        if (!open) return;
        open = false;
        queueMicrotask(() => handlers.onClose(code, reason));
      };
      const connection: Connection = {
        data,
        bufferedBytes: 0,
        send(frame) {
          const copy = new Uint8Array(frame);
          queueMicrotask(() => {
            if (open) handlers.onFrame(copy);
          });
          return "sent";
        },
        close: end,
      };
      server.server.connections.open(connection);
      return {
        send(frame) {
          if (open) server.server.connections.message(connection, frame);
        },
        close(code, reason) {
          if (!open) return;
          server.server.connections.close(connection);
          end(code, reason);
        },
      };
    },
    async createDocument({ workspaceId, ...request }) {
      const body = workspaceId === null ? request : { ...request, workspaceId };
      const answer = await callRoute(server.server, token, {
        method: "POST",
        path: "/api/docs",
        body,
      });
      if (answer.status === 200) return { ok: true };
      if (answer.status === 403) return { ok: false, code: "forbidden" };
      if (answer.status === 410) return { ok: false, code: "deleted" };
      throw unreachable(answer.status);
    },
    async replay({ updates, ...request }) {
      const sync = server.server.sync;
      if (sync === null) throw new ConnectError("unreachable");
      const body = { ...request, updates: encodeReplayUpdates(updates) };
      return sync.replay(userId, body);
    },
  };
}
