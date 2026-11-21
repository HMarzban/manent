// What each of the person's devices holds, kept in their private index so a browser that cleared its data can be told.
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
