// Collects project-scoped binary assets referenced by archive documents for `writeArchive({ assets })`.
import type { IdbAssetStore, StoredAssetRecord } from "@manent/client-web";
import type { ArchiveAsset, ArchiveDocument } from "@manent/formats";
import { getProjectAssetUploader } from "../editor-host/asset-pool.ts";
import type { PersonServices } from "../services/ports.ts";

export interface ArchiveAssetReader {
  readAsset(assetId: string): Promise<StoredAssetRecord | null>;
}

const isSupportedMime = (mime: string): mime is ArchiveAsset["mime"] =>
  mime === "image/png" || mime === "image/jpeg" || mime === "image/webp";

/** Unique assetIds referenced by `"graphic"` blocks across all archive documents. */
export function graphicAssetIdsInDocuments(
  documents: readonly ArchiveDocument[],
): string[] {
  const ids = new Set<string>();
  for (const doc of documents) {
    for (const block of doc.script.blocks) {
      if (block.attrs?.type !== "graphic") continue;
      const graphic: unknown = block.attrs.graphic;
      if (
        typeof graphic === "object" &&
        graphic !== null &&
        typeof (graphic as Record<string, unknown>).assetId === "string"
      ) {
        ids.add((graphic as Record<string, unknown>).assetId as string);
      }
    }
  }
  return [...ids];
}

/** Reads available assets referenced by `documents` for bundling under `assets/<assetId>.<ext>`. */
export async function collectArchiveAssets(
  documents: readonly ArchiveDocument[],
  reader: ArchiveAssetReader,
): Promise<ArchiveAsset[]> {
  const collected: ArchiveAsset[] = [];
  for (const assetId of graphicAssetIdsInDocuments(documents)) {
    const record = await reader.readAsset(assetId);
    if (record === null || !isSupportedMime(record.mime)) continue;
    collected.push({
      assetId: record.assetId,
      mime: record.mime,
      width: record.width,
      height: record.height,
      bytes: record.bytes,
    });
  }
  return collected;
}

/** Project-scoped adapter wrapping an `IdbAssetStore` as an `ArchiveAssetReader` (rejects cross-project records). */
export function archiveAssetReaderFromStore(
  store: IdbAssetStore,
  projectId: string,
): ArchiveAssetReader {
  return {
    async readAsset(assetId) {
      const record = await store.getAsset(assetId, { touch: false });
      return record !== null && record.projectId === projectId ? record : null;
    },
  };
}

/** Loads archive assets strictly scoped to `projectId` from IndexedDB (falling back to online fetch when absent). */
export async function loadArchiveAssetsForProject(
  services: {
    readonly userId: string;
    readonly messages?: PersonServices["messages"];
  },
  projectId: string,
  documents: readonly ArchiveDocument[],
): Promise<ArchiveAsset[]> {
  const ids = graphicAssetIdsInDocuments(documents);
  if (ids.length === 0) return [];
  const pooled = await getProjectAssetUploader(services, projectId);
  if (pooled === null) return [];
  return collectArchiveAssets(documents, {
    async readAsset(assetId) {
      const local = await pooled.store.getAsset(assetId, { touch: false });
      if (local !== null) return local.projectId === projectId ? local : null;
      await pooled.uploader.resolveAssetUrl(assetId);
      const fetched = await pooled.store.getAsset(assetId, { touch: false });
      return fetched !== null && fetched.projectId === projectId
        ? fetched
        : null;
    },
  });
}
