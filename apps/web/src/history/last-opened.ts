// Where each person last had each script open on this device: kept in this origin's storage, never synced.
import type { VersionPosition } from "@manent/sync-protocol";

const keyOf = (userId: string): string => `manent.lastOpened.${userId}`;

const POSITION = /^(\d+):(\d+)$/;

/** This origin's storage; null where the browser refuses it or has none. */
function originStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // a browser that refuses storage throws on the read: nothing is kept
    return null;
  }
}

/** The person's positions by doc id, as stored ("1:42"); empty when none is kept or the stored text is not such a map. */
function readPositions(
  storage: Storage,
  userId: string,
): Record<string, string> {
  let stored: unknown = null;
  try {
    stored = JSON.parse(storage.getItem(keyOf(userId)) ?? "null");
  } catch {
    // text that is not JSON holds no position
  }
  if (typeof stored !== "object" || stored === null || Array.isArray(stored))
    return {};
  return Object.fromEntries(
    Object.entries(stored).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** Null when the person has no position kept for the script on this device. */
export function readLastOpened(
  userId: string,
  docId: string,
): VersionPosition | null {
  const storage = originStorage();
  if (storage === null) return null;
  const match = POSITION.exec(readPositions(storage, userId)[docId] ?? "");
  if (match === null) return null;
  return { generation: Number(match[1]), seq: Number(match[2]) };
}

/** Keeps `at` for the script; nothing is kept where the browser refuses storage. */
export function writeLastOpened(
  userId: string,
  docId: string,
  at: VersionPosition,
): void {
  const storage = originStorage();
  if (storage === null) return;
  const positions = {
    ...readPositions(storage, userId),
    [docId]: `${at.generation}:${at.seq}`,
  };
  try {
    storage.setItem(keyOf(userId), JSON.stringify(positions));
  } catch {
    // a full or refusing storage keeps the older position, which only widens "since you last opened"
  }
}
