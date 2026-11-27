/**
 * Registers /sw.js with `updateViaCache: "none"`; a null container (no secure context, as on a LAN address)
 * registers nothing. Nothing here reloads the page: controlled reloads are handled by `sw-lifecycle.ts`.
 */
export function registerServiceWorker(options: {
  container: ServiceWorkerContainer | null;
}): Promise<ServiceWorkerRegistration | null> {
  if (options.container === null) return Promise.resolve(null);
  return options.container
    .register("/sw.js", { updateViaCache: "none" })
    .catch(() => null);
}
