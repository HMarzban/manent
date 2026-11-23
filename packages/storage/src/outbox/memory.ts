// The notifications waiting to be delivered kept in memory, for the in-memory driver.
import type { OutboxStore } from "../ports/index.ts";

/** The control file's rows. Values are replaced, never changed in place. */
export interface OutboxTables {}

export function createOutboxTables(): OutboxTables {
  return {};
}

/** The store over the storage's tables; `commit` writes through whatever fault is armed. */
export function createMemoryOutbox(_options: {
  now: () => number;
  read: () => OutboxTables;
  commit: <T>(apply: () => T) => T;
}): OutboxStore {
  return {};
}
