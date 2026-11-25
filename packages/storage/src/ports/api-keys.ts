// The public API's keys, stored in the control file.

/** One stored API key row (the secret is never stored; only its hash). */
export interface ApiKeyRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  /** Exact SHA-256 hash bytes of the key secret. */
  readonly keyHash: Uint8Array;
  readonly createdByUserId: string;
  /** Creation instant in integer milliseconds since the epoch. */
  readonly createdAt: number;
  /** Most recent authenticated request instant in integer milliseconds since the epoch, or null if unused. */
  readonly lastUsedAt: number | null;
  /** Revocation instant in integer milliseconds since the epoch, or null while active. */
  readonly revokedAt: number | null;
}

/** Input to create a new API key row. */
export interface CreateApiKeyInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly keyHash: Uint8Array;
  readonly createdByUserId: string;
}

/** Control-file repository for workspace API keys. */
export interface ApiKeyStore {
  /** Inserts a new key row at now(); throws StorageError("commit_failed") on duplicate id or keyHash. */
  create(input: CreateApiKeyInput): ApiKeyRow;
  /** Finds a key row by exact byte match on keyHash, or null when absent. */
  findByHash(keyHash: Uint8Array): ApiKeyRow | null;
  /** Lists every key in workspaceId ordered newest first (createdAt DESC, id ASC). */
  list(workspaceId: string): ApiKeyRow[];
  /** Revokes an active key belonging to workspaceId at now(); returns true iff that key was revoked. Never revokes across workspaces. */
  revoke(workspaceId: string, id: string): boolean;
  /** Records lastUsedAt = now() for the key id. */
  touch(id: string): void;
}
