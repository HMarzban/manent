// What a commit could not write because the disk is full, held in arrival order and tried again
// until it commits.
import type { DocFile } from "@manent/storage";
import type { Clock } from "./ports.ts";
import type { QueuedItem } from "./write-path.ts";

/** How long held commits wait before they are tried again. */
export const HELD_RETRY_MS = 5000;

/** Whether committing the item appends a row: anything else is answered at the room's head. */
const appends = (item: QueuedItem): boolean =>
  item.kind === "append" ||
  item.kind === "ingest" ||
  (item.kind === "replay" && item.write.update !== null);

export interface HeldQueue {
  /** What a commit could not write because the disk is full, in arrival order; each is given the sequence its commit will give it. */
  hold(items: readonly QueuedItem[]): void;
  /** Tries one transaction per file for everything held; on success its items are acknowledged in arrival order. */
  retry(): void;
  size(): number;
  readonly state: "ok" | "failing";
}

/** `commit` writes one file's held items and acknowledges them; it returns false while the disk is still full. */
export function createHeldQueue(options: {
  clock: Clock;
  retryMs: number;
  commit(items: readonly QueuedItem[]): boolean;
  onState(state: "ok" | "failing"): void;
}): HeldQueue {
  const { clock, retryMs } = options;
  let held: QueuedItem[] = [];
  let state: "ok" | "failing" = "ok";
  let cancel: (() => void) | null = null;

  const become = (next: "ok" | "failing"): void => {
    if (state === next) return;
    state = next;
    options.onState(next);
  };

  function retry(): void {
    cancel?.();
    cancel = null;
    const byFile = new Map<DocFile, QueuedItem[]>();
    for (const item of held)
      byFile.set(item.room.file, [...(byFile.get(item.room.file) ?? []), item]);
    const kept = new Set<QueuedItem>();
    for (const items of byFile.values())
      if (!options.commit(items)) for (const item of items) kept.add(item);
    held = held.filter((item) => kept.has(item));
    if (held.length === 0) return become("ok");
    cancel = clock.schedule(retry, retryMs);
  }

  return {
    hold(items) {
      for (const item of items) {
        const { room } = item;
        const ahead = held.findLast((h) => h.room === room)?.seq;
        const head = ahead ?? room.row.headSeq;
        item.seq = appends(item) ? head + 1 : head;
        held.push(item);
      }
      become("failing");
      cancel ??= clock.schedule(retry, retryMs);
    },
    retry,
    size: () => held.length,
    get state() {
      return state;
    },
  };
}
