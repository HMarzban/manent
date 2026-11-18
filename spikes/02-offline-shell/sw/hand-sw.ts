// A hand-written worker with the same contract, as the control: one cache per build, filled on
// install, emptied of older builds on activate; /api/ always goes to the network.
declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: { url: string; revision: string | null }[]; __BUILD_ID: string };

const CACHE = `manent-shell-${self.__BUILD_ID}`;

self.addEventListener("install", (event) => {
  // `reload` keeps the HTTP cache from handing back the previous build's files.
  const requests = self.__SW_MANIFEST.map((entry) => new Request(entry.url, { cache: "reload" }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

async function fromShell(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request.mode === "navigate" ? "/index.html" : request);
  return hit ?? fetch(request);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fromShell(event.request));
});

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
