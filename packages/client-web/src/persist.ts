// Whether the browser keeps this origin's data under storage pressure.

/** The part of `navigator.storage` read here; a browser may lack any method. */
export interface StorageManagerLike {
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
  estimate?(): Promise<{ usage?: number; quota?: number }>;
}

export type Persistence = "granted" | "not_granted" | "unsupported";

export interface StorageEstimate {
  readonly usage: number;
  readonly quota: number;
}

/** Never asks the browser; "unsupported" when it cannot say. */
export async function readPersistence(
  storage: StorageManagerLike | null,
): Promise<Persistence> {
  if (!storage?.persisted) return "unsupported";
  return (await storage.persisted()) ? "granted" : "not_granted";
}

/** Reads `{ usage, quota }` from `storage.estimate()`; null when unsupported, invalid, or refused. */
export async function readStorageEstimate(
  storage: StorageManagerLike | null,
): Promise<StorageEstimate | null> {
  if (!storage?.estimate) return null;
  try {
    const { usage, quota } = await storage.estimate();
    if (
      typeof usage !== "number" ||
      typeof quota !== "number" ||
      !Number.isFinite(usage) ||
      !Number.isFinite(quota) ||
      usage < 0 ||
      quota <= 0
    )
      return null;
    return { usage, quota };
  } catch {
    return null;
  }
}

/** Asks the browser only while the data is not yet kept, and only where it can be asked. */
export async function requestPersistence(
  storage: StorageManagerLike | null,
): Promise<Persistence> {
  const current = await readPersistence(storage);
  if (current === "granted" || !storage?.persist) return current;
  return (await storage.persist()) ? "granted" : "not_granted";
}
