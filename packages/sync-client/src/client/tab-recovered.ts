// The Recovered text a following tab shows: what it filed itself when the leader's document took
// the place of its own, merged with the leader's items as they come.
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { createSubscribable } from "../outbox/subscribable.ts";
import type { RecoveredItem, SyncClientPorts } from "../ports/ports.ts";
import { differingText, withFiled } from "../recovery/recover.ts";

/** Two items of the same block and text are the same Recovered text. */
function sameText(item: RecoveredItem): string {
  return JSON.stringify([item.blockId, item.text]);
}

export class TabRecovered {
  readonly view = createSubscribable<readonly RecoveredItem[]>([]);
  private items: RecoveredItem[] = [];
  /** The ids of the items this tab filed itself, which the leader may file again. */
  private readonly filedHere = new Set<string>();

  constructor(
    private readonly options: { docId: string; ports: SyncClientPorts },
  ) {}

  /**
   * The `touched` blocks, as `previous` held them and `next` does not: the
   * leader may never have received the edits that touched them, so their text
   * is filed here, as Recovered text of this tab.
   */
  fileUnsaved(
    previous: CrdtDoc,
    next: CrdtDoc,
    touched: ReadonlySet<string>,
  ): void {
    if (touched.size === 0) return;
    const { docId, ports } = this.options;
    const theirs = scriptBody(next).materialize();
    const mine = scriptBody(previous).materialize();
    const found = differingText(mine, theirs, (id) => touched.has(id));
    const items = found.map((leftover) => ({
      id: ports.random.bytes(16).toHex(),
      docId,
      ...leftover,
      recoveredAt: ports.clock.now(),
    }));
    for (const item of items) this.filedHere.add(item.id);
    this.set([...this.items, ...items]);
  }

  /** The leader's items; one this tab filed with the same block and text gives way to it, and one under an id held already takes its place. */
  fileLeaders(items: readonly RecoveredItem[]): void {
    const filed = new Set(items.map(sameText));
    const kept = this.items.filter((item) => {
      if (!this.filedHere.has(item.id) || !filed.has(sameText(item)))
        return true;
      this.filedHere.delete(item.id);
      return false;
    });
    this.set(withFiled(kept, items));
  }

  private set(items: RecoveredItem[]): void {
    this.items = items;
    this.view.set(items);
  }
}
