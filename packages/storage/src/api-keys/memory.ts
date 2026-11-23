// The public API's keys kept in memory, for the in-memory driver.
import type { ApiKeyStore } from "../ports/index.ts";

/** The control file's rows. Values are replaced, never changed in place. */
export interface ApiKeyTables {}

export function createApiKeyTables(): ApiKeyTables {
  return {};
}

/** The store over the storage's tables; `commit` writes through whatever fault is armed. */
export function createMemoryApiKeys(_options: {
  now: () => number;
  read: () => ApiKeyTables;
  commit: <T>(apply: () => T) => T;
}): ApiKeyStore {
  return {};
}
