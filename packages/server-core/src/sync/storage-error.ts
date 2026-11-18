// Telling the storage's own failure from any other error.
import type { StorageError } from "@manent/storage";

/** StorageError by name: this package may import only the storage package's types. */
export function isStorageError(error: unknown): error is StorageError {
  return error instanceof Error && error.name === "StorageError";
}
