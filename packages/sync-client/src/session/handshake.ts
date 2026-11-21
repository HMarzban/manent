// One document's exchange with the server on the current connection: the subscription and
// the server's two steps, the outbox in flight, and what each ERROR ends.
import { CrdtUpdateError, readStateVector, updateMeta } from "@manent/crdt";
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
import { endingOf, readRefusal } from "./refusals.ts";
import type { Ending } from "./refusals.ts";
import { SubscribeAnswers } from "./subscribe-answers.ts";

type Subscribed = Extract<DocumentMessage, { type: "SUBSCRIBED" }>;
type ErrorMessage = Extract<Message, { type: "ERROR" }>;

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
  /**
   * The heal push to send before the outbox, given the server's state vector;
   * null when none is due. Its `clientSeq` is below every waiting setting and
   * every entry the outbox cannot send yet, so its acknowledgement covers only
   * what it carries; it is 0 when a setting is the first waiting entry.
   */
  heal(
    serverVector: Uint8Array,
  ): { clientSeq: number; update: Uint8Array } | null;
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
  /** UNSUBSCRIBE, then SUBSCRIBE again from the start. */
  resubscribe(): void;
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

/** False for bytes `read` refuses as not a whole update or state vector. */
function isWhole(
  bytes: Uint8Array,
  read: (bytes: Uint8Array) => unknown,
): boolean {
  try {
    read(bytes);
    return true;
  } catch (error) {
    if (error instanceof CrdtUpdateError) return false;
    throw error;
  }
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
  private readonly answers = new SubscribeAnswers();
  /** The `clientSeq` of each push and setting sent and not yet answered, oldest first. */
  private inFlight: number[] = [];
  private sentThrough = 0;
  /** The server's step 1 on this subscription. */
  private serverVector: Uint8Array | null = null;
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
    this.answers.reset();
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
    this.serverVector = null;
    this.inFlight = [];
    this.sentThrough = 0;
    this.phase = "handshake";
    this.answers.asked();
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

  resubscribe(): void {
    this.unsubscribe();
    this.subscribe();
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
        if (this.answers.take() === "superseded" || this.phase !== "handshake")
          return;
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
        if (this.answers.take() === "superseded") return;
        this.end();
        this.host.ended({ type: "moved", newGeneration: m.newGeneration });
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
    if (m.clientSeq === null && this.answers.take() === "superseded") return;
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
    if (this.gotSubscribed) this.unsubscribe();
    this.stop();
  }

  subscribed(): boolean {
    return this.gotSubscribed;
  }

  merged(): boolean {
    return this.phase === "live";
  }

  private sync(m: Extract<DocumentMessage, { type: "SYNC" }>): void {
    if (!this.gotSubscribed) return;
    if (!isWhole(m.data, m.step === "step1" ? readStateVector : updateMeta)) {
      this.host.replaceConnection("bad_update");
      return;
    }
    if (m.step === "step1") {
      if (this.phase !== "handshake") return;
      this.serverVector = m.data;
      this.arm(HANDSHAKE_TIMEOUT_MS, () => this.timedOut());
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
    const heal =
      this.serverVector === null ? null : this.host.heal(this.serverVector);
    // the outbox goes on after it in order; the pushes it resends are duplicates
    if (heal !== null)
      this.sendEntry({
        type: "PUSH",
        docId: this.docId,
        generation: this.generation,
        ...heal,
        heal: true,
      });
    this.host.stepTwo(m.data);
    this.pump();
  }

  /** Sends a push or a setting, and waits for its answer. */
  private sendEntry(message: Extract<Message, { type: "PUSH" | "SET" }>): void {
    this.send?.(message);
    this.inFlight.push(message.clientSeq);
    this.sentThrough = message.clientSeq;
    if (this.inFlight.length === 1) this.armAck();
  }

  private sendItem(item: OutboxItem): void {
    const { docId, generation } = this;
    const { clientSeq } = item;
    if (item.kind === "push")
      this.sendEntry({
        type: "PUSH",
        docId,
        generation,
        clientSeq,
        update: item.update,
        heal: false,
      });
    else
      this.sendEntry({
        type: "SET",
        docId,
        generation,
        clientSeq,
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
    this.resubscribe();
  }

  private unsubscribe(): void {
    const { docId, generation } = this;
    this.send?.({ type: "UNSUBSCRIBE", docId, generation });
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
