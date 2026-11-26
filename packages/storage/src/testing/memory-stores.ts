// The in-memory driver's stores beside the log and the directory: each document file's parts and the stores over
// them, and the control file's tables and the stores over those.
import { createApiKeyTables, createMemoryApiKeys } from "../api-keys/memory.ts";
import type { ApiKeyTables } from "../api-keys/memory.ts";
import { copyAssetTables, createMemoryAssets } from "../assets/store.ts";
import type { AssetTables } from "../assets/store.ts";
import { createMemoryOutbox, createOutboxTables } from "../outbox/memory.ts";
import type { OutboxTables } from "../outbox/memory.ts";
import type { DocDirectory, DocFile, Storage } from "../ports/index.ts";
import {
  copyPrivateCopyTables,
  createMemoryPrivateCopies,
} from "../private-copy/memory.ts";
import type { PrivateCopyTables } from "../private-copy/memory.ts";
import {
  copyProductionTables,
  createMemoryProduction,
} from "../production/memory.ts";
import type { ProductionTables } from "../production/memory.ts";
import {
  copyPrompterTables,
  createMemoryPrompter,
} from "../prompter/memory.ts";
import type { PrompterTables } from "../prompter/memory.ts";
import {
  copySharingTables,
  createMemoryShareLinks,
  createMemorySharing,
  createShareLinkTables,
} from "../sharing/memory.ts";
import type { ShareLinkTables, SharingTables } from "../sharing/memory.ts";
import { createMemoryTrash, createTrashTables } from "../trash/memory.ts";
import type { TrashTables } from "../trash/memory.ts";
import {
  createMemoryWorkspaceSettings,
  createWorkspaceSettingsTables,
} from "../workspace/memory.ts";
import type { WorkspaceSettingsTables } from "../workspace/memory.ts";
import { copyLogged } from "./memory-log.ts";
import type { Logged } from "./memory-log.ts";

/** One document file's contents; a transaction works on a copy of each part. */
export interface FileParts {
  log: Logged;
  production: ProductionTables;
  sharing: SharingTables;
  privateCopies: PrivateCopyTables;
  prompter: PrompterTables;
  assets: AssetTables;
}

/** A copy that a transaction may change without touching `parts`; empty parts when there are none. */
export const copyParts = (parts?: FileParts): FileParts => ({
  log: copyLogged(parts?.log),
  production: copyProductionTables(parts?.production),
  sharing: copySharingTables(parts?.sharing),
  privateCopies: copyPrivateCopyTables(parts?.privateCopies),
  prompter: copyPrompterTables(parts?.prompter),
  assets: copyAssetTables(parts?.assets),
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
}): Pick<
  DocFile,
  "production" | "sharing" | "privateCopies" | "prompter" | "assets"
> {
  const { partOf, setLocked } = options;
  return {
    production: createMemoryProduction({ ...partOf("production"), setLocked }),
    sharing: createMemorySharing(partOf("sharing")),
    privateCopies: createMemoryPrivateCopies(partOf("privateCopies")),
    prompter: createMemoryPrompter(partOf("prompter")),
    assets: createMemoryAssets(partOf("assets")),
  };
}

/** The control file's tables beside the directory. */
export interface ControlTables {
  trash: TrashTables;
  workspace: WorkspaceSettingsTables;
  apiKeys: ApiKeyTables;
  outbox: OutboxTables;
  shareLinks: ShareLinkTables;
}

export const createControlTables = (): ControlTables => ({
  trash: createTrashTables(),
  workspace: createWorkspaceSettingsTables(),
  apiKeys: createApiKeyTables(),
  outbox: createOutboxTables(),
  shareLinks: createShareLinkTables(),
});

/** The control file's stores over the tables `read` gives, each write through `commit`. */
export function createControlStores(options: {
  now: () => number;
  read: () => ControlTables;
  commit: <T>(apply: () => T) => T;
  directory: DocDirectory;
}): Pick<Storage, "trash" | "workspace" | "apiKeys" | "outbox" | "shareLinks"> {
  const { now, read, commit, directory } = options;
  const over = <K extends keyof ControlTables>(store: K) => ({
    now,
    read: () => read()[store],
    commit,
  });
  return {
    trash: createMemoryTrash(over("trash")),
    workspace: createMemoryWorkspaceSettings(over("workspace")),
    apiKeys: createMemoryApiKeys(over("apiKeys")),
    outbox: createMemoryOutbox(over("outbox")),
    shareLinks: createMemoryShareLinks({ ...over("shareLinks"), directory }),
  };
}
