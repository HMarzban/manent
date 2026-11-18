// This device's own preferences for one person: one JSON object in this origin's storage, shared by its tabs.
import { UNSET } from "@manent/settings";
import type { Bag } from "@manent/settings";
import { createLocalMap } from "./local-map.ts";
import type { StorageEvents } from "./local-map.ts";

/** `localStorage["manent.device.<userId>"]`; over storage that refuses, the values last for this session and `persisted` is false. */
export function createDeviceBag(options: {
  storage: Storage | null;
  userId: string;
  events: StorageEvents;
}): Bag & { readonly persisted: boolean; dispose(): void } {
  const map = createLocalMap({
    storage: options.storage,
    key: `manent.device.${options.userId}`,
    events: options.events,
  });
  let snapshot: Readonly<Record<string, unknown>> | null = null;
  map.subscribe(() => {
    snapshot = null;
  });
  return {
    get persisted() {
      return map.persisted;
    },
    read: () =>
      (snapshot ??= Object.freeze(
        Object.fromEntries(map.keys().map((key) => [key, map.get(key)])),
      )),
    // a value kept here carries no record of when or where it was set
    provenance: () => null,
    write(patch) {
      for (const [key, value] of Object.entries(patch)) {
        if (value === UNSET) map.remove(key);
        else map.set(key, value);
      }
    },
    subscribe: map.subscribe,
    canWrite: () => true,
    dispose: map.dispose,
  };
}
