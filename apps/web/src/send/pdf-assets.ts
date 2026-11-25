// Resolves project assets referenced by paginated graphic blocks for PDFKit export,
// lazily transcoding WebP blobs to PNG and omitting unavailable blobs (vector placeholder fallback).
import type { IdbAssetStore, StoredAssetRecord } from "@manent/client-web";
import type { PdfAsset } from "@manent/formats";
import type { Pagination } from "@manent/pagination";
import { archiveSource } from "../archive/archive-source.ts";
import { getProjectAssetUploader } from "../editor-host/graphics-bridge.ts";
import { transcodeWebpToPng } from "../graphics/webp-to-png.ts";
import type { WebpTranscodePorts } from "../graphics/webp-to-png.ts";

export interface PdfAssetReader {
  readAsset(assetId: string): Promise<StoredAssetRecord | null>;
}

/** Unique assetIds referenced by `"graphic"` blocks across `pagination`. */
export function graphicAssetIdsInPagination(pagination: Pagination): string[] {
  const ids = new Set<string>();
  for (const block of pagination.blocks) {
    if (block.type === "graphic" && block.graphic?.assetId)
      ids.add(block.graphic.assetId);
  }
  return [...ids];
}

/** Builds `PdfOptions.assets` for `pagination`, transcoding WebP → PNG on demand. */
export async function collectPdfAssets(
  pagination: Pagination,
  reader: PdfAssetReader,
  transcodePorts?: WebpTranscodePorts,
): Promise<Map<string, PdfAsset>> {
  const assets = new Map<string, PdfAsset>();
  for (const assetId of graphicAssetIdsInPagination(pagination)) {
    const record = await reader.readAsset(assetId);
    if (record === null) continue;
    if (record.mime === "image/png" || record.mime === "image/jpeg") {
      assets.set(assetId, { mime: record.mime, bytes: record.bytes });
      continue;
    }
    if (record.mime === "image/webp") {
      const png = await transcodeWebpToPng(record.bytes, transcodePorts);
      if (png !== null) assets.set(assetId, { mime: "image/png", bytes: png });
    }
  }
  return assets;
}

/** Loads PDF assets for an open document from its project's IDB store (fetching online when missing). */
export async function loadPdfAssetsForDoc(
  docId: string,
  pagination: Pagination,
): Promise<Map<string, PdfAsset>> {
  const ids = graphicAssetIdsInPagination(pagination);
  if (ids.length === 0) return new Map();
  const services = archiveSource.get();
  if (services === null) return new Map();
  const projectId = services.library.documentProject(docId).get() ?? docId;
  const pooled = await getProjectAssetUploader(services, projectId);
  if (pooled === null) return new Map();
  const reader: PdfAssetReader = {
    async readAsset(assetId) {
      const local = await pooled.store.getAsset(assetId, { touch: false });
      if (local !== null) return local;
      await pooled.uploader.resolveAssetUrl(assetId);
      return pooled.store.getAsset(assetId, { touch: false });
    },
  };
  return collectPdfAssets(pagination, reader);
}

/** Helper adapter wrapping an `IdbAssetStore` directly as a `PdfAssetReader`. */
export function pdfAssetReaderFromStore(store: IdbAssetStore): PdfAssetReader {
  return {
    readAsset: (assetId) => store.getAsset(assetId, { touch: false }),
  };
}
