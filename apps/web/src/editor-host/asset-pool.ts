// Per-(userId, projectId) AssetUploader pool with tab-session Bearer auth and explicit disposal.
import { createAssetUploader, openIdbAssetStore } from "@manent/client-web";
import type {
  AssetFetch,
  AssetUploader,
  IdbAssetStore,
} from "@manent/client-web";
import type { MessageQueue } from "@manent/ui";
import { browserStores } from "../services/sync/device-memory.ts";
import { readPerson, tabStorage } from "../session.ts";
import { pushGraphicRefusal } from "./graphic-refusal.ts";

export interface PooledUploader {
  readonly uploader: AssetUploader;
  readonly store: IdbAssetStore;
  readonly stopOnline: () => void;
}

export interface OnlineEventTarget {
  addEventListener(type: "online", listener: () => void): void;
  removeEventListener(type: "online", listener: () => void): void;
}

export interface AssetPoolOverrides {
  readonly indexedDb?: IDBFactory | null;
  readonly fetch?: AssetFetch;
  readonly onlineTarget?: OnlineEventTarget | null;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly isOnline?: () => boolean;
}

const uploaderPool = new Map<string, Promise<PooledUploader | null>>();

/** Bearer Authorization header for `userId` only when this tab's session belongs to that user. */
export function assetAuthHeaders(userId: string): Record<string, string> {
  const person = readPerson(tabStorage());
  const token = person?.userId === userId ? person.token : null;
  return token === null ? {} : { Authorization: `Bearer ${token}` };
}

/** Returns (or lazily opens) the pooled `AssetUploader` for `(services.userId, projectId)`. */
export function getProjectAssetUploader(
  services: { readonly userId: string; readonly messages?: MessageQueue },
  projectId: string,
  overrides?: AssetPoolOverrides,
): Promise<PooledUploader | null> {
  const key = `${services.userId}:${projectId}`;
  const existing = uploaderPool.get(key);
  if (existing !== undefined) return existing;
  const created = (async (): Promise<PooledUploader | null> => {
    const indexedDb =
      overrides?.indexedDb !== undefined
        ? overrides.indexedDb
        : browserStores().indexedDb;
    if (indexedDb === null) return null;
    const store = await openIdbAssetStore({
      userId: services.userId,
      indexedDb,
    });
    const uploader = createAssetUploader({
      projectId,
      store,
      fetch: overrides?.fetch,
      isOnline: overrides?.isOnline,
      createObjectURL: overrides?.createObjectURL,
      revokeObjectURL: overrides?.revokeObjectURL,
      headers: () => assetAuthHeaders(services.userId),
      onUploadRefused(_assetId, status) {
        if (status === 413 && services.messages)
          pushGraphicRefusal(services.messages, "quota_exceeded");
      },
    });
    const target =
      overrides?.onlineTarget !== undefined
        ? overrides.onlineTarget
        : typeof window !== "undefined"
          ? window
          : null;
    const onOnline = (): void => {
      void uploader.notifyOnline();
    };
    target?.addEventListener("online", onOnline);
    return {
      uploader,
      store,
      stopOnline: () => {
        target?.removeEventListener("online", onOnline);
      },
    };
  })().catch(() => {
    uploaderPool.delete(key);
    return null;
  });
  uploaderPool.set(key, created);
  return created;
}

/** Destroys all pooled uploaders, closes IDB connections, and removes `online` listeners for `userId`. */
export async function disposeProjectAssetUploaders(
  userId: string,
): Promise<void> {
  const prefix = `${userId}:`;
  const entries: Promise<PooledUploader | null>[] = [];
  for (const [key, promise] of uploaderPool) {
    if (!key.startsWith(prefix)) continue;
    uploaderPool.delete(key);
    entries.push(promise);
  }
  const resolved = await Promise.all(entries);
  await Promise.all(
    resolved.map(async (pooled) => {
      if (pooled === null) return;
      pooled.stopOnline();
      pooled.uploader.destroy();
      await pooled.store.close();
    }),
  );
}
