// The shell's worker on Serwist's core: precache what Bun.build produced, serve navigations from
// /index.html, leave /api/ to the network.
import { NavigationRoute, Serwist } from "serwist";
import type { PrecacheEntry } from "serwist";

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: PrecacheEntry[]; __BUILD_ID: string };

const serwist = new Serwist({ precacheEntries: self.__SW_MANIFEST, skipWaiting: false, clientsClaim: true });
serwist.registerRoute(
  new NavigationRoute(serwist.createHandlerBoundToUrl("/index.html"), { denylist: [/^\/api\//] }),
);
serwist.addEventListeners();

// Questions from the test page, answered on the MessagePort it sends.
self.addEventListener("message", (event) => {
  const port = event.ports[0];
  if (port === undefined) return;
  if (event.data?.type === "version") port.postMessage(self.__BUILD_ID);
  if (event.data?.type === "probe") {
    event.waitUntil(
      fetch("/api/ping", { cache: "no-store" }).then(
        (response) => port.postMessage({ ok: response.ok }),
        () => port.postMessage({ ok: false }),
      ),
    );
  }
});
