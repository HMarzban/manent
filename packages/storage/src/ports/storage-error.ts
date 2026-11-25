// What a storage failure is called.
/** `commit_failed`: a transaction wrote nothing. `corrupt`: stored bytes fail their check. `disk_full`: a transaction wrote nothing because the disk is full. */
export class StorageError extends Error {
  readonly code: "commit_failed" | "corrupt" | "disk_full";

  constructor(code: StorageError["code"], options?: { cause?: unknown }) {
    super(code, options);
    this.name = "StorageError";
    this.code = code;
  }
}
