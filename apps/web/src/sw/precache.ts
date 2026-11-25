/// <reference lib="webworker" />
// The shell's caching, on Serwist's core: the build's shell precached, heavy on-demand assets cached on first use,
// and every navigation answered by the page.
import {
  CacheFirst,
  CacheableResponsePlugin,
  NavigationRoute,
  NetworkFirst,
  Route,
  Serwist,
} from "serwist";
import type { PrecacheEntry } from "./manifest.ts";

export const RUNTIME_ASSETS_CACHE_PREFIX = "manent-runtime-assets-";
const HASHED_ASSET = new RegExp("-[a-z0-9]{8}\\.(js|woff2?)$");
const INK_WORKER_PATH = "/ink-compile.worker.js";
const API_PATH = /^\/api\//;

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
  if (HASHED_ASSET.test(pathname)) return "cache_first";
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

/**
 * Precaches `entries`, answers same-origin navigations outside /api/ and /ws from the cached /index.html,
 * caches content-hashed on-demand scripts and fonts cache-first, and serves the unhashed Ink worker network-first;
 * every other request goes to the network untouched. A new version waits until every tab has closed.
 */
export function startPrecache(options: {
  entries: readonly PrecacheEntry[];
  scope: ServiceWorkerGlobalScope;
  buildId?: string;
}): void {
  const scopeBuildId: unknown = Reflect.get(options.scope, "__BUILD_ID");
  const cacheName = runtimeAssetsCacheName(
    options.buildId ??
      (typeof scopeBuildId === "string" ? scopeBuildId : undefined),
  );
  const serwist = new Serwist({
    precacheEntries: [...options.entries],
    skipWaiting: false,
    clientsClaim: true,
    navigationPreload: false,
  });
  serwist.registerRoute(
    new NavigationRoute(serwist.createHandlerBoundToUrl("/index.html"), {
      denylist: [API_PATH, /^\/ws$/],
    }),
  );
  serwist.registerRoute(
    new Route(
      ({ sameOrigin, url }) =>
        runtimeAssetStrategy(sameOrigin, url.pathname) === "cache_first",
      new CacheFirst({
        cacheName,
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      }),
    ),
  );
  serwist.registerRoute(
    new Route(
      ({ sameOrigin, url }) =>
        runtimeAssetStrategy(sameOrigin, url.pathname) === "network_first",
      new NetworkFirst({
        cacheName,
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      }),
    ),
  );
  options.scope.addEventListener("activate", (event) => {
    event.waitUntil(cleanStaleRuntimeCaches(options.scope.caches, cacheName));
  });
  serwist.addEventListeners();
}
