// A person's one-way facts, such as having seen the Tour: kept in their private index, and on this device as well.
import type { KeyValueMap } from "@manent/settings";
import { createLocalMap } from "./local-map.ts";
import type { StorageEvents } from "./local-map.ts";
import type { Flags } from "./ports.ts";

/**
 * `index` holds `true` under each flag set, and so does `localStorage["manent.flags.<userId>"]`, which answers at once
 * while the index is still opening; a flag is never cleared.
 */
export function createFlags(options: {
  index: KeyValueMap;
  storage: Storage | null;
  userId: string;
  events: StorageEvents;
}): Flags & { dispose(): void } {
  const { index } = options;
  const local = createLocalMap({
    storage: options.storage,
    key: `manent.flags.${options.userId}`,
    events: options.events,
  });
  return {
    has: (flag) => local.get(flag) === true || index.get(flag) === true,
    set(flag) {
      if (local.get(flag) !== true) local.set(flag, true);
      if (index.get(flag) !== true) index.set(flag, true);
    },
    dispose: local.dispose,
  };
}
