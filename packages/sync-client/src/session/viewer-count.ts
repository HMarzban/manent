// How many other people have a document open to read only, as the server last counted them.
import { parseViewerCount } from "@manent/sync-protocol";
import type { ControlKind } from "@manent/sync-protocol";
import { createSubscribable } from "../outbox/subscribable.ts";
import type { Subscribable } from "../ports/ports.ts";

/** 0 until the server counts someone, and again while nothing follows the server. */
export interface ViewerCount {
  readonly value: Subscribable<number>;
  /** A CONTROL for the document; one of another kind, or whose data is no count, changes nothing. */
  control(control: { kind: ControlKind; data: Uint8Array }): void;
  /** The subscription or the connection that carried the count ended. */
  ended(): void;
}

export function createViewerCount(): ViewerCount {
  const value = createSubscribable(0);
  return {
    value,
    control({ kind, data }) {
      if (kind !== "viewers_counted") return;
      const count = parseViewerCount(data);
      if (count !== null) value.set(count);
    },
    ended: () => value.set(0),
  };
}
