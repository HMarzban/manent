// The storage: the directory and the control file's other stores, and the document files it opens.
import type { ApiKeyStore } from "./api-keys.ts";
import type { DocDirectory } from "./directory.ts";
import type { DocFile, Home } from "./doc-file.ts";
import type { OutboxStore } from "./outbox.ts";
import type { ShareLinkStore } from "./sharing.ts";
import type { TrashStore } from "./trash.ts";
import type { WorkspaceSettingsStore } from "./workspace.ts";

export const STORAGE_SCHEMA_VERSION = 10;

export interface Storage {
  readonly directory: DocDirectory;
  readonly trash: TrashStore;
  readonly workspace: WorkspaceSettingsStore;
  readonly apiKeys: ApiKeyStore;
  readonly outbox: OutboxStore;
  readonly shareLinks: ShareLinkStore;
  /** Opened on first use and kept. RangeError for a home that is not well formed. */
  open(home: Home): DocFile;
  /** Runs `fn` as one control-file transaction (directory, trash, share links); joins an outer one when nested. */
  transaction<T>(fn: () => T): T;
  close(): void;
}
