// One document's exchange with the server on the current connection: the subscription and
// the server's two steps, the outbox in flight, and what each ERROR ends.
import { CrdtUpdateError, updateMeta } from "@manent/crdt";
import { CODE } from "@manent/sync-protocol";
import type { DocumentMessage, Message } from "@manent/sync-protocol";
import type { ServerGate } from "../link/gate.ts";
import type { OutboxItem } from "../outbox/plan.ts";
import {
  ACK_TIMEOUT_MS,
  HANDSHAKE_TIMEOUT_MS,
  IN_FLIGHT,
} from "../ports/defaults.ts";
import type { Clock } from "../ports/ports.ts";

type Subscribed = Extract<DocumentMessage, { type: "SUBSCRIBED" }>;
type ErrorMessage = Extract<Message, { type: "ERROR" }>;

/**
 * Why a subscription ended with no retry of its own. `stopped`: nothing more is
 * sent until the session says so; its side is `server_old` for a 4422 from a
 * server that does not know this build's newest schema.
 */
export type Ending =
  | {
      type: "stopped";
      side: "deleted" | "read_only" | "rejected" | "server_old";
      code: number;
      clientSeq: number | null;
    }
  | { type: "forbidden" }
  | { type: "client_id_taken" }
  | { type: "moved" };

/** What the exchange asks of its session. */
export interface HandshakeHost {
  /** What SUBSCRIBE and the client's step 1 carry. */
  subscription(): {
    generation: number;
    clientIds: number[];
    lastServerSeq: number;
    vector: Uint8Array;
  };
  /** The waiting entries after `afterSeq` that may be sent now, as items. */
  outbox(afterSeq: number): OutboxItem[];
  subscribed(message: Subscribed): void;
  stepTwo(update: Uint8Array): void;
  update(update: Uint8Array): void;
  acknowledged(clientSeq: number, serverSeq: number): void;
  /** A setting refused for good; the subscription goes on. */
  refused(clientSeq: number, message: string): void;
  ended(ending: Ending): void;
  awareness(update: Uint8Array): void;
  /** A frame came twice too late, or held no update: the connection is replaced. */
  replaceConnection(reason: string): void;
}

/**
 * `subscribe` and `pump` do nothing while stopped or with no connection, and
 * `resume` lifts a stop. `subscribed`: SUBSCRIBED came on this connection;
 * `merged`: the server's step 2 too.
 */
export interface Handshake {
  connect(send: (message: Message) => void, gate: ServerGate): void;
  disconnect(): void;
  subscribe(): void;
  stop(): void;
  resume(): void;
  receive(message: DocumentMessage): void;
  error(message: ErrorMessage): void;
  /** The decoder skipped a frame of this document. */
  skipped(): void;
  /** Sends what the in-flight limit allows of the outbox. */
  pump(): void;
  sendAwareness(update: Uint8Array): void;
  /** UNSUBSCRIBE when subscribed, then a stop. */
  close(): void;
  subscribed(): boolean;
  merged(): boolean;
}

const UTF8 = new TextEncoder();

function isWholeUpdate(bytes: Uint8Array): boolean {
  try {
    updateMeta(bytes);
    return true;
  } catch (error) {
    if (error instanceof CrdtUpdateError) return false;
    throw error;
  }
}

/** The entry a node's `upstream_refused` names; null for data that names none. */
function readRefusal(
  data: Uint8Array,
): { clientSeq: number; message: string } | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(data));
  } catch {
    // data that is not JSON names no entry, so it refuses nothing
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  if (!("clientSeq" in value) || typeof value.clientSeq !== "number")
    return null;
  if (!("message" in value) || typeof value.message !== "string") return null;
  return { clientSeq: value.clientSeq, message: value.message };
}

/** What an ERROR that ends the subscription means; null: subscribe again after a wait. */
function endingOf(m: ErrorMessage, gate: ServerGate): Ending | null {
  const stopped = (side: Extract<Ending, { type: "stopped" }>["side"]) =>
    ({ type: "stopped", side, code: m.code, clientSeq: m.clientSeq }) as const;
  if (m.code === CODE.BAD_FRAME && m.message === "client_id_taken")
    return { type: "client_id_taken" };
  if (m.code === CODE.DOCUMENT_DELETED) return stopped("deleted");
  if (m.code === CODE.FORBIDDEN) return { type: "forbidden" };
  if (m.code === CODE.TOO_OLD) return stopped("read_only");
  if (!m.permanent) return null;
  return gate === "limited" && m.code === CODE.VALIDATION_FAILED
    ? stopped("server_old")
    : stopped("rejected");
}

type Phase = "off" | "idle" | "handshake" | "live";

class Exchange implements Handshake {
  private send: ((message: Message) => void) | null = null;
  private gate: ServerGate = "ok";
  private phase: Phase = "off";
  private stopped = false;
  private generation = 0;
  private gotSubscribed = false;
  private timeouts = 0;
  /** The `clientSeq` of each push and setting sent and not yet answered, oldest first. */
  private inFlight: number[] = [];
  private sentThrough = 0;
  private cancel: (() => void) | null = null;
  private readonly docId: string;
  private readonly clock: Clock;
  private readonly host: HandshakeHost;

  constructor(options: { docId: string; clock: Clock; host: HandshakeHost }) {
    this.docId = options.docId;
    this.clock = options.clock;
    this.host = options.host;
  }

  connect(send: (message: Message) => void, gate: ServerGate): void {
    this.send = send;
    this.gate = gate;
    this.phase = "idle";
  }

  disconnect(): void {
    this.send = null;
    this.end();
  }

  subscribe(): void {
    if (this.send === null || this.stopped) return;
    const s = this.host.subscription();
    const { docId } = this;
    this.generation = s.generation;
    this.gotSubscribed = false;
    this.inFlight = [];
    this.sentThrough = 0;
    this.phase = "handshake";
    this.send({
      type: "SUBSCRIBE",
      docId,
      generation: s.generation,
      mode: "edit",
      clientIds: s.clientIds,
      lastServerSeq: s.lastServerSeq,
    });
    this.send({
      type: "SYNC",
      docId,
      generation: s.generation,
      step: "step1",
      data: s.vector,
    });
    this.arm(HANDSHAKE_TIMEOUT_MS, () => this.timedOut());
  }

  stop(): void {
    this.stopped = true;
    this.end();
  }

  resume(): void {
    this.stopped = false;
  }

  receive(m: DocumentMessage): void {
    switch (m.type) {
      case "SUBSCRIBED":
        if (this.phase !== "handshake") return;
        this.gotSubscribed = true;
        this.generation = m.generation;
        this.host.subscribed(m);
        this.arm(HANDSHAKE_TIMEOUT_MS, () => this.timedOut());
        return;
      case "SYNC":
        this.sync(m);
        return;
      case "ACK":
        this.answered((clientSeq) => clientSeq <= m.clientSeq);
        this.host.acknowledged(m.clientSeq, m.serverSeq);
        this.pump();
        return;
      case "GENERATION_MOVED":
        this.end();
        this.host.ended({ type: "moved" });
        return;
      case "AWARENESS":
        this.host.awareness(m.update);
        return;
      case "CONTROL": {
        const refusal =
          m.kind === "upstream_refused" ? readRefusal(m.data) : null;
        if (refusal !== null) this.refuse(refusal.clientSeq, refusal.message);
        return;
      }
      case "SUBSCRIBE":
      case "UNSUBSCRIBE":
      case "PUSH":
      case "SET":
      case "VIEW_SNAPSHOT":
      case "VIEW_PATCH":
        return;
      default:
        m satisfies never;
    }
  }

  error(m: ErrorMessage): void {
    if (m.code === CODE.SETTING_REFUSED && m.clientSeq !== null) {
      this.refuse(m.clientSeq, m.message);
      return;
    }
    this.end();
    const ending = endingOf(m, this.gate);
    if (ending === null)
      this.arm(m.retryAfterMs ?? 1_000, () => this.subscribe());
    else this.host.ended(ending);
  }

  skipped(): void {
    if (this.phase === "handshake") this.timedOut();
  }

  pump(): void {
    if (this.phase !== "live" || this.stopped) return;
    for (const item of this.host.outbox(this.sentThrough)) {
      if (this.inFlight.length >= IN_FLIGHT) return;
      this.sendItem(item);
      this.inFlight.push(item.clientSeq);
      this.sentThrough = item.clientSeq;
      if (this.inFlight.length === 1) this.armAck();
    }
  }

  sendAwareness(update: Uint8Array): void {
    if (this.phase === "live")
      this.send?.({
        type: "AWARENESS",
        docId: this.docId,
        generation: this.generation,
        update,
      });
  }

  close(): void {
    if (this.gotSubscribed)
      this.send?.({
        type: "UNSUBSCRIBE",
        docId: this.docId,
        generation: this.generation,
      });
    this.stop();
  }

  subscribed(): boolean {
    return this.gotSubscribed;
  }

  merged(): boolean {
    return this.phase === "live";
  }

  private sync(m: Extract<DocumentMessage, { type: "SYNC" }>): void {
    if (!this.gotSubscribed || m.step === "step1") {
      if (this.phase === "handshake" && this.gotSubscribed)
        this.arm(HANDSHAKE_TIMEOUT_MS, () => this.timedOut());
      return;
    }
    if (!isWholeUpdate(m.data)) {
      this.host.replaceConnection("bad_update");
      return;
    }
    if (m.step === "update") {
      this.host.update(m.data);
      return;
    }
    if (this.phase !== "handshake") return;
    this.disarm();
    this.phase = "live";
    this.timeouts = 0;
    this.host.stepTwo(m.data);
    this.pump();
  }

  private sendItem(item: OutboxItem): void {
    const { docId, generation } = this;
    if (item.kind === "push")
      this.send?.({
        type: "PUSH",
        docId,
        generation,
        clientSeq: item.clientSeq,
        update: item.update,
        heal: false,
      });
    else
      this.send?.({
        type: "SET",
        docId,
        generation,
        clientSeq: item.clientSeq,
        key: item.key,
        value: UTF8.encode(item.value),
      });
  }

  /** The first timeout subscribes again; a second in a row replaces the connection. */
  private timedOut(): void {
    if (this.timeouts > 0) {
      this.disarm();
      this.host.replaceConnection("handshake_timeout");
      return;
    }
    this.timeouts = 1;
    this.send?.({
      type: "UNSUBSCRIBE",
      docId: this.docId,
      generation: this.generation,
    });
    this.subscribe();
  }

  private refuse(clientSeq: number, message: string): void {
    this.answered((s) => s === clientSeq);
    this.host.refused(clientSeq, message);
  }

  /** Drops the answered entries from those in flight; the ACK timeout follows the oldest. */
  private answered(isAnswered: (clientSeq: number) => boolean): void {
    const oldest = this.inFlight[0];
    this.inFlight = this.inFlight.filter((clientSeq) => !isAnswered(clientSeq));
    if (this.inFlight[0] !== oldest) this.armAck();
  }

  private armAck(): void {
    if (this.inFlight.length === 0) this.disarm();
    else this.arm(ACK_TIMEOUT_MS, () => this.subscribe());
  }

  private arm(delayMs: number, fn: () => void): void {
    this.cancel?.();
    this.cancel = this.clock.schedule(fn, delayMs);
  }

  private disarm(): void {
    this.cancel?.();
    this.cancel = null;
  }

  private end(): void {
    this.disarm();
    this.inFlight = [];
    this.gotSubscribed = false;
    this.phase = this.send === null ? "off" : "idle";
  }
}

export function createHandshake(options: {
  docId: string;
  clock: Clock;
  host: HandshakeHost;
}): Handshake {
  return new Exchange(options);
}
