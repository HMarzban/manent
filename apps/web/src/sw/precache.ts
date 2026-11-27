/// <reference lib="webworker" />
// The shell's caching, on Serwist's core: the build's shell precached, heavy on-demand assets cached on first use
// or warmed when idle, and every navigation answered by the page.
import {
  CacheFirst,
  CacheableResponsePlugin,
  NavigationRoute,
  NetworkFirst,
  Route,
  Serwist,
} from "serwist";
import type { SerwistPlugin } from "serwist";
import type { PrecacheEntry } from "./manifest.ts";

export const RUNTIME_ASSETS_CACHE_PREFIX = "manent-runtime-assets-";
const HASHED_ASSET = new RegExp("-[a-z0-9]{8}\\.(js|woff2?)$");
const HASHED_INK_WORKER = new RegExp(
  "^/ink-compile-[a-z0-9]{8}\\.worker\\.js$",
);
const INK_WORKER_PATH = "/ink-compile.worker.js";
const INK_WORKER_NETWORK_TIMEOUT_SECONDS = 4;
const API_PATH = /^\/api\//;

export type SwOfflineReadinessStatus = "ready" | "warming" | "shell_only";

export interface SwOfflineReadinessMessage {
  readonly type: "OFFLINE_READINESS_STATE";
  readonly status: SwOfflineReadinessStatus;
  readonly cached: number;
  readonly total: number;
}

/** True when `response` carries an HTML content-type, which must never populate runtime JS/font/worker caches. */
export function isHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("text/html");
}

/** Serwist plugin that refuses to cache HTML fallbacks into runtime asset caches. */
export function createNoHtmlCachePlugin(): SerwistPlugin {
  return {
    async cacheWillUpdate({ response }) {
      return isHtmlResponse(response) ? null : response;
    },
  };
}

/** Versioned runtime assets cache name for `buildId`, with a safe fallback when unversioned. */
export function runtimeAssetsCacheName(buildId?: string): string {
  const suffix =
    typeof buildId === "string" && buildId.length > 0 ? buildId : "dev";
  return `${RUNTIME_ASSETS_CACHE_PREFIX}${suffix}`;
}

/** Which runtime caching strategy applies to `pathname`, or null when the request goes straight to the network. */
export function runtimeAssetStrategy(
  sameOrigin: boolean,
  pathname: string,
): "cache_first" | "network_first" | null {
  if (!sameOrigin || pathname === "/sw.js" || API_PATH.test(pathname))
    return null;
  if (pathname === INK_WORKER_PATH) return "network_first";
  if (HASHED_INK_WORKER.test(pathname) || HASHED_ASSET.test(pathname))
    return "cache_first";
  return null;
}

/** Deletes older versioned runtime asset caches while leaving `currentCacheName` and unrelated caches intact. */
export async function cleanStaleRuntimeCaches(
  caches: CacheStorage,
  currentCacheName: string,
): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith(RUNTIME_ASSETS_CACHE_PREFIX) &&
          name !== currentCacheName,
      )
      .map((name) => caches.delete(name)),
  );
}

function postToSource(
  source: ExtendableMessageEvent["source"],
  message: SwOfflineReadinessMessage,
): void {
  if (source !== null && "postMessage" in source) {
    // Client/MessagePort/ServiceWorker.postMessage takes no targetOrigin
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    source.postMessage(message);
  }
}

async function hasCachedShell(caches: CacheStorage): Promise<boolean> {
  const match = await caches.match("/index.html", { ignoreSearch: true });
  return match !== undefined;
}

/** Inspects precache and `cacheName` to report how many `warmUrls` are cached for offline use. */
export async function inspectOfflineReadiness(
  caches: CacheStorage,
  cacheName: string,
  warmUrls: readonly string[],
): Promise<SwOfflineReadinessMessage> {
  const unique = [...new Set(warmUrls)];
  const shellReady = await hasCachedShell(caches);
  if (unique.length === 0) {
    return {
      type: "OFFLINE_READINESS_STATE",
      status: shellReady ? "ready" : "shell_only",
      cached: 0,
      total: 0,
    };
  }
  const cache = await caches.open(cacheName);
  let cached = 0;
  for (const url of unique) {
    const found = (await cache.match(url)) ?? (await caches.match(url));
    if (found !== undefined) cached += 1;
  }
  return {
    type: "OFFLINE_READINESS_STATE",
    status: shellReady && cached === unique.length ? "ready" : "shell_only",
    cached,
    total: unique.length,
  };
}

export type WarmFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Sequentially warms missing `warmUrls` into `cacheName`, verifying each response is `ok` and not HTML before caching.
 * Aborts cleanly on network drop or invalid response without writing corrupt entries.
 */
export async function warmOfflineUrls(options: {
  caches: CacheStorage;
  cacheName: string;
  warmUrls: readonly string[];
  fetchFn: WarmFetch;
  onProgress: (state: SwOfflineReadinessMessage) => void;
}): Promise<SwOfflineReadinessMessage> {
  const unique = [...new Set(options.warmUrls)];
  const shellReady = await hasCachedShell(options.caches);
  if (unique.length === 0) {
    const done: SwOfflineReadinessMessage = {
      type: "OFFLINE_READINESS_STATE",
      status: shellReady ? "ready" : "shell_only",
      cached: 0,
      total: 0,
    };
    options.onProgress(done);
    return done;
  }
  const cache = await options.caches.open(options.cacheName);
  const missing: string[] = [];
  let cached = 0;
  for (const url of unique) {
    const found = (await cache.match(url)) ?? (await options.caches.match(url));
    if (found !== undefined) cached += 1;
    else missing.push(url);
  }
  const total = unique.length;
  if (missing.length === 0) {
    const done: SwOfflineReadinessMessage = {
      type: "OFFLINE_READINESS_STATE",
      status: shellReady ? "ready" : "shell_only",
      cached,
      total,
    };
    options.onProgress(done);
    return done;
  }
  options.onProgress({
    type: "OFFLINE_READINESS_STATE",
    status: "warming",
    cached,
    total,
  });
  for (const url of missing) {
    let response: Response;
    try {
      response = await options.fetchFn(url);
    } catch {
      const aborted: SwOfflineReadinessMessage = {
        type: "OFFLINE_READINESS_STATE",
        status: "shell_only",
        cached,
        total,
      };
      options.onProgress(aborted);
      return aborted;
    }
    if (!response.ok || isHtmlResponse(response)) {
      const aborted: SwOfflineReadinessMessage = {
        type: "OFFLINE_READINESS_STATE",
        status: "shell_only",
        cached,
        total,
      };
      options.onProgress(aborted);
      return aborted;
    }
    await cache.put(url, response);
    cached += 1;
    const isComplete = cached === total;
    options.onProgress({
      type: "OFFLINE_READINESS_STATE",
      status: isComplete ? (shellReady ? "ready" : "shell_only") : "warming",
      cached,
      total,
    });
  }
  return {
    type: "OFFLINE_READINESS_STATE",
    status: shellReady && cached === total ? "ready" : "shell_only",
    cached,
    total,
  };
}

function messageTypeOf(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const type: unknown = Reflect.get(data, "type");
  return typeof type === "string" ? type : null;
}

/**
 * Precaches `entries`, answers same-origin navigations outside /api/ and /ws from the cached /index.html,
 * caches content-hashed on-demand scripts, fonts and hashed Ink workers cache-first, and serves the unhashed Ink worker
 * network-first with a 4 s timeout; every other request goes to the network untouched.
 * A waiting worker activates only when a client sends `{ type: "SKIP_WAITING" }`.
 */
export function startPrecache(options: {
  entries: readonly PrecacheEntry[];
  scope: ServiceWorkerGlobalScope;
  buildId?: string;
  warmUrls?: readonly string[];
}): void {
  const scopeBuildId: unknown = Reflect.get(options.scope, "__BUILD_ID");
  const cacheName = runtimeAssetsCacheName(
    options.buildId ??
      (typeof scopeBuildId === "string" ? scopeBuildId : undefined),
  );
  const warmUrls = options.warmUrls ?? [];
  const noHtmlPlugin = createNoHtmlCachePlugin();
  const serwist = new Serwist({
    precacheEntries: [...options.entries],
    skipWaiting: false,
    clientsClaim: true,
    navigationPreload: false,
  });
  serwist.registerRoute(
    new NavigationRoute(serwist.createHandlerBoundToUrl("/index.html"), {
      denylist: [API_PATH, /^\/ws$/, /^\/benchmark-report\.html$/],
    }),
  );
  serwist.registerRoute(
    new Route(
      ({ sameOrigin, url }) =>
        runtimeAssetStrategy(sameOrigin, url.pathname) === "cache_first",
      new CacheFirst({
        cacheName,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          noHtmlPlugin,
        ],
      }),
    ),
  );
  serwist.registerRoute(
    new Route(
      ({ sameOrigin, url }) =>
        runtimeAssetStrategy(sameOrigin, url.pathname) === "network_first",
      new NetworkFirst({
        cacheName,
        networkTimeoutSeconds: INK_WORKER_NETWORK_TIMEOUT_SECONDS,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          noHtmlPlugin,
        ],
      }),
    ),
  );
  options.scope.addEventListener("activate", (event) => {
    event.waitUntil(cleanStaleRuntimeCaches(options.scope.caches, cacheName));
  });
  let inFlightWarm: {
    promise: Promise<SwOfflineReadinessMessage>;
    sources: Set<ExtendableMessageEvent["source"]>;
  } | null = null;
  options.scope.addEventListener("message", (event) => {
    const type = messageTypeOf(event.data);
    if (type === "SKIP_WAITING") {
      void options.scope.skipWaiting();
      return;
    }
    if (type === "OFFLINE_READINESS") {
      const work = inspectOfflineReadiness(
        options.scope.caches,
        cacheName,
        warmUrls,
      ).then((state) => {
        postToSource(event.source, state);
      });
      event.waitUntil(work);
      return;
    }
    if (type === "WARM_OFFLINE_TOOLS") {
      if (inFlightWarm !== null) {
        inFlightWarm.sources.add(event.source);
        event.waitUntil(inFlightWarm.promise);
        return;
      }
      const sources = new Set<ExtendableMessageEvent["source"]>([event.source]);
      const fetchFn: WarmFetch = (input, init) =>
        options.scope.fetch(input, init);
      const promise = warmOfflineUrls({
        caches: options.scope.caches,
        cacheName,
        warmUrls,
        fetchFn,
        onProgress: (state) => {
          for (const source of sources) postToSource(source, state);
        },
      }).finally(() => {
        inFlightWarm = null;
      });
      inFlightWarm = { promise, sources };
      event.waitUntil(promise);
    }
  });
  serwist.addEventListeners();
}
