// Resolves project-scoped assets referenced by paginated graphic blocks for PDFKit export,
// lazily transcoding WebP blobs to PNG and omitting unavailable or cross-project blobs.
import type { IdbAssetStore, StoredAssetRecord } from "@manent/client-web";
import type { EpubAsset, PdfAsset } from "@manent/formats";
import type { Pagination } from "@manent/pagination";
import { archiveSource } from "../archive/archive-source.ts";
import { getProjectAssetUploader } from "../editor-host/asset-pool.ts";
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

/** Loads PDF assets for an open document strictly scoped to its project's IDB/server assets. */
export async function loadPdfAssetsForDoc(
  docId: string,
  pagination: Pagination,
): Promise<Map<string, PdfAsset>> {
  const ids = graphicAssetIdsInPagination(pagination);
  if (ids.length === 0) return new Map();
  const services = archiveSource.get();
  if (services === null) return new Map();
  const projectId = services.library.documentProject(docId).get();
  if (projectId === null) return new Map();
  const pooled = await getProjectAssetUploader(services, projectId);
  if (pooled === null) return new Map();
  const reader: PdfAssetReader = {
    async readAsset(assetId) {
      const local = await pooled.store.getAsset(assetId, { touch: false });
      if (local !== null) return local.projectId === projectId ? local : null;
      await pooled.uploader.resolveAssetUrl(assetId);
      const fetched = await pooled.store.getAsset(assetId, { touch: false });
      return fetched !== null && fetched.projectId === projectId
        ? fetched
        : null;
    },
  };
  return collectPdfAssets(pagination, reader);
}

/** Loads one project-scoped cover asset for PDF (PNG/JPEG, transcoding WebP → PNG). */
export async function loadPdfCoverAsset(
  docId: string,
  assetId: string | null,
): Promise<PdfAsset | null> {
  if (assetId === null || assetId === "") return null;
  const record = await loadRawAssetForDoc(docId, assetId);
  if (record === null) return null;
  if (record.mime === "image/png" || record.mime === "image/jpeg") {
    return { mime: record.mime, bytes: record.bytes };
  }
  if (record.mime === "image/webp") {
    const png = await transcodeWebpToPng(record.bytes);
    if (png !== null) return { mime: "image/png", bytes: png };
  }
  return null;
}

/** Loads one project-scoped cover asset for EPUB 3 (preserving PNG/JPEG/WebP). */
export async function loadEpubCoverAsset(
  docId: string,
  assetId: string | null,
): Promise<EpubAsset | null> {
  if (assetId === null || assetId === "") return null;
  const record = await loadRawAssetForDoc(docId, assetId);
  if (record === null) return null;
  if (
    record.mime === "image/png" ||
    record.mime === "image/jpeg" ||
    record.mime === "image/webp"
  ) {
    return { mime: record.mime, bytes: record.bytes };
  }
  return null;
}

async function loadRawAssetForDoc(
  docId: string,
  assetId: string,
): Promise<StoredAssetRecord | null> {
  const services = archiveSource.get();
  if (services === null) return null;
  const projectId = services.library.documentProject(docId).get();
  if (projectId === null) return null;
  const pooled = await getProjectAssetUploader(services, projectId);
  if (pooled === null) return null;
  const local = await pooled.store.getAsset(assetId, { touch: false });
  if (local !== null) return local.projectId === projectId ? local : null;
  await pooled.uploader.resolveAssetUrl(assetId);
  const fetched = await pooled.store.getAsset(assetId, { touch: false });
  return fetched !== null && fetched.projectId === projectId ? fetched : null;
}

/** Project-scoped adapter wrapping an `IdbAssetStore` as a `PdfAssetReader` (rejects cross-project records). */
export function pdfAssetReaderFromStore(
  store: IdbAssetStore,
  projectId: string,
): PdfAssetReader {
  return {
    async readAsset(assetId) {
      const record = await store.getAsset(assetId, { touch: false });
      return record !== null && record.projectId === projectId ? record : null;
    },
  };
}
