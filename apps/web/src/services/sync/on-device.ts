// What each of the person's devices holds, kept in their private index so a browser that cleared its data can be told.
import type { DocSummary } from "@manent/sync-client";
import type { TrustEvent } from "@manent/ui";
import { isFields } from "./device-memory.ts";
import type { PrivateIndex } from "./private-index.ts";

/** `on_device[`${deviceId}|${docId}`]`: the script's title, whether the server holds all of it, and when (milliseconds since the epoch). */
export function recordOnDevice(options: {
  privateIndex: PrivateIndex;
  deviceId: string;
  docId: string;
  title: string;
  synced: boolean;
  now: () => number;
}): void {
  const { privateIndex, deviceId, docId, title, synced } = options;
  privateIndex.onDevice.set(`${deviceId}|${docId}`, {
    title,
    synced,
    at: options.now(),
  });
}

interface OnDeviceEntry {
  key: string;
  docId: string;
  title: string;
  synced: boolean;
}

/** This device's entries; one whose shape is not an entry's is passed over. */
function entriesOf(
  privateIndex: PrivateIndex,
  deviceId: string,
): OnDeviceEntry[] {
  const prefix = `${deviceId}|`;
  return Object.entries(privateIndex.onDevice.entries()).flatMap(
    ([key, value]) =>
      key.startsWith(prefix) &&
      isFields(value) &&
      typeof value.title === "string" &&
      typeof value.synced === "boolean"
        ? [
            {
              key,
              docId: key.slice(prefix.length),
              title: value.title,
              synced: value.synced,
            },
          ]
        : [],
  );
}

/**
 * Null unless the person's store was found missing (`hadDatabase` false) while the private index says this device held
 * scripts. Then: the synced ones are back from the server, and the others, which no store holds now, could not be
 * kept; their entries are removed.
 */
export async function checkCleared(options: {
  hadDatabase: boolean | null;
  privateIndex: PrivateIndex;
  deviceId: string;
  documents: () => Promise<readonly DocSummary[]>;
}): Promise<TrustEvent | null> {
  const { privateIndex } = options;
  if (options.hadDatabase !== false) return null;
  const held = entriesOf(privateIndex, options.deviceId);
  if (held.length === 0) return null;
  const stored = new Set((await options.documents()).map((d) => d.docId));
  const lost = held.filter(
    (entry) => !entry.synced && !stored.has(entry.docId),
  );
  for (const entry of lost) privateIndex.onDevice.delete(entry.key);
  return {
    kind: "offline_data_cleared",
    restored: held.filter((entry) => entry.synced).length,
    lostTitles: lost.map((entry) => entry.title),
  };
}
