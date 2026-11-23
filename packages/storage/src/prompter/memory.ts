// The prompter's sends and send requests kept in memory, for the in-memory driver.
import type { PrompterStore } from "../ports/index.ts";

/** One document file's rows. Values are replaced, never changed in place. */
export interface PrompterTables {}

/** A copy that a transaction may change without touching `tables`. */
export function copyPrompterTables(
  tables: PrompterTables | undefined,
): PrompterTables {
  return { ...tables };
}

/** The store over `read` and `write`, which give the file's tables as one transaction sees them. */
export function createMemoryPrompter(_options: {
  read: () => PrompterTables;
  write: <T>(op: (tables: PrompterTables) => T) => T;
}): PrompterStore {
  return {};
}
