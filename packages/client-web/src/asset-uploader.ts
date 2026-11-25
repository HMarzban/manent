// Browser-side project asset uploader and resolver: strict IDB staging,
// exponential-backoff PUT drain, and SHA-256-verified on-demand GET object URL cache.
import type { IdbAssetStore, StoredAssetRecord } from "./asset-store.ts";
import { computeSha256Hex, validateLocalAssetBytes } from "./asset-validate.ts";
import type { ValidatedLocalAsset } from "./asset-validate.ts";

export * from "./asset-validate.ts";

export type AssetFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface StagedAsset extends ValidatedLocalAsset {
  readonly assetId: string;
  readonly url: string;
}

export interface DrainResult {
  readonly uploaded: readonly string[];
  readonly pending: number;
  readonly refused: readonly string[];
}

export interface AssetUploaderTimers {
  schedule(fn: () => void, delayMs: number): () => void;
}

export interface AssetUploaderOptions {
  readonly projectId: string;
  readonly store: IdbAssetStore;
  readonly baseUrl?: string;
  readonly fetch?: AssetFetch;
  readonly headers?: () =>
    Record<string, string> | Promise<Record<string, string>>;
  readonly isOnline?: () => boolean;
  readonly timers?: AssetUploaderTimers;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly maxCacheBytes?: number;
  readonly onUploadRefused?: (assetId: string, status: number) => void;
}

export interface AssetUploader {
  stageAsset(bytes: Uint8Array): Promise<StagedAsset>;
  drainPending(): Promise<DrainResult>;
  notifyOnline(): Promise<DrainResult>;
  resolveAssetUrl(assetId: string): Promise<string | null>;
  destroy(): void;
}

const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 60_000;
const DEFAULT_MAX_CACHE_BYTES = 100 * 1024 * 1024;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function defaultTimers(): AssetUploaderTimers {
  return {
    schedule(fn, delayMs) {
      const id = setTimeout(fn, delayMs);
      return () => clearTimeout(id);
    },
  };
}

function isPermanentRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Stages local image blobs with strict IndexedDB durability, drains pending uploads
 * to `PUT /api/projects/:projectId/assets/:assetId` with exponential backoff, and
 * resolves cached or on-demand `GET` object URLs with SHA-256 verification.
 */
export function createAssetUploader(
  options: AssetUploaderOptions,
): AssetUploader {
  const { projectId, store } = options;
  const baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
  const fetchFn: AssetFetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const isOnline =
    options.isOnline ??
    (() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const timers = options.timers ?? defaultTimers();
  const createUrl =
    options.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeUrl =
    options.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const maxCacheBytes = options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES;

  const urlCache = new Map<string, string>();
  const pendingResolutions = new Map<string, Promise<string | null>>();
  const refusedIds = new Set<string>();
  let destroyed = false;
  let backoffAttempt = 0;
  let cancelRetry: (() => void) | null = null;
  let inFlightDrain: Promise<DrainResult> | null = null;

  const assetUrlFor = (assetId: string): string =>
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`;

  const cacheObjectUrl = (
    assetId: string,
    bytes: Uint8Array,
    mime: string,
  ): string | null => {
    const existing = urlCache.get(assetId);
    if (existing !== undefined) return existing;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const url = createUrl(new Blob([copy], { type: mime }));
    if (destroyed) {
      revokeUrl(url);
      return null;
    }
    urlCache.set(assetId, url);
    return url;
  };

  const clearRetryTimer = (): void => {
    if (cancelRetry !== null) {
      cancelRetry();
      cancelRetry = null;
    }
  };

  const scheduleRetry = (): void => {
    if (destroyed) return;
    clearRetryTimer();
    backoffAttempt += 1;
    const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (backoffAttempt - 1));
    cancelRetry = timers.schedule(() => {
      cancelRetry = null;
      if (!destroyed) void drainPending();
    }, delay);
  };

  const uploadOne = async (
    record: StoredAssetRecord,
  ): Promise<"uploaded" | "refused" | "retry"> => {
    try {
      const extra = (await options.headers?.()) ?? {};
      const body = new Uint8Array(record.bytes.byteLength);
      body.set(record.bytes);
      const response = await fetchFn(assetUrlFor(record.assetId), {
        method: "PUT",
        headers: { ...extra, "Content-Type": record.mime },
        body,
      });
      if (response.ok) return "uploaded";
      if (isPermanentRefusal(response.status)) {
        options.onUploadRefused?.(record.assetId, response.status);
        return "refused";
      }
      return "retry";
    } catch {
      return "retry";
    }
  };

  const runDrain = async (): Promise<DrainResult> => {
    const uploaded: string[] = [];
    const refused: string[] = [];
    if (destroyed) return { uploaded, pending: 0, refused };
    const queue = await store.listPendingAssets(projectId);
    const actionable = queue.filter((row) => !refusedIds.has(row.assetId));
    if (!isOnline() || actionable.length === 0) {
      return { uploaded, pending: actionable.length, refused };
    }
    clearRetryTimer();
    let remaining = actionable.length;
    for (const record of actionable) {
      if (destroyed || !isOnline()) break;
      const outcome = await uploadOne(record);
      if (outcome === "uploaded") {
        await store.markAssetUploaded(record.assetId);
        backoffAttempt = 0;
        uploaded.push(record.assetId);
        remaining -= 1;
      } else if (outcome === "refused") {
        refusedIds.add(record.assetId);
        refused.push(record.assetId);
        remaining -= 1;
      } else {
        scheduleRetry();
        break;
      }
    }
    return { uploaded, pending: remaining, refused };
  };

  const drainPending = (): Promise<DrainResult> => {
    if (inFlightDrain !== null) return inFlightDrain;
    const promise = runDrain().finally(() => {
      if (inFlightDrain === promise) inFlightDrain = null;
    });
    inFlightDrain = promise;
    return promise;
  };

  const resolveUncached = async (assetId: string): Promise<string | null> => {
    if (destroyed || !SHA256_HEX_PATTERN.test(assetId)) return null;
    const local = await store.getAsset(assetId);
    if (destroyed) return null;
    if (local !== null)
      return cacheObjectUrl(local.assetId, local.bytes, local.mime);
    if (!isOnline()) return null;
    try {
      const extra = (await options.headers?.()) ?? {};
      const response = await fetchFn(assetUrlFor(assetId), {
        method: "GET",
        headers: extra,
      });
      if (!response.ok || destroyed) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = await computeSha256Hex(bytes);
      if (digest !== assetId || destroyed) return null;
      const valid = validateLocalAssetBytes(bytes);
      await store.putUploadedAsset({
        assetId,
        projectId,
        mime: valid.mime,
        width: valid.width,
        height: valid.height,
        bytes,
      });
      await store.evictUploadedLru(maxCacheBytes);
      return cacheObjectUrl(assetId, bytes, valid.mime);
    } catch {
      return null;
    }
  };

  return {
    async stageAsset(bytes) {
      const valid = validateLocalAssetBytes(bytes);
      const assetId = await computeSha256Hex(bytes);
      refusedIds.delete(assetId);
      const stored = await store.putPendingAsset({
        assetId,
        projectId,
        mime: valid.mime,
        width: valid.width,
        height: valid.height,
        bytes,
      });
      const url = cacheObjectUrl(assetId, stored.bytes, stored.mime) ?? "";
      if (!destroyed && isOnline()) void drainPending();
      return { ...valid, assetId, url };
    },

    drainPending,

    notifyOnline() {
      clearRetryTimer();
      backoffAttempt = 0;
      return drainPending();
    },

    resolveAssetUrl(rawAssetId) {
      const assetId = rawAssetId.toLowerCase();
      if (destroyed) return Promise.resolve(null);
      const cached = urlCache.get(assetId);
      if (cached !== undefined) return Promise.resolve(cached);
      const inFlight = pendingResolutions.get(assetId);
      if (inFlight !== undefined) return inFlight;
      const promise = resolveUncached(assetId).finally(() => {
        pendingResolutions.delete(assetId);
      });
      pendingResolutions.set(assetId, promise);
      return promise;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearRetryTimer();
      for (const url of urlCache.values()) revokeUrl(url);
      urlCache.clear();
      pendingResolutions.clear();
    },
  };
}
