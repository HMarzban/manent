// A memory store whose device misbehaves on request: refused writes, a store that will not
// open, writes that take their time, and data the browser cleared.
import { createMemoryStore } from "../memory-store/memory-store.ts";
import { StoreError } from "../ports/ports.ts";
import type {
  DeviceVersion,
  DocMeta,
  DocSummary,
  LoadedDocument,
  LocalStore,
  RecoveredItem,
  StoredEntry,
} from "../ports/ports.ts";

/** One device: one user's store, asked for twice, is the same store with the same faults. */
export interface FaultyStoreSpace {
  store(userId: string): FaultyStore;
}

/** A memory store with fault hooks; none is set at first, and until one is it is the store it wraps. */
export interface FaultyStore extends LocalStore {
  /** Every write rejects StoreError with this code until set back to null. */
  refuseWrites(code: "quota" | "write_failed" | "lost_lead" | null): void;
  /** While true, `load()` rejects StoreError("unavailable"). */
  refuseOpen(refuse: boolean): void;
  /** Writes started while held settle, in order, only at release. */
  holdWrites(): void;
  releaseWrites(): void;
  /** How many writes have completed. */
  writes(): number;
  /** The browser cleared this user's data: from now on the store is empty. */
  wipe(): void;
}

type Refusal = Parameters<FaultyStore["refuseWrites"]>[0];

class FaultyMemoryStore implements FaultyStore {
  readonly userId: string;
  private inner: LocalStore;
  private refusal: Refusal = null;
  private openRefused = false;
  /** The writes started while held, each waiting to start for real; null when not held. */
  private held: (() => void)[] | null = null;
  private completed = 0;

  constructor(userId: string) {
    this.userId = userId;
    this.inner = createMemoryStore(userId);
  }

  refuseWrites(code: Refusal): void {
    this.refusal = code;
  }

  refuseOpen(refuse: boolean): void {
    this.openRefused = refuse;
  }

  holdWrites(): void {
    this.held ??= [];
  }

  releaseWrites(): void {
    const held = this.held ?? [];
    this.held = null;
    for (const start of held) start();
  }

  writes(): number {
    return this.completed;
  }

  wipe(): void {
    this.inner = createMemoryStore(this.userId);
  }

  async load(docId: string): Promise<LoadedDocument | null> {
    if (this.openRefused) throw new StoreError("unavailable");
    return this.inner.load(docId);
  }

  create(meta: DocMeta): Promise<void> {
    return this.write((store) => store.create(meta));
  }

  append(docId: string, entry: StoredEntry): Promise<void> {
    return this.write((store) => store.append(docId, entry));
  }

  acknowledge(
    docId: string,
    throughLocalSeq: number,
    patch: Partial<DocMeta>,
  ): Promise<void> {
    return this.write((store) =>
      store.acknowledge(docId, throughLocalSeq, patch),
    );
  }

  refuse(docId: string, localSeq: number): Promise<void> {
    return this.write((store) => store.refuse(docId, localSeq));
  }

  markApplied(
    docId: string,
    throughLocalSeq: number,
    setAside: readonly RecoveredItem[],
  ): Promise<void> {
    return this.write((store) =>
      store.markApplied(docId, throughLocalSeq, setAside),
    );
  }

  checkpoint(
    docId: string,
    state: Uint8Array,
    throughLocalSeq: number,
    synced: boolean,
  ): Promise<void> {
    return this.write((store) =>
      store.checkpoint(docId, state, throughLocalSeq, synced),
    );
  }

  patchMeta(docId: string, patch: Partial<DocMeta>): Promise<void> {
    return this.write((store) => store.patchMeta(docId, patch));
  }

  reset(docId: string, state: Uint8Array, meta: DocMeta): Promise<void> {
    return this.write((store) => store.reset(docId, state, meta));
  }

  addVersion(version: DeviceVersion): Promise<void> {
    return this.write((store) => store.addVersion(version));
  }

  versions(docId: string): Promise<DeviceVersion[]> {
    return this.inner.versions(docId);
  }

  markUploaded(versionId: string): Promise<void> {
    return this.write((store) => store.markUploaded(versionId));
  }

  recovered(docId: string): Promise<RecoveredItem[]> {
    return this.inner.recovered(docId);
  }

  dismissRecovered(itemId: string): Promise<void> {
    return this.write((store) => store.dismissRecovered(itemId));
  }

  documents(): Promise<DocMeta[]> {
    return this.inner.documents();
  }

  summaries(): Promise<readonly DocSummary[]> {
    return this.inner.summaries!();
  }

  close(): Promise<void> {
    return this.inner.close();
  }

  private write(run: (store: LocalStore) => Promise<void>): Promise<void> {
    const held = this.held;
    if (held === null) return this.perform(run);
    return new Promise((resolve, reject) => {
      held.push(() => {
        this.perform(run).then(resolve, reject);
      });
    });
  }

  /** The memory store applies writes in the order they are called, so released writes keep theirs. */
  private async perform(
    run: (store: LocalStore) => Promise<void>,
  ): Promise<void> {
    if (this.refusal !== null) throw new StoreError(this.refusal);
    await run(this.inner);
    this.completed += 1;
  }
}

export function createFaultyStoreSpace(): FaultyStoreSpace {
  const stores = new Map<string, FaultyStore>();
  return {
    store(userId) {
      let store = stores.get(userId);
      if (store === undefined) {
        store = new FaultyMemoryStore(userId);
        stores.set(userId, store);
      }
      return store;
    },
  };
}

/** A faulty store in a space of its own. */
export function createFaultyStore(userId: string): FaultyStore {
  return new FaultyMemoryStore(userId);
}
