// A person's one-way facts on this device, such as having seen the Tour.
import { createLocalMap } from "./local-map.ts";
import type { StorageEvents } from "./local-map.ts";
import type { Flags } from "./ports.ts";

/** `localStorage["manent.flags.<userId>"]`, one JSON object of the flags set; a flag is never cleared. */
export function createFlags(options: {
  storage: Storage | null;
  userId: string;
  events: StorageEvents;
}): Flags & { dispose(): void } {
  const map = createLocalMap({
    storage: options.storage,
    key: `manent.flags.${options.userId}`,
    events: options.events,
  });
  return {
    has: (flag) => map.get(flag) === true,
    set(flag) {
      if (map.get(flag) !== true) map.set(flag, true);
    },
    dispose: map.dispose,
  };
}
