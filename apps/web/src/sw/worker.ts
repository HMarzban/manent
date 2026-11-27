/// <reference lib="webworker" />
// The service worker's entry: the build compiles in the precache list, its build id, and optional warm list.
import type { PrecacheEntry } from "./manifest.ts";
import { startPrecache } from "./precache.ts";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: PrecacheEntry[];
  __BUILD_ID: string;
  __WARM_MANIFEST?: readonly string[];
};

// the build replaces these exact expressions, so they keep the names the build defines
// oxlint-disable-next-line no-underscore-dangle
const entries = self.__SW_MANIFEST;
// oxlint-disable-next-line no-underscore-dangle
const buildId: unknown = self.__BUILD_ID;
// oxlint-disable-next-line no-underscore-dangle
const rawWarm: unknown = self.__WARM_MANIFEST;
const warmUrls = Array.isArray(rawWarm)
  ? rawWarm.filter((item): item is string => typeof item === "string")
  : [];

startPrecache({
  entries,
  buildId: typeof buildId === "string" ? buildId : undefined,
  warmUrls,
  scope: self,
});
