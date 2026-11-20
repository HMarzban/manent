/// <reference lib="webworker" />
// The service worker's entry: the build compiles in the precache list and its hash.
import type { PrecacheEntry } from "./manifest.ts";
import { startPrecache } from "./precache.ts";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: PrecacheEntry[];
  __BUILD_ID: string;
};

// the build replaces this exact expression, so it keeps the name the build defines
// oxlint-disable-next-line no-underscore-dangle
startPrecache({ entries: self.__SW_MANIFEST, scope: self });
