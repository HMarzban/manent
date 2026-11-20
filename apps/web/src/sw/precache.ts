/// <reference lib="webworker" />
// The shell's caching, on Serwist's core: the build's files precached, every navigation answered by the page.
import { NavigationRoute, Serwist } from "serwist";
import type { PrecacheEntry } from "./manifest.ts";

/**
 * Precaches `entries` and answers same-origin navigations outside /api/ and /ws from the cached /index.html;
 * every other request goes to the network untouched. A new version waits until every tab has closed.
 */
export function startPrecache(options: {
  entries: readonly PrecacheEntry[];
  scope: ServiceWorkerGlobalScope;
}): void {
  const serwist = new Serwist({
    precacheEntries: [...options.entries],
    skipWaiting: false,
    clientsClaim: true,
    navigationPreload: false,
  });
  serwist.registerRoute(
    new NavigationRoute(serwist.createHandlerBoundToUrl("/index.html"), {
      denylist: [/^\/api\//, /^\/ws$/],
    }),
  );
  serwist.addEventListeners();
}
