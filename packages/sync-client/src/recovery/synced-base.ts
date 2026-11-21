// What this device knows the server holds of a document: the synced base the store gave, with
// every server update received since and every own update the server acknowledged.
import { createDoc, loadDoc } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocJSON } from "@manent/schema";
import type { StoredUpdate } from "../ports/ports.ts";
import { reconnectOverlaps } from "../review/overlaps.ts";
import type { Leftover } from "./recover.ts";

/** A heal push sent and not yet answered. */
interface Heal {
  clientSeq: number;
  update: Uint8Array;
}

/**
 * The common ancestor a recovery and a reconnect merge this device's changes
 * and the server's against. The document is loaded at first use, so a session
 * that takes nothing never holds a second copy.
 */
export class SyncedBase {
  /** The heal push in flight; null when none is. */
  heal: Heal | null = null;
  private doc: CrdtDoc | null = null;

  /** `stored`: the store's synced base; null when there is none. */
  constructor(private stored: Uint8Array | null) {}

  /** The base's state; null when nothing was ever synced. */
  state(): Uint8Array | null {
    return this.doc?.encodeState() ?? this.stored;
  }

  /** The base's state vector; null when nothing was ever synced. */
  vector(): Uint8Array | null {
    if (this.doc === null && this.stored === null) return null;
    return this.loaded().encodeStateVector();
  }

  /** A server update. */
  take(update: Uint8Array): void {
    this.loaded().applyUpdate(update);
  }

  /** The server's step 2 of a reconnect, which the base takes: the overlaps it makes with `mine`, the content before it; none without mine. */
  stepTwo(
    update: Uint8Array,
    mine: DocJSON | null,
    own: readonly number[],
  ): Leftover[] {
    const found =
      mine === null ? [] : reconnectOverlaps(this.state(), update, mine, own);
    this.take(update);
    return found;
  }

  /** The requests through `clientSeq` are acknowledged: the heal push and the own updates of `waiting` they cover join the base. */
  acknowledged(clientSeq: number, waiting: readonly StoredUpdate[]): void {
    const { heal } = this;
    if (heal !== null && clientSeq >= heal.clientSeq) {
      this.heal = null;
      this.take(heal.update);
    }
    for (const e of waiting) if (e.localSeq <= clientSeq) this.take(e.update);
  }

  /** The server's whole state, as a recovery or a move loads it, is the base from now on. */
  reset(state: Uint8Array): void {
    this.doc?.destroy();
    this.doc = null;
    this.stored = state;
    this.heal = null;
  }

  private loaded(): CrdtDoc {
    this.doc ??= this.stored === null ? createDoc() : loadDoc(this.stored);
    return this.doc;
  }
}
