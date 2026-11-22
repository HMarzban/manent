// Overlaps found while online: a block someone else changes within a few seconds of a change
// made to it here.
import { readBlockExcluding, updateMeta } from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import type { Clock, RecoveredItem } from "../ports/ports.ts";
import { overlapLeftover } from "../recovery/recover.ts";
import type { Leftover } from "../recovery/recover.ts";
import { isSameBlock } from "./overlaps.ts";

/** A change from elsewhere this soon after a change made here to the same block is an overlap. */
export const OVERLAP_WINDOW_MS = 3_000;

/** One change made here: when, and from which clock of this device's client. */
interface Change {
  at: number;
  fromClock: number;
}

/** A block changed here: its changes, oldest first, and the block as the last left it. */
interface Touch {
  changes: Change[];
  mine: BlockJSON;
}

/** What the window reads of the copy it watches. */
interface WindowHost {
  readonly doc: CrdtDoc;
  readonly recovered: readonly RecoveredItem[];
  items(leftovers: readonly Leftover[]): RecoveredItem[];
}

function isRecent(change: Change, now: number): boolean {
  return now - change.at <= OVERLAP_WINDOW_MS;
}

function idOf(block: BlockJSON): string | null {
  const id = block.attrs?.id;
  return typeof id === "string" ? id : null;
}

/**
 * The blocks changed here within the window, the longest untouched first;
 * entries older than the window are dropped when read. Only the blocks a
 * report names are read, never the whole script.
 */
export class OverlapWindow {
  private readonly touched = new Map<string, Touch>();
  /** By block: the overlaps found since the last `take`. */
  private found = new Map<string | null, RecoveredItem>();
  /** By block: the id of the last overlap this window filed, which a later one replaces. */
  private readonly filed = new Map<string | null, string>();
  private readonly host: WindowHost;
  private readonly clock: Clock;

  constructor(host: WindowHost, clock: Clock) {
    this.host = host;
    this.clock = clock;
  }

  /** A change made here: each block it inserted or changed, as it left it. */
  own(report: TransactionReport): void {
    const { clientId } = this.host.doc;
    const own = updateMeta(report.update).find((m) => m.clientId === clientId);
    if (own === undefined) return;
    const at = this.clock.now();
    this.forget(at);
    const blocks = [...report.inserted.map((i) => i.block), ...report.changed];
    for (const mine of blocks) {
      const blockId = idOf(mine);
      if (blockId === null) continue;
      const earlier = this.touched.get(blockId)?.changes ?? [];
      const changes = earlier.filter((change) => isRecent(change, at));
      changes.push({ at, fromClock: own.fromClock });
      // set again at the end, so that the map stays in the order of the last change
      this.touched.delete(blockId);
      this.touched.set(blockId, { changes, mine });
    }
  }

  /**
   * A change from the server, `own` holding this device's client IDs: each
   * block it changed that a change made here touched within the window, read
   * without the text of this device's changes within the window. A change
   * only `own` clients made is none.
   */
  remote(report: TransactionReport, own: ReadonlySet<number>): void {
    const others = updateMeta(report.update)
      .map((m) => m.clientId)
      .filter((clientId) => !own.has(clientId))
      .toSorted((a, b) => a - b);
    if (others.length === 0) return;
    const now = this.clock.now();
    this.forget(now);
    const { doc } = this.host;
    const leftovers: Leftover[] = [];
    for (const block of report.changed) {
      const blockId = idOf(block);
      const touch = blockId === null ? undefined : this.touched.get(blockId);
      const first = touch?.changes.find((change) => isRecent(change, now));
      if (blockId === null || touch === undefined || first === undefined)
        continue;
      const exclude = new Map([[doc.clientId, first.fromClock]]);
      const theirs = readBlockExcluding(doc, blockId, exclude);
      if (theirs === null || isSameBlock(theirs, touch.mine)) continue;
      const overlap = { blockId, mine: touch.mine, theirs };
      leftovers.push(overlapLeftover(overlap, others));
    }
    // each takes the id of the overlap this window filed for its block and still open, which it
    // replaces; one a merge filed holds a wording kept nowhere else, and stays
    for (const item of this.host.items(leftovers)) {
      const earlier = this.filed.get(item.blockId);
      const open = this.host.recovered.some((r) => r.id === earlier);
      const id = earlier !== undefined && open ? earlier : item.id;
      this.filed.set(item.blockId, id);
      this.found.set(item.blockId, { ...item, id });
    }
  }

  /** The overlaps found since the last call. */
  take(): RecoveredItem[] {
    const found = [...this.found.values()];
    this.found = new Map();
    return found;
  }

  private forget(now: number): void {
    for (const [blockId, touch] of this.touched) {
      const last = touch.changes.at(-1);
      if (last !== undefined && isRecent(last, now)) return;
      this.touched.delete(blockId);
    }
  }
}
