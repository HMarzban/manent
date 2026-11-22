// The one place a sync client's value is handed to the interface: the two packages declare one shape.
import type { Subscribable as SyncSubscribable } from "@manent/sync-client";
import type { Subscribable as UiSubscribable } from "@manent/ui";

/** The same object; a change to either declaration that parts them fails to compile here. */
export function asUiSubscribable<T>(
  value: SyncSubscribable<T>,
): UiSubscribable<T> {
  return value;
}
