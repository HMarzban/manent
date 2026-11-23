// The in-memory driver's stores beside the log and the directory: each document file's parts and the stores over
// them.
import type { DocFile } from "../ports/index.ts";
import {
  copyProductionTables,
  createMemoryProduction,
} from "../production/memory.ts";
import type { ProductionTables } from "../production/memory.ts";
import { copyLogged } from "./memory-log.ts";
import type { Logged } from "./memory-log.ts";

/** One document file's contents; a transaction works on a copy of each part. */
export interface FileParts {
  log: Logged;
  production: ProductionTables;
}

/** A copy that a transaction may change without touching `parts`; empty parts when there are none. */
export const copyParts = (parts?: FileParts): FileParts => ({
  log: copyLogged(parts?.log),
  production: copyProductionTables(parts?.production),
});

/** A part as the current transaction sees it, and a write that joins that transaction. */
type PartOf = <K extends keyof FileParts>(
  part: K,
) => {
  read: () => FileParts[K];
  write: <T>(op: (tables: FileParts[K]) => T) => T;
};

/** The file's stores over its parts; `setLocked` writes the document row the log keeps. */
export function createFileStores(options: {
  partOf: PartOf;
  setLocked: (docId: string, locked: boolean) => void;
}): Pick<DocFile, "production"> {
  const { partOf, setLocked } = options;
  return {
    production: createMemoryProduction({ ...partOf("production"), setLocked }),
  };
}
