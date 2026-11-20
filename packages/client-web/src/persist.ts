// Whether the browser keeps this origin's data under storage pressure.

/** The part of `navigator.storage` read here; a browser may lack any method. */
export interface StorageManagerLike {
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
  estimate?(): Promise<{ usage?: number; quota?: number }>;
}

export type Persistence = "granted" | "not_granted" | "unsupported";

/** Never asks the browser; "unsupported" when it cannot say. */
export async function readPersistence(
  storage: StorageManagerLike | null,
): Promise<Persistence> {
  if (!storage?.persisted) return "unsupported";
  return (await storage.persisted()) ? "granted" : "not_granted";
}

/** Asks the browser only while the data is not yet kept, and only where it can be asked. */
export async function requestPersistence(
  storage: StorageManagerLike | null,
): Promise<Persistence> {
  const current = await readPersistence(storage);
  if (current === "granted" || !storage?.persist) return current;
  return (await storage.persist()) ? "granted" : "not_granted";
}
