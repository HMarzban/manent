// What a window whose store is the local node holds of the upstream the node relays its document
// through: the latest status, its Recovered text, and which of its events the window has told.
import type { DocumentMessage } from "@manent/sync-protocol";
import { createSubscribable } from "../outbox/subscribable.ts";
import type { RecoveredItem } from "../ports/ports.ts";
import type { DocEvent } from "../session/doc-handle.ts";
import { isUpstreamEvent } from "./events.ts";
import type { UpstreamEvent } from "./events.ts";
import { decodeUpstreamStatus } from "./status.ts";
import type { UpstreamStatus } from "./status.ts";

/** Where a client syncs its documents: with the server itself, or through the local node, which is then its store. */
export type Via = "server" | "local_node";

interface UpstreamWindowOptions {
  /** A status arrived, and is now the latest. */
  arrived(status: UpstreamStatus): void;
  /** One of the upstream's events the window has not told before, in order. */
  tell(event: UpstreamEvent): void;
}

/**
 * Each of the upstream's events reaches the window once. The highest `n` of
 * the first status counts as told, since what came before the window opened
 * is not replayed; the count starts again when `n` falls, as it does when the
 * node restarts.
 */
export class UpstreamWindow {
  readonly status = createSubscribable<UpstreamStatus | null>(null);
  readonly recovered = createSubscribable<readonly RecoveredItem[]>([]);
  /** The highest `n` told; null before the first status. */
  private told: number | null = null;

  constructor(private readonly options: UpstreamWindowOptions) {}

  /** True for the node's upstream status, which is the window's and not the subscription's; data that is not one changes nothing. */
  receive(message: DocumentMessage): boolean {
    if (message.type !== "CONTROL" || message.kind !== "upstream_status")
      return false;
    const status = decodeUpstreamStatus(message.data);
    if (status !== null) this.take(status);
    return true;
  }

  /** The window's part of the facts its status is derived from. */
  facts(): { via: "local_node"; upstream?: UpstreamStatus } {
    const upstream = this.status.get();
    return upstream === null
      ? { via: "local_node" }
      : { via: "local_node", upstream };
  }

  /**
   * For a document the node relays, the session's own event of a kind the
   * upstream reports says nothing: the node's move between itself and the
   * window is not the server's.
   */
  drops(event: DocEvent): boolean {
    return this.status.get()?.neverSynced === false && isUpstreamEvent(event);
  }

  /** For a document the node is the authority for, the window's own events are the only ones. */
  private take(status: UpstreamStatus): void {
    const { events } = status;
    const highest = Math.max(0, ...events.map((entry) => entry.n));
    const told = this.told ?? highest;
    const from = events.length > 0 && highest < told ? 0 : told;
    this.told = Math.max(from, highest);
    this.status.set(status);
    this.recovered.set(status.recovered);
    this.options.arrived(status);
    if (status.neverSynced) return;
    for (const { n, event } of events) if (n > from) this.options.tell(event);
  }
}
