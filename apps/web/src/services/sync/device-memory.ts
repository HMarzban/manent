// What sync keeps in this browser's storage beside the local store: the one place sync reads or writes it.
import type { WorkspaceRef } from "@manent/sync-protocol";

/** The demo's Connection control of this tab. */
export type ConnectionMode = "online" | "offline" | "slow";

const CONNECTION_MODES: readonly ConnectionMode[] = Object.freeze([
  "online",
  "offline",
  "slow",
]);

/** The document open in this tab's leader, and the first local sequence of this session. */
interface OpenMarker {
  docId: string;
  fromLocalSeq: number;
}

/** Every read is null and every write passed over while the storage is missing or refuses. */
export interface DeviceMemory {
  /** Milliseconds since the epoch. */
  offlineSince(userId: string): number | null;
  setOfflineSince(userId: string, at: number | null): void;
  openMarker(userId: string): OpenMarker | null;
  setOpenMarker(userId: string, marker: OpenMarker | null): void;
  /** The last workspaces the server named. */
  workspaces(userId: string): readonly WorkspaceRef[] | null;
  setWorkspaces(userId: string, list: readonly WorkspaceRef[]): void;
  /** The seed this device's data belongs to. */
  seed(): string | null;
  setSeed(seedId: string): void;
  /** This tab's alone. */
  connection(): ConnectionMode | null;
  setConnection(mode: ConnectionMode): void;
  /**
   * The person's two preference maps kept outside their private index, removed as they are read: those of the build
   * before sync held them, and what a page wrote before its private index opened.
   */
  takeLegacyMaps(userId: string): {
    prefs: Readonly<Record<string, unknown>> | null;
    keys: Readonly<Record<string, unknown>> | null;
  };
  /** Adds each entry of `maps` to the two maps `takeLegacyMaps` hands over, in place of one under its key. */
  keepLegacyMaps(userId: string, maps: { prefs: Fields; keys: Fields }): void;
}

type Fields = Readonly<Record<string, unknown>>;

/** A JSON object, read from storage or a map. */
export const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The JSON value of `raw`; null when there is none or it is not JSON. */
function parseJson(raw: string | null): unknown {
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    // not JSON: read as nothing kept
    return null;
  }
}

function readMarker(value: unknown): OpenMarker | null {
  if (!isFields(value) || typeof value.docId !== "string") return null;
  const { fromLocalSeq } = value;
  return typeof fromLocalSeq === "number" && Number.isSafeInteger(fromLocalSeq)
    ? { docId: value.docId, fromLocalSeq }
    : null;
}

function isSeeding(value: unknown): boolean {
  return (
    value === null ||
    (isFields(value) &&
      Number.isSafeInteger(value.done) &&
      Number.isSafeInteger(value.total))
  );
}

function isWorkspaceRef(value: unknown): value is WorkspaceRef {
  return (
    isFields(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isSeeding(value.seeding)
  );
}

/** Null unless every entry is a workspace. */
function readWorkspaces(value: unknown): readonly WorkspaceRef[] | null {
  return Array.isArray(value) && value.every(isWorkspaceRef) ? value : null;
}

const isConnectionMode = (value: unknown): value is ConnectionMode =>
  CONNECTION_MODES.some((mode) => mode === value);

/** One storage, read and written so that a refusal is never thrown. */
function kept(storage: Storage | null) {
  return {
    get(key: string): string | null {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        // the storage refuses to be read: nothing is kept
        return null;
      }
    },
    set(key: string, value: string | null): void {
      try {
        if (value === null) storage?.removeItem(key);
        else storage?.setItem(key, value);
      } catch {
        // a full or refusing storage: this session goes on without it
      }
    },
  };
}

const offlineKey = (userId: string) => `manent.sync.offline-since.${userId}`;
const openKey = (userId: string) => `manent.sync.open.${userId}`;
const workspacesKey = (userId: string) => `manent.sync.workspaces.${userId}`;

export function createDeviceMemory(stores: {
  local: Storage | null;
  session: Storage | null;
}): DeviceMemory {
  const local = kept(stores.local);
  const session = kept(stores.session);
  const read = (key: string): Fields | null => {
    const value = parseJson(local.get(key));
    return isFields(value) ? value : null;
  };
  const take = (key: string): Fields | null => {
    const value = read(key);
    local.set(key, null);
    return value;
  };
  const keep = (key: string, entries: Fields): void => {
    if (Object.keys(entries).length === 0) return;
    local.set(key, JSON.stringify({ ...read(key), ...entries }));
  };
  return {
    offlineSince(userId) {
      const text = local.get(offlineKey(userId));
      const at = Number(text);
      // only the integer this module wrote reads back
      return Number.isSafeInteger(at) && String(at) === text ? at : null;
    },
    setOfflineSince: (userId, at) =>
      local.set(offlineKey(userId), at === null ? null : String(at)),
    openMarker: (userId) => readMarker(parseJson(local.get(openKey(userId)))),
    setOpenMarker: (userId, marker) =>
      local.set(
        openKey(userId),
        marker === null
          ? null
          : JSON.stringify({
              docId: marker.docId,
              fromLocalSeq: marker.fromLocalSeq,
            }),
      ),
    workspaces: (userId) =>
      readWorkspaces(parseJson(local.get(workspacesKey(userId)))),
    setWorkspaces: (userId, list) =>
      local.set(workspacesKey(userId), JSON.stringify(list)),
    seed: () => local.get("manent.seed"),
    setSeed: (seedId) => local.set("manent.seed", seedId),
    connection() {
      const mode = session.get("manent.demo.connection");
      return isConnectionMode(mode) ? mode : null;
    },
    setConnection: (mode) => session.set("manent.demo.connection", mode),
    takeLegacyMaps: (userId) => ({
      prefs: take(`manent.prefs.${userId}`),
      keys: take(`manent.keys.${userId}`),
    }),
    keepLegacyMaps(userId, maps) {
      keep(`manent.prefs.${userId}`, maps.prefs);
      keep(`manent.keys.${userId}`, maps.keys);
    },
  };
}

/** Each global, or null where reading it throws (storage a browser refuses) or it is missing. */
function readGlobal<K extends "localStorage" | "sessionStorage" | "indexedDB">(
  name: K,
): (typeof globalThis)[K] | null {
  try {
    return globalThis[name] ?? null;
  } catch {
    // a browser that refuses this storage throws on the read itself
    return null;
  }
}

export function browserStores(): {
  local: Storage | null;
  session: Storage | null;
  indexedDb: IDBFactory | null;
} {
  return {
    local: readGlobal("localStorage"),
    session: readGlobal("sessionStorage"),
    indexedDb: readGlobal("indexedDB"),
  };
}
