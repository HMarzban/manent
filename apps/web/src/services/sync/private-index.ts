// The person's private index: their preferences, keys, flags, Continue, To review, what each device holds and their Tour.
import { jsonMap } from "@manent/crdt";
import type { JsonMapView } from "@manent/crdt";
import type { KeyValueMap } from "@manent/settings";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import type { PersonSync } from "./create-sync.ts";
import type { DeviceMemory } from "./device-memory.ts";

export interface PrivateIndex {
  prefs: KeyValueMap;
  keys: KeyValueMap;
  flags: JsonMapView;
  continueMap: JsonMapView;
  review: JsonMapView;
  onDevice: JsonMapView;
  tour: JsonMapView;
  handle: DocHandle;
  close(): Promise<void>;
}

/** The map `name` of whichever document the handle holds: a document replaced under it is followed, and its keys told. */
export function liveMap(handle: DocHandle, name: string): JsonMapView {
  const current = (): JsonMapView => jsonMap(handle.doc(), name);
  return {
    get: (key) => current().get(key),
    set: (key, value) => current().set(key, value),
    delete: (key) => current().delete(key),
    keys: () => current().keys(),
    entries: () => current().entries(),
    subscribe(listener) {
      let stop = current().subscribe(listener);
      const stopReplaced = handle.on((event) => {
        if (event.type !== "replaced") return;
        stop();
        stop = current().subscribe(listener);
        listener(current().keys(), "remote");
      });
      return () => {
        stop();
        stopReplaced();
      };
    },
  };
}

/** Writes each entry the index does not hold yet. */
function carryOver(
  map: KeyValueMap,
  legacy: Readonly<Record<string, unknown>> | null,
): void {
  for (const [key, value] of Object.entries(legacy ?? {})) {
    if (map.get(key) !== null) continue;
    try {
      map.set(key, value);
    } catch (error) {
      // a value the index cannot hold (a lone surrogate) is left behind; the person sets it again
      if (!(error instanceof TypeError)) throw error;
    }
  }
}

/**
 * Opens the person's private index from the device first, creating it when the device holds none; what is left of the
 * preference maps kept before it is written into `prefs` and `keys` once, an entry already held staying as it is.
 */
export async function openPrivateIndex(options: {
  sync: PersonSync;
  userId: string;
  memory: DeviceMemory;
}): Promise<PrivateIndex> {
  const { userId } = options;
  const handle = await options.sync.client.open(indexDocId("user", userId), {
    create: { kind: "index", home: "user", workspaceId: null },
  });
  const map = (name: string): JsonMapView => liveMap(handle, name);
  const index: PrivateIndex = {
    prefs: map("prefs"),
    keys: map("keys"),
    flags: map("flags"),
    continueMap: map("continue"),
    review: map("review"),
    onDevice: map("on_device"),
    tour: map("tour"),
    handle,
    close: () => handle.close(),
  };
  const legacy = options.memory.takeLegacyMaps(userId);
  carryOver(index.prefs, legacy.prefs);
  carryOver(index.keys, legacy.keys);
  return index;
}
