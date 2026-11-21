// The Recovered text a document shows: what its copy filed, after what the local node's upstream
// filed when the node is the copy's store.
import { createSubscribable } from "../outbox/subscribable.ts";
import type { RecoveredItem, Subscribable } from "../ports/ports.ts";
import { withFiled } from "./recover.ts";

export class RecoveredList {
  /** What the copy filed, in the order it was filed. */
  items: readonly RecoveredItem[] = [];
  private readonly shown = createSubscribable<readonly RecoveredItem[]>([]);
  private readonly unwatch: () => void;

  /** `upstream`: the Recovered text of the node's upstream; null when the copy syncs with the server itself. */
  constructor(
    private readonly upstream: Subscribable<readonly RecoveredItem[]> | null,
  ) {
    this.unwatch = upstream?.subscribe(() => this.show()) ?? (() => {});
  }

  get view(): Subscribable<readonly RecoveredItem[]> {
    return this.shown;
  }

  /** The copy's list is `items` from now on. */
  reset(items: readonly RecoveredItem[]): void {
    this.items = items;
    this.show();
  }

  /** `items` filed after the list: one under an id the list holds takes that item's place. */
  file(items: readonly RecoveredItem[]): void {
    this.items = withFiled(this.items, items);
    this.show();
  }

  dispose(): void {
    this.unwatch();
  }

  private show(): void {
    this.shown.set([...(this.upstream?.get() ?? []), ...this.items]);
  }
}
