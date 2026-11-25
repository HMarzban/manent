// The local store on IndexedDB: one database per user, strict durability for unsynced own
// edits and relaxed durability for metadata, caches and server-synced writes.
import { StoreError, toRecoveredItem, waitingCount } from "@manent/sync-client";
import type {
  DeviceVersion,
  DocMeta,
  DocSummary,
  LoadedDocument,
  LocalStore,
  RecoveredItem,
  StoredDeviceVersion,
  StoredEntry,
  StoredRecoveredItem,
} from "@manent/sync-client";
import {
  DOC_STORES,
  LOCAL_STORE_VERSION,
  collectEntries,
  countRecoveredByDoc,
  docMetaOf,
  eachEntry,
  localDatabaseName,
  openLocalDatabase,
  patchMetaRecord,
  readAllRecords,
  readRecord,
  transact,
} from "./idb-tx.ts";
import type {
  Durability,
  EntryRecord,
  MetaRecord,
  StoreName,
} from "./idb-tx.ts";

export { LOCAL_STORE_VERSION, localDatabaseName, openLocalDatabase };

interface CheckpointRecord extends NonNullable<LoadedDocument["checkpoint"]> {
  docId: string;
}

const isWaitingEntry = (entry: StoredEntry): boolean =>
  !entry.acked && (entry.kind === "set" || entry.own);

/** Every write takes a copy of what it is given when it is called. */
class IdbStore implements LocalStore {
  constructor(
    readonly userId: string,
    private readonly db: IDBDatabase,
    private readonly leaseTabId: string | null,
  ) {}

  load(docId: string): Promise<LoadedDocument | null> {
    return transact(this.db, DOC_STORES, "readonly", (tx) => {
      let meta: MetaRecord | null = null;
      let checkpoint: CheckpointRecord | null = null;
      let base: { state: Uint8Array } | null = null;
      readRecord<MetaRecord>(tx, "meta", docId, (r) => (meta = r));
      readRecord<CheckpointRecord>(tx, "checkpoints", docId, (r) => {
        checkpoint = r;
      });
      readRecord<{ state: Uint8Array }>(tx, "bases", docId, (r) => (base = r));
      const entries: StoredEntry[] = [];
      eachEntry(tx, docId, ({ docId: _id, ...entry }) => entries.push(entry));
      return () => {
        if (meta === null) return null;
        const through = checkpoint?.throughLocalSeq ?? -Infinity;
        return {
          meta: docMetaOf(meta),
          checkpoint: checkpoint && {
            state: checkpoint.state,
            throughLocalSeq: checkpoint.throughLocalSeq,
          },
          syncedBase: base?.state ?? null,
          entries: entries.filter((e) => e.localSeq > through || !e.acked),
        };
      };
    });
  }

  create(meta: DocMeta): Promise<void> {
    const stored: MetaRecord = {
      ...structuredClone(meta),
      highestLocalSeq: 0,
      waitingCount: 0,
    };
    return this.write(["meta"], (tx) =>
      readRecord(tx, "meta", stored.docId, (existing) => {
        if (existing === null) tx.objectStore("meta").put(stored);
      }),
    );
  }

  append(docId: string, entry: StoredEntry): Promise<void> {
    const stored: EntryRecord = { docId, ...structuredClone(entry) };
    if (!isWaitingEntry(stored)) {
      return this.write(
        ["entries"],
        (tx) => void tx.objectStore("entries").put(stored),
        "relaxed",
      );
    }
    return this.write(["meta", "entries"], (tx) => {
      tx.objectStore("entries").put(stored);
      readRecord<MetaRecord>(tx, "meta", docId, (found) => {
        if (found === null) return;
        collectEntries(tx, docId, (entries) => {
          tx.objectStore("meta").put({
            ...found,
            waitingCount: waitingCount(entries),
          });
        });
      });
    });
  }

  acknowledge(
    docId: string,
    throughLocalSeq: number,
    patch: Partial<DocMeta>,
  ): Promise<void> {
    const stored = structuredClone(patch);
    return this.write(
      ["meta", "entries"],
      (tx, fail) => {
        const remaining: StoredEntry[] = [];
        eachEntry(
          tx,
          docId,
          (record, cursor) => {
            if (!record.acked && record.localSeq <= throughLocalSeq)
              cursor.update({ ...record, acked: true });
            else remaining.push(record);
          },
          () =>
            patchMetaRecord(tx, docId, fail, () => ({
              ...stored,
              waitingCount: waitingCount(remaining),
            })),
        );
      },
      "relaxed",
    );
  }

  refuse(docId: string, localSeq: number): Promise<void> {
    return this.write(
      ["meta", "entries"],
      (tx, fail) => {
        tx.objectStore("entries").delete([docId, localSeq]);
        collectEntries(tx, docId, (remaining) =>
          patchMetaRecord(tx, docId, fail, (found) => ({
            highestLocalSeq: Math.max(found.highestLocalSeq, localSeq),
            waitingCount: waitingCount(remaining),
          })),
        );
      },
      "relaxed",
    );
  }

  markApplied(
    docId: string,
    throughLocalSeq: number,
    setAside: readonly RecoveredItem[],
  ): Promise<void> {
    const items = structuredClone(setAside);
    return this.write(
      ["entries", "recovered"],
      (tx) => {
        if (throughLocalSeq > 0)
          eachEntry(tx, docId, (record, cursor) => {
            const waiting = record.kind === "update" && !record.applied;
            if (waiting && record.localSeq <= throughLocalSeq)
              cursor.update({ ...record, applied: true });
          });
        for (const item of items) tx.objectStore("recovered").put(item);
      },
      items.length > 0 ? "strict" : "relaxed",
    );
  }

  checkpoint(
    docId: string,
    state: Uint8Array,
    throughLocalSeq: number,
    synced: boolean,
  ): Promise<void> {
    const copy = new Uint8Array(state);
    const stores: StoreName[] = synced
      ? ["entries", "checkpoints", "bases"]
      : ["entries", "checkpoints"];
    return this.write(
      stores,
      (tx) => {
        tx.objectStore("checkpoints").put({
          docId,
          state: copy,
          throughLocalSeq,
        });
        if (synced) tx.objectStore("bases").put({ docId, state: copy });
        eachEntry(tx, docId, (entry, cursor) => {
          const settled =
            entry.acked && (entry.kind === "set" || entry.applied);
          if (settled && entry.localSeq <= throughLocalSeq) cursor.delete();
        });
      },
      "relaxed",
    );
  }

  patchMeta(docId: string, patch: Partial<DocMeta>): Promise<void> {
    const stored = structuredClone(patch);
    return this.write(
      ["meta"],
      (tx, fail) => patchMetaRecord(tx, docId, fail, () => stored),
      "relaxed",
    );
  }

  reset(docId: string, state: Uint8Array, meta: DocMeta): Promise<void> {
    const storedState = new Uint8Array(state);
    const storedMeta = structuredClone(meta);
    return this.write(
      DOC_STORES,
      (tx) => {
        let highest = 0;
        let keptSettings = 0;
        const raise = (seq = 0) => (highest = Math.max(highest, seq));
        readRecord<CheckpointRecord>(tx, "checkpoints", docId, (r) =>
          raise(r?.throughLocalSeq),
        );
        readRecord<MetaRecord>(tx, "meta", docId, (r) =>
          raise(r?.highestLocalSeq),
        );
        eachEntry(
          tx,
          docId,
          (entry, cursor) => {
            raise(entry.localSeq);
            if (entry.kind !== "set" || entry.acked) cursor.delete();
            else keptSettings += 1;
          },
          () => {
            tx.objectStore("checkpoints").put({
              docId,
              state: storedState,
              throughLocalSeq: highest,
            });
            tx.objectStore("bases").put({ docId, state: storedState });
            tx.objectStore("meta").put({
              ...storedMeta,
              highestLocalSeq: highest,
              waitingCount: keptSettings,
            });
          },
        );
      },
      "relaxed",
    );
  }

  addVersion(version: DeviceVersion): Promise<void> {
    const stored = structuredClone(version);
    return this.write(
      ["versions"],
      (tx) => void tx.objectStore("versions").put(stored),
    );
  }

  async versions(docId: string): Promise<DeviceVersion[]> {
    const stored = await readAllRecords<StoredDeviceVersion>(
      this.db,
      "versions",
      docId,
    );
    return stored.map((version) => ({ name: null, ...version }));
  }

  markUploaded(versionId: string): Promise<void> {
    return this.write(
      ["versions"],
      (tx) =>
        readRecord<DeviceVersion>(tx, "versions", versionId, (found) => {
          if (found !== null)
            tx.objectStore("versions").put({ ...found, uploaded: true });
        }),
      "relaxed",
    );
  }

  async recovered(docId: string): Promise<RecoveredItem[]> {
    const items = await readAllRecords<StoredRecoveredItem>(
      this.db,
      "recovered",
      docId,
    );
    return items.map(toRecoveredItem);
  }

  dismissRecovered(itemId: string): Promise<void> {
    return this.write(
      ["recovered"],
      (tx) => void tx.objectStore("recovered").delete(itemId),
      "relaxed",
    );
  }

  async documents(): Promise<DocMeta[]> {
    return (await readAllRecords<MetaRecord>(this.db, "meta", null)).map(
      docMetaOf,
    );
  }

  async summaries(): Promise<readonly DocSummary[]> {
    const { metas, recovered } = await transact(
      this.db,
      ["meta", "recovered"],
      "readonly",
      (tx) => {
        const metaReq: IDBRequest<MetaRecord[]> = tx
          .objectStore("meta")
          .getAll();
        const counts = countRecoveredByDoc(tx);
        return () => ({ metas: metaReq.result, recovered: counts });
      },
    );
    const legacy = metas.filter((m) => m.waitingCount === undefined);
    const computed = legacy.length === 0 ? null : await this.waitingFor(legacy);
    return metas.map((m) => ({
      docId: m.docId,
      neverSynced: m.neverSynced,
      waiting: m.waitingCount ?? computed?.get(m.docId) ?? 0,
      parked: m.parked,
      recovered: recovered.get(m.docId) ?? 0,
    }));
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private waitingFor(
    records: readonly MetaRecord[],
  ): Promise<Map<string, number>> {
    return transact(this.db, ["entries"], "readonly", (tx) => {
      const counts = new Map<string, number>();
      for (const { docId } of records)
        collectEntries(tx, docId, (entries) =>
          counts.set(docId, waitingCount(entries)),
        );
      return () => counts;
    });
  }

  private write(
    stores: readonly StoreName[],
    body: (tx: IDBTransaction, fail: (error: Error) => void) => void,
    durability: Durability = "strict",
  ): Promise<void> {
    const { leaseTabId } = this;
    const fenced: readonly StoreName[] =
      leaseTabId === null ? stores : [...stores, "lease"];
    return transact(
      this.db,
      fenced,
      "readwrite",
      (tx, fail) => {
        if (leaseTabId === null) body(tx, fail);
        else
          readRecord<{ tabId: string }>(tx, "lease", "leader", (lease) => {
            if (lease?.tabId === leaseTabId) body(tx, fail);
            else fail(new StoreError("lost_lead"));
          });
        return () => undefined;
      },
      durability,
    );
  }
}

/** Rejects StoreError("unavailable") when the database cannot be opened. */
export async function openIdbStore(options: {
  userId: string;
  indexedDb: IDBFactory;
  leaseTabId?: string;
}): Promise<LocalStore> {
  const db = await openLocalDatabase(options.indexedDb, options.userId);
  return new IdbStore(options.userId, db, options.leaseTabId ?? null);
}
