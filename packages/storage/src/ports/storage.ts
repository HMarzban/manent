// The storage: the directory and the document files it opens.
import type { DocDirectory } from "./directory.ts";
import type { DocFile, Home } from "./doc-file.ts";

export const STORAGE_SCHEMA_VERSION = 5;

export interface Storage {
  readonly directory: DocDirectory;
  /** Opened on first use and kept. RangeError for a home that is not well formed. */
  open(home: Home): DocFile;
  close(): void;
}
