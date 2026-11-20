/**
 * Registers /sw.js; a null container (no secure context, as on a LAN address) registers nothing.
 * Nothing here reloads the page: a new version of the worker controls the next launch.
 */
export function registerServiceWorker(options: {
  container: ServiceWorkerContainer | null;
}): void {
  options.container?.register("/sw.js").catch(() => {
    // without the worker the app still runs, online only, and the next launch registers again
  });
}
