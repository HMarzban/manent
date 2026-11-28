// What this device does when the server moves a document to a new generation: the edits waiting
// against the old one are replayed once, under one key, and the new document is loaded under a
// new client ID, with what was typed meanwhile merged into it.
import {
  ORIGIN_LOAD,
  ORIGIN_REMOTE,
  ORIGIN_REPLAY,
  applyBlockOps,
  createDoc,
  hasDeletedOwn,
  loadDoc,
  observeScript,
  scriptBody,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { canonicalDoc } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import type { ReplayRefusal, ReplayResponse } from "@manent/sync-protocol";
import { backoffDelayMs } from "../link/backoff.ts";
import { SUBSCRIBE_CLIENT_IDS } from "../ports/defaults.ts";
import { ConnectError } from "../ports/ports.ts";
import type { DocMeta, SyncClientPorts } from "../ports/ports.ts";
import { mergeMine } from "../recovery/recover.ts";
import type { HandshakeHost } from "../session/handshake.ts";
import type { Journal } from "../session/journal.ts";
import type { LocalCopy } from "../session/local-copy.ts";
import { filedOnLoad } from "./filed-on-load.ts";

type Moving = NonNullable<DocMeta["moving"]>;
type ParkReason = NonNullable<DocMeta["parked"]>["reason"];

/** What a move asks of the subscription it runs for. */
export interface MoveHost {
  readonly docId: string;
  readonly ports: SyncClientPorts;
  readonly journal: Journal;
  readonly copy: LocalCopy;
  connected(): boolean;
  /** What the session shows may have changed. */
  changed(): void;
  /** SUBSCRIBE again, with what the move's `subscription` gives while it loads. */
  subscribe(): void;
  park(reason: ParkReason): void;
  /** The move is over, or never began: the subscription goes on without it. */
  ended(): void;
  /** The tabs following this document, each of which keeps the document a move left until it has moved too. */
  followers(): string[];
  /** When a sync is recorded as made now; null: the last sync is not this move's to record. */
  syncedAt(): number | null;
  /** The document a move left, kept while something may still write to it; null once it is released. */
  leave(left: LeftDoc | null): void;
}

/** How a refused replay ends: tried again, kept as a recovered version, back to the old generation, or parked. */
type Refused =
  | { kind: "again" }
  | { kind: "past_window" }
  | { kind: "rejected"; status: number }
  | { kind: "current" }
  | { kind: "park"; reason: ParkReason };

const REFUSED: Readonly<Record<ReplayRefusal, Refused>> = Object.freeze({
  bad_request: { kind: "rejected", status: 400 },
  busy: { kind: "again" },
  deleted: { kind: "park", reason: "deleted" },
  forbidden: { kind: "park", reason: "access_removed" },
  generation_current: { kind: "current" },
  incomplete: { kind: "rejected", status: 422 },
  invalid: { kind: "rejected", status: 422 },
  not_found: { kind: "park", reason: "access_removed" },
  past_window: { kind: "past_window" },
  too_large: { kind: "rejected", status: 413 },
  unknown_generation: { kind: "rejected", status: 409 },
});

/**
 * The document a move left, kept while anything may still write to it: an
 * input method's composition the app finishes, and each following tab until it
 * has loaded the new document. What reaches it is carried into the bound one.
 */
export class LeftDoc {
  private before: DocJSON;
  private readonly keepers: Set<string>;
  private appDone = false;
  private readonly unobserve: () => void;

  constructor(
    private readonly doc: CrdtDoc,
    readonly generation: number,
    private readonly host: MoveHost,
  ) {
    this.before = scriptBody(doc).materialize();
    this.keepers = new Set(host.followers());
    this.unobserve = observeScript(doc, (report) => {
      if (report.origin === ORIGIN_LOAD || report.origin === ORIGIN_REMOTE)
        return;
      // nothing may throw into Yjs: what does is thrown again once the change is done
      try {
        this.carry();
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    });
  }

  /** A following tab's edit made in it. */
  edit(update: Uint8Array): void {
    this.doc.applyUpdate(update, ORIGIN_REPLAY);
  }

  /** A following tab no longer holds it. */
  released(tabId: string): void {
    this.keepers.delete(tabId);
    this.releaseWhenDone();
  }

  /** The app holds no composition in it any more. */
  idle(): void {
    this.appDone = true;
    this.releaseWhenDone();
  }

  /** The change this document took, merged into the bound one as ordinary edits; what cannot be placed is Recovered text. */
  private carry(): void {
    const { copy } = this.host;
    const after = scriptBody(this.doc).materialize();
    const bound = scriptBody(copy.doc).materialize();
    const merge = mergeMine(this.before, after, bound, "merge");
    this.before = after;
    applyBlockOps(copy.doc, merge.ops, ORIGIN_REPLAY);
    copy.file(copy.items(merge.leftovers), 0);
  }

  private releaseWhenDone(): void {
    if (!this.appDone || this.keepers.size > 0) return;
    this.unobserve();
    this.doc.destroy();
    this.host.leave(null);
  }
}

/** Writing the key, replaying the waiting edits, loading the new document. */
type Phase = "begin" | "replay" | "load";

/**
 * A move of one document to `moving.to`. `active`: under way, so the document
 * shows as syncing and a refusal of the old generation is not acted on.
 */
export class Move {
  private phase: Phase = "begin";
  /**
   * The content the replay was made from, against which typing meanwhile is found; server updates
   * still buffered are applied first, so that they never count as typing.
   */
  private sent: DocJSON;
  private response: ReplayResponse | null = null;
  private clientId: number | null = null;
  private attempt = 0;
  private inFlight = false;
  private stopped = false;
  private cancel: (() => void) | null = null;

  /** `moving`: the move as the stored meta names it, or as GENERATION_MOVED begins it. */
  constructor(
    private readonly host: MoveHost,
    private moving: Moving,
  ) {
    this.sent = host.copy.mine();
  }

  get active(): boolean {
    return this.phase !== "begin";
  }

  /** With nothing waiting, straight to loading; else a device version, then the key, stored before anything is sent. */
  async begin(): Promise<void> {
    const { journal, copy, ports } = this.host;
    const waiting = journal.waitingUpdates();
    let through = 0;
    for (const e of journal.entries)
      if (e.localSeq > through) through = e.localSeq;
    if (waiting.length === 0) {
      this.moving = { ...this.moving, throughLocalSeq: through };
      journal.patch({ moving: this.moving });
      this.load();
      return;
    }
    copy.recordVersion("device", "before_reconnect");
    const key = ports.random.bytes(16).toHex();
    let throughLocalSeq = waiting[0]!.localSeq;
    for (const e of waiting)
      if (e.localSeq > throughLocalSeq) throughLocalSeq = e.localSeq;
    const moving = { ...this.moving, key, throughLocalSeq };
    const held = await journal.commit({ moving });
    if (this.stopped) return;
    if (held) {
      this.moving = moving;
      this.phase = "replay";
      this.host.changed();
      this.replay();
      return;
    }
    // a key the device could lose is never sent: the old generation is asked again, and answers with the move
    this.cancel = ports.clock.schedule(() => this.end(), 1_000);
  }

  /** A move found in the stored meta when the document opened. */
  resume(): void {
    if (this.moving.key === null) this.load();
    else this.phase = "replay";
  }

  /** What SUBSCRIBE carries while the new document loads; null before. */
  subscription(): ReturnType<HandshakeHost["subscription"]> | null {
    if (this.phase !== "load") return null;
    const { clientIds } = this.host.journal.meta;
    return {
      generation: this.moving.to,
      clientIds: clientIds.slice(-SUBSCRIBE_CLIENT_IDS),
      lastServerSeq: 0,
      vector: createDoc().encodeStateVector(),
    };
  }

  /** A later move during this one: the newest generation is loaded. */
  raise(to: number): void {
    if (to > this.moving.to) {
      this.moving = { ...this.moving, to };
      this.host.journal.patch({ moving: this.moving });
    }
    if (this.phase === "load") this.host.subscribe();
  }

  /** A connection is up: the move goes on, and the subscription waits for it. */
  connected(): void {
    if (this.phase === "load") this.host.subscribe();
    if (this.phase !== "replay") return;
    this.attempt = 0;
    this.replay();
  }

  /** The new document's state replaces the old one, which is kept while something may still write to it; `synced`: the old one's synced base. */
  loaded(update: Uint8Array, headSeq: number, synced: DocJSON): void {
    const { journal, copy } = this.host;
    const { clientId } = this;
    if (clientId === null)
      throw new RangeError(
        "a move loads its document only under a new client ID",
      );
    const next = loadDoc(update, { clientId });
    const before = copy.mine();
    // compared in canonical form, so that two spellings of one content are the same
    const typed =
      JSON.stringify(canonicalDoc(this.sent)) !==
      JSON.stringify(canonicalDoc(before));
    const theirs = scriptBody(next).materialize();
    const local = typed ? mergeMine(this.sent, before, theirs, "merge") : null;
    const removed = hasDeletedOwn(next, new Set(journal.meta.clientIds));
    const { response: answer, sent } = this;
    const load = { answer, synced, sent, local, theirs, removed };
    const items = copy.items(filedOnLoad(load));
    const { to } = this.moving;
    const meta = { ...journal.meta, generation: to, lastServerSeq: headSeq };
    journal.reset(
      next.encodeState(),
      { ...meta, ackedClocks: {}, moving: null },
      items,
    );
    const left = copy.doc;
    copy.replace(next, items);
    this.stop();
    this.host.leave(new LeftDoc(left, this.moving.from, this.host));
    // the replacement is told first, so that a following tab loads it before the writes reach it
    copy.showReplaced(items, "generation");
    if (local !== null) applyBlockOps(next, local.ops, ORIGIN_REPLAY);
    copy.emit({
      type: "rebuilt",
      applied: (this.response?.applied ?? 0) + (local?.applied ?? 0),
      overlaps: items.filter((item) => item.cause === "overlap").length,
      setAside: items.filter((item) => item.cause === "merge").length,
    });
  }

  /** Nothing more is sent, and a late answer is not heard. */
  stop(): void {
    this.stopped = true;
    this.cancel?.();
    this.cancel = null;
  }

  /** Under the stored key; a lost answer or a busy server is tried again with backoff. */
  private replay(): void {
    const { host } = this;
    const { from, key, throughLocalSeq } = this.moving;
    if (this.stopped || this.inFlight || key === null) return;
    if (!host.connected()) return;
    this.cancel?.();
    this.inFlight = true;
    const updates = host.journal
      .waitingUpdates()
      .filter((e) => e.localSeq <= throughLocalSeq)
      .map((e) => e.update);
    host.ports.transport
      .replay({
        docId: host.docId,
        generation: from,
        lastServerSeq: host.journal.meta.lastServerSeq,
        key,
        updates,
      })
      .then(
        (answer) => {
          this.inFlight = false;
          if (this.stopped) return;
          if (answer.ok) this.answered(answer.response);
          else this.refusedAs(REFUSED[answer.code]);
        },
        (error: unknown) => {
          this.inFlight = false;
          if (!(error instanceof ConnectError)) throw error;
          if (!this.stopped) this.again();
        },
      );
  }

  private again(): void {
    const { random, clock } = this.host.ports;
    const delayMs = backoffDelayMs(this.attempt++, random.next());
    this.cancel = clock.schedule(() => this.replay(), delayMs);
  }

  private answered(response: ReplayResponse): void {
    this.response = response;
    this.moving = { ...this.moving, to: response.generation };
    const syncedAt = this.host.syncedAt();
    this.host.journal.patch({
      moving: this.moving,
      ...(syncedAt === null ? {} : { lastSyncedAt: syncedAt }),
    });
    this.load();
  }

  private refusedAs(refused: Refused): void {
    const { copy, journal } = this.host;
    switch (refused.kind) {
      case "again":
        this.again();
        return;
      case "past_window":
      case "rejected": {
        const versionId = copy.recordVersion("recovered", refused.kind).id;
        if (refused.kind === "past_window")
          copy.emit({ type: "past_window", versionId });
        else {
          const code = refused.status;
          copy.emit({ type: "rejected", code, replayed: 0, setAside: 0 });
        }
        // as if nothing were waiting: the reset drops the old entries, whose text is in the version
        this.sent = copy.mine();
        this.moving = { ...this.moving, key: null };
        journal.patch({ moving: this.moving });
        this.load();
        return;
      }
      case "current":
        journal.patch({ moving: null });
        this.end();
        return;
      case "park":
        this.stop();
        this.host.park(refused.reason);
        return;
      default:
        refused satisfies never;
    }
  }

  /** A new client ID, stored first, then SUBSCRIBE of the new generation from nothing. */
  private load(): void {
    const { journal, ports } = this.host;
    this.phase = "load";
    this.clientId = journal.freshClientId(null, ports.random);
    journal.patch({ clientIds: [...journal.meta.clientIds, this.clientId] });
    if (this.host.connected()) this.host.subscribe();
  }

  private end(): void {
    this.stop();
    this.host.ended();
  }
}
