// The prompter's sends and send requests over SQLite.
import type { Database } from "bun:sqlite";
import type { PrompterStore } from "../ports/index.ts";

/** The store over a document file's connection, so that its writes join the file's `transaction`. */
export function createSqlitePrompter(_db: Database): PrompterStore {
  return {};
}
