// A local store that keeps nothing past the process: for tests, and for headless clients
// with nothing to persist.
import type {
  DeviceVersion,
  DocMeta,
  LoadedDocument,
  LocalStore,
  RecoveredItem,
  StoredEntry,
} from "../ports/ports.ts";

/** One device: every user's store on it. One user's store, asked for twice, holds the same data, as after a reload. */
export interface MemoryStoreSpace {
  store(userId: string): LocalStore;
}

interface DocRecord {
  meta: DocMeta;
  checkpoint: LoadedDocument["checkpoint"];
  syncedBase: Uint8Array | null;
  /** Every stored entry, by `localSeq`; `load` leaves out those the checkpoint holds. */
  entries: readonly StoredEntry[];
  /** The highest `localSeq` the document ever held, so that a reset never lets one repeat. */
  highestLocalSeq: number;
}

interface StoreContents {
  docs: ReadonlyMap<string, DocRecord>;
  versions: readonly DeviceVersion[];
  recovered: readonly RecoveredItem[];
}

function copyEntry(entry: StoredEntry): StoredEntry {
  return entry.kind === "update"
    ? {
        ...entry,
        update: new Uint8Array(entry.update),
        elements: [...entry.elements],
      }
    : { ...entry };
}

function byLocalSeq(a: StoredEntry, b: StoredEntry): number {
  return a.localSeq - b.localSeq;
}

/** True for an entry a checkpoint through `throughLocalSeq` holds and nothing waits on. */
function isCovered(entry: StoredEntry, throughLocalSeq: number): boolean {
  return (
    entry.localSeq <= throughLocalSeq &&
    entry.acked &&
    (entry.kind === "set" || entry.applied)
  );
}

/** A copy of the stored meta; a create stored before creates named a workspace names none. */
function metaOf(meta: DocMeta): DocMeta {
  const { create } = meta;
  const workspaceId = create?.workspaceId ?? null;
  return structuredClone({
    ...meta,
    create: create && { ...create, workspaceId },
  });
}

function loaded(record: DocRecord): LoadedDocument {
  const { checkpoint } = record;
  return {
    meta: metaOf(record.meta),
    checkpoint:
      checkpoint === null
        ? null
        : {
            state: new Uint8Array(checkpoint.state),
            throughLocalSeq: checkpoint.throughLocalSeq,
          },
    syncedBase:
      record.syncedBase === null ? null : new Uint8Array(record.syncedBase),
    entries: record.entries
      .filter(
        (entry) =>
          checkpoint === null ||
          entry.localSeq > checkpoint.throughLocalSeq ||
          !entry.acked,
      )
      .map(copyEntry),
  };
}

function recordOf(contents: StoreContents, docId: string): DocRecord {
  const record = contents.docs.get(docId);
  if (record === undefined) {
    throw new RangeError(`the store holds no document ${docId}`);
  }
  return record;
}

function withDoc(
  contents: StoreContents,
  docId: string,
  record: DocRecord,
): StoreContents {
  return { ...contents, docs: new Map(contents.docs).set(docId, record) };
}

/**
 * Every method resolves in a later microtask, never in the same turn, so that no
 * caller can depend on a write being instant. A write copies what it is given when
 * it is called, builds the new contents beside the old and swaps them in as it resolves.
 */
class MemoryStore implements LocalStore {
  readonly userId: string;
  private contents: StoreContents = {
    docs: new Map(),
    versions: [],
    recovered: [],
  };

  constructor(userId: string) {
    this.userId = userId;
  }

  async load(docId: string): Promise<LoadedDocument | null> {
    await Promise.resolve();
    const record = this.contents.docs.get(docId);
    return record === undefined ? null : loaded(record);
  }

  create(meta: DocMeta): Promise<void> {
    const stored = structuredClone(meta);
    return this.swap((contents) =>
      // an existing document is kept as it is
      contents.docs.has(stored.docId)
        ? contents
        : withDoc(contents, stored.docId, {
            meta: stored,
            checkpoint: null,
            syncedBase: null,
            entries: [],
            highestLocalSeq: 0,
          }),
    );
  }

  append(docId: string, entry: StoredEntry): Promise<void> {
    const stored = copyEntry(entry);
    return this.change(docId, (record) => ({
      ...record,
      entries: [
        ...record.entries.filter((e) => e.localSeq !== stored.localSeq),
        stored,
      ].toSorted(byLocalSeq),
      highestLocalSeq: Math.max(record.highestLocalSeq, stored.localSeq),
    }));
  }

  acknowledge(
    docId: string,
    throughLocalSeq: number,
    patch: Partial<DocMeta>,
  ): Promise<void> {
    const stored = structuredClone(patch);
    return this.change(docId, (record) => ({
      ...record,
      meta: { ...record.meta, ...stored },
      entries: record.entries.map((entry) =>
        !entry.acked && entry.localSeq <= throughLocalSeq
          ? { ...entry, acked: true }
          : entry,
      ),
    }));
  }

  refuse(docId: string, localSeq: number): Promise<void> {
    return this.change(docId, (record) => ({
      ...record,
      entries: record.entries.filter((entry) => entry.localSeq !== localSeq),
    }));
  }

  markApplied(
    docId: string,
    throughLocalSeq: number,
    setAside: readonly RecoveredItem[],
  ): Promise<void> {
    const items = setAside.map((item) => ({ ...item }));
    return this.swap((contents) => {
      const record = recordOf(contents, docId);
      return {
        ...withDoc(contents, docId, {
          ...record,
          entries: record.entries.map((entry) =>
            entry.kind === "update" &&
            !entry.applied &&
            entry.localSeq <= throughLocalSeq
              ? { ...entry, applied: true }
              : entry,
          ),
        }),
        recovered: [...contents.recovered, ...items],
      };
    });
  }

  checkpoint(
    docId: string,
    state: Uint8Array,
    throughLocalSeq: number,
    synced: boolean,
  ): Promise<void> {
    const stored = new Uint8Array(state);
    return this.change(docId, (record) => ({
      ...record,
      checkpoint: { state: stored, throughLocalSeq },
      syncedBase: synced ? stored : record.syncedBase,
      entries: record.entries.filter(
        (entry) => !isCovered(entry, throughLocalSeq),
      ),
      highestLocalSeq: Math.max(record.highestLocalSeq, throughLocalSeq),
    }));
  }

  patchMeta(docId: string, patch: Partial<DocMeta>): Promise<void> {
    const stored = structuredClone(patch);
    return this.change(docId, (record) => ({
      ...record,
      meta: { ...record.meta, ...stored },
    }));
  }

  reset(docId: string, state: Uint8Array, meta: DocMeta): Promise<void> {
    const storedState = new Uint8Array(state);
    const storedMeta = structuredClone(meta);
    return this.change(docId, (record) => ({
      meta: storedMeta,
      checkpoint: {
        state: storedState,
        throughLocalSeq: record.highestLocalSeq,
      },
      syncedBase: storedState,
      entries: record.entries.filter(
        (entry) => entry.kind === "set" && !entry.acked,
      ),
      highestLocalSeq: record.highestLocalSeq,
    }));
  }

  addVersion(version: DeviceVersion): Promise<void> {
    const stored = structuredClone(version);
    return this.swap((contents) => ({
      ...contents,
      versions: [...contents.versions, stored],
    }));
  }

  async versions(docId: string): Promise<DeviceVersion[]> {
    await Promise.resolve();
    return this.contents.versions
      .filter((version) => version.docId === docId)
      .map((version) => structuredClone(version));
  }

  markUploaded(versionId: string): Promise<void> {
    return this.swap((contents) => ({
      ...contents,
      versions: contents.versions.map((version) =>
        version.id === versionId ? { ...version, uploaded: true } : version,
      ),
    }));
  }

  async recovered(docId: string): Promise<RecoveredItem[]> {
    await Promise.resolve();
    return this.contents.recovered
      .filter((item) => item.docId === docId)
      .map((item) => ({ ...item }));
  }

  dismissRecovered(itemId: string): Promise<void> {
    return this.swap((contents) => ({
      ...contents,
      recovered: contents.recovered.filter((item) => item.id !== itemId),
    }));
  }

  async documents(): Promise<DocMeta[]> {
    await Promise.resolve();
    return [...this.contents.docs.values()].map((record) =>
      metaOf(record.meta),
    );
  }

  async close(): Promise<void> {
    await Promise.resolve();
  }

  private async swap(
    next: (contents: StoreContents) => StoreContents,
  ): Promise<void> {
    await Promise.resolve();
    this.contents = next(this.contents);
  }

  /** Rejects a RangeError for a document this store does not hold. */
  private change(
    docId: string,
    next: (record: DocRecord) => DocRecord,
  ): Promise<void> {
    return this.swap((contents) =>
      withDoc(contents, docId, next(recordOf(contents, docId))),
    );
  }
}

export function createMemoryStoreSpace(): MemoryStoreSpace {
  const stores = new Map<string, LocalStore>();
  return {
    store(userId) {
      let store = stores.get(userId);
      if (store === undefined) {
        store = new MemoryStore(userId);
        stores.set(userId, store);
      }
      return store;
    },
  };
}

/** A store in a space of its own. */
export function createMemoryStore(userId: string): LocalStore {
  return new MemoryStore(userId);
}
