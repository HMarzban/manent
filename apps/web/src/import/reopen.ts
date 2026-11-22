// This device's memory of the files each person imported, by the file's hash: kept in this origin's storage, never synced.

/** `importedAt` in milliseconds since the epoch. */
export interface ReopenMemory {
  find(sha256: string): { docId: string; importedAt: number } | null;
  remember(sha256: string, docId: string, at: number): void;
}

type Imports = Record<string, { docId: string; importedAt: number }>;

const keyOf = (userId: string): string => `manent.imports.${userId}`;

const isImport = (value: unknown): value is Imports[string] =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "docId") === "string" &&
  typeof Reflect.get(value, "importedAt") === "number";

/** The person's imports as stored; empty when none is kept, and an entry that is not the shape reads as none. */
function readImports(storage: Storage, userId: string): Imports {
  let stored: unknown = null;
  try {
    stored = JSON.parse(storage.getItem(keyOf(userId)) ?? "null");
  } catch {
    // text that is not JSON, or a storage that refuses the read, holds no import
  }
  if (typeof stored !== "object" || stored === null || Array.isArray(stored))
    return {};
  return Object.fromEntries(
    Object.entries(stored).filter((entry): entry is [string, Imports[string]] =>
      isImport(entry[1]),
    ),
  );
}

/** One person's memory over `storage`; with no storage nothing is kept and nothing is found. */
export function createReopenMemory(options: {
  storage: Storage | null;
  userId: string;
}): ReopenMemory {
  const { storage, userId } = options;
  return {
    find(sha256) {
      if (storage === null) return null;
      const found = readImports(storage, userId)[sha256];
      return found === undefined
        ? null
        : { docId: found.docId, importedAt: found.importedAt };
    },
    remember(sha256, docId, at) {
      if (storage === null) return;
      const imports = {
        ...readImports(storage, userId),
        [sha256]: { docId, importedAt: at },
      };
      try {
        storage.setItem(keyOf(userId), JSON.stringify(imports));
      } catch {
        // a full or refusing storage forgets the import: the same file opened again is imported again
      }
    },
  };
}
