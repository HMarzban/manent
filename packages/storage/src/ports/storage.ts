// The storage: the directory and the control file's other stores, and the document files it opens.
import type { ApiKeyStore } from "./api-keys.ts";
import type { DocDirectory } from "./directory.ts";
import type { DocFile, Home } from "./doc-file.ts";
import type { OutboxStore } from "./outbox.ts";
import type { ShareLinkStore } from "./sharing.ts";
import type { TrashStore } from "./trash.ts";
import type { WorkspaceSettingsStore } from "./workspace.ts";

export const STORAGE_SCHEMA_VERSION = 13;

/** Maximum combined binary asset size per project file: 200 MiB. */
export const PROJECT_ASSETS_MAX_BYTES = 200 * 1024 * 1024;

export interface ProjectAssetMeta {
  readonly assetId: string;
  readonly mime: string;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly createdByUserId: string;
  readonly createdAt: number;
}

export interface ProjectAssetRow extends ProjectAssetMeta {
  readonly bytes: Uint8Array;
}

export interface PutProjectAsset {
  readonly assetId: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: Uint8Array;
  readonly createdByUserId: string;
  readonly createdAt: number;
  /** Optional cap override in bytes; defaults to PROJECT_ASSETS_MAX_BYTES (200 MiB). */
  readonly maxProjectBytes?: number;
}

export type PutProjectAssetResult =
  | { readonly status: "stored"; readonly meta: ProjectAssetMeta }
  | { readonly status: "exists"; readonly meta: ProjectAssetMeta }
  | {
      readonly status: "quota_exceeded";
      readonly usedBytes: number;
      readonly maxBytes: number;
    };

/** Content-addressed binary assets stored inside a project's document file. */
export interface ProjectAssetsStore {
  get(assetId: string): ProjectAssetRow | null;
  head(assetId: string): ProjectAssetMeta | null;
  /**
   * Stores an asset atomically: returns `"exists"` when `assetId` is already
   * stored (without charging quota again), `"quota_exceeded"` when storing
   * would exceed the project cap (writing nothing), or `"stored"` on insert.
   */
  put(asset: PutProjectAsset): PutProjectAssetResult;
  totalBytes(): number;
  listMeta(): ProjectAssetMeta[];
}

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
