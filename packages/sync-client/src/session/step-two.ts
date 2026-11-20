// The server's step 2 as the leading tab's copy applies it: held while the app holds remote
// updates, then applied on its own after the updates buffered, and stored only when it changes
// something.
import type { CrdtDoc } from "@manent/crdt";
import type { Coalescer } from "../coalescer/coalescer.ts";
import type { RecoveredItem } from "../ports/ports.ts";
import type { Leftover } from "../recovery/recover.ts";
import { changedByStepTwo } from "../review/overlaps.ts";

/** What a step 2 asks of the copy it is applied to. */
export interface StepTwoHost {
  /** The bound document, and the coalescer that applies server updates to it. */
  doc(): CrdtDoc;
  coalescer(): Coalescer;
  /** Applies a server update; returns what it set aside, as Recovered text. */
  applyServer(update: Uint8Array): RecoveredItem[];
  /** Recovered text of this document, each piece under a new id. */
  items(leftovers: readonly Leftover[]): RecoveredItem[];
  /** Drops the overlaps found online so far. */
  dropOnline(): void;
  /** The step changed the document: it is stored as applied, and `items` filed with it. */
  store(update: Uint8Array, items: RecoveredItem[]): void;
}

export class StepTwo {
  /** The holds of remote updates the app has not released. */
  private holding = 0;
  /** Step 2s that arrived while remote updates were held, in order. */
  private waiting: { update: Uint8Array; overlaps: Leftover[] }[] = [];
  private remoteChanged = false;

  constructor(private readonly host: StepTwoHost) {}

  /** Whether the app holds remote updates. */
  get held(): boolean {
    return this.holding > 0;
  }

  hold(): void {
    this.host.coalescer().hold();
    this.holding += 1;
  }

  /** True once no hold is left, the steps held then applied. */
  release(): boolean {
    this.host.coalescer().release();
    this.holding -= 1;
    if (this.holding > 0) return false;
    this.mergeHeld();
    return true;
  }

  /** A coalescer bound in place of the last one takes the holds still open. */
  holdAll(coalescer: Coalescer): void {
    for (let i = 0; i < this.holding; i++) coalescer.hold();
  }

  merge(update: Uint8Array, overlaps: Leftover[]): void {
    if (this.holding > 0) this.waiting.push({ update, overlaps });
    else this.mergeNow(update, overlaps);
  }

  /** Every server update buffered or held is applied now, and the holds stay. */
  flushAll(): void {
    const coalescer = this.host.coalescer();
    for (let i = 0; i < this.holding; i++) coalescer.release();
    coalescer.flushNow();
    this.mergeHeld();
    this.holdAll(coalescer);
  }

  /** A server change reached the bound document. */
  remote(): void {
    this.remoteChanged = true;
  }

  /** Step 2 is applied on its own, after what is buffered: merged with them, its delete set, which holds what went with a deleted parent, would hide what they set aside. */
  private mergeNow(update: Uint8Array, overlaps: Leftover[]): void {
    const { host } = this;
    host.coalescer().flushNow();
    this.remoteChanged = false;
    const changed = changedByStepTwo(host.doc(), overlaps);
    const items = [...host.applyServer(update), ...host.items(changed())];
    // a reconnect's overlaps are found against the synced base, not the window
    host.dropOnline();
    if (this.remoteChanged) host.store(update, items);
  }

  private mergeHeld(): void {
    for (const { update, overlaps } of this.waiting.splice(0))
      this.mergeNow(update, overlaps);
  }
}
