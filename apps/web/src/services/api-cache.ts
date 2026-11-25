// Lightweight in-flight and short-TTL deduplication for hot API calls (`me`, `role`, `people`, `describe`),
// scoped per PersonServices / bearer token so sign-out, person switch, or fresh mounts never serve stale data.
import type { DocSummary, SyncClient } from "@manent/sync-client";
import type { DocRole } from "@manent/sync-protocol";
import type { Api, MeResult } from "../api.ts";
import type { PersonServices } from "./ports.ts";

const SHORT_TTL_MS = 2_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface RouteHandoff {
  inFlight: Promise<MeResult> | null;
  handed: CacheEntry<MeResult> | null;
}

interface TokenBucket<T> {
  inFlight: Map<string, Promise<T>>;
  cached: Map<string, CacheEntry<T>>;
}

const routeMeByApi = new WeakMap<Api, Map<string, RouteHandoff>>();
const tokenClearers = new Set<(key: string) => void>();
const metaByServices = new WeakMap<
  PersonServices,
  { storage: Storage | null; client: Promise<SyncClient> }
>();

const tokenKey = (token: string | null): string => token ?? "";

function handoffOf(api: Api, token: string | null): RouteHandoff {
  let byToken = routeMeByApi.get(api);
  if (byToken === undefined) {
    byToken = new Map();
    routeMeByApi.set(api, byToken);
  }
  const key = tokenKey(token);
  let slot = byToken.get(key);
  if (slot === undefined) {
    slot = { inFlight: null, handed: null };
    byToken.set(key, slot);
  }
  return slot;
}

const isSeedingMe = (result: MeResult): boolean =>
  result.ok && result.me.workspaces.some((w) => w.seeding?.failed === false);

/**
 * Calls `api.me()` from a route `beforeLoad` guard and hands off the settled answer once to the screen that mounts
 * right after, preventing duplicate back-to-back `GET /api/me` requests without leaking across later mounts.
 */
export function routeConfirmMe(
  api: Api,
  token: string | null,
): Promise<MeResult> {
  const slot = handoffOf(api, token);
  if (slot.inFlight !== null) return slot.inFlight;
  const pending = api.me().then(
    (result) => {
      if (slot.inFlight === pending) slot.inFlight = null;
      if (result.ok && !isSeedingMe(result)) {
        slot.handed = { value: result, expiresAt: Date.now() + SHORT_TTL_MS };
      }
      return result;
    },
    (error: unknown) => {
      if (slot.inFlight === pending) slot.inFlight = null;
      throw error;
    },
  );
  slot.inFlight = pending;
  return pending;
}

/**
 * Wraps `api` for one `PersonServices` instance: concurrent and short-TTL calls to `me()` and `role(docId)` coalesce
 * into one request, consuming any in-flight or just-finished route `beforeLoad` `me()` handoff once.
 */
export function createCachedApi(
  api: Api,
  options: { token: string | null },
): Api {
  const { token } = options;
  let meInFlight: Promise<MeResult> | null = null;
  let meCached: CacheEntry<MeResult> | null = null;
  const roleInFlight = new Map<string, Promise<DocRole | null>>();
  const roleCached = new Map<string, CacheEntry<DocRole>>();

  return {
    ...api,
    me() {
      const now = Date.now();
      if (meCached !== null && meCached.expiresAt > now)
        return Promise.resolve(meCached.value);
      if (meInFlight !== null) return meInFlight;
      const slot = routeMeByApi.get(api)?.get(tokenKey(token));
      if (slot?.handed !== null && slot?.handed !== undefined) {
        const { value, expiresAt } = slot.handed;
        slot.handed = null;
        if (expiresAt > now) {
          meCached = { value, expiresAt };
          return Promise.resolve(value);
        }
      }
      if (slot?.inFlight !== null && slot?.inFlight !== undefined) {
        const joined = slot.inFlight
          .then((result) => {
            if (slot.handed?.value === result) slot.handed = null;
            if (result.ok && !isSeedingMe(result))
              meCached = {
                value: result,
                expiresAt: Date.now() + SHORT_TTL_MS,
              };
            return result;
          })
          .finally(() => {
            if (meInFlight === joined) meInFlight = null;
          });
        meInFlight = joined;
        return joined;
      }
      const pending = api.me().then(
        (result) => {
          if (meInFlight === pending) meInFlight = null;
          if (result.ok && !isSeedingMe(result))
            meCached = { value: result, expiresAt: Date.now() + SHORT_TTL_MS };
          return result;
        },
        (error: unknown) => {
          if (meInFlight === pending) meInFlight = null;
          throw error;
        },
      );
      meInFlight = pending;
      return pending;
    },
    role(docId) {
      const now = Date.now();
      const cached = roleCached.get(docId);
      if (cached !== undefined && cached.expiresAt > now)
        return Promise.resolve(cached.value);
      const existing = roleInFlight.get(docId);
      if (existing !== undefined) return existing;
      const pending = api.role(docId).then(
        (role) => {
          if (roleInFlight.get(docId) === pending) roleInFlight.delete(docId);
          if (role !== null)
            roleCached.set(docId, {
              value: role,
              expiresAt: Date.now() + SHORT_TTL_MS,
            });
          return role;
        },
        (error: unknown) => {
          if (roleInFlight.get(docId) === pending) roleInFlight.delete(docId);
          throw error;
        },
      );
      roleInFlight.set(docId, pending);
      return pending;
    },
  };
}

export type DocRequestDeduper<T> = (
  key: string,
  token: string | null,
  run: () => Promise<T>,
  shouldCache: (value: T) => boolean,
) => Promise<T>;

/** Creates a typed token-scoped request deduper cleared automatically on `invalidateApiCache`. */
export function createDocRequestDeduper<T>(): DocRequestDeduper<T> {
  const byToken = new Map<string, TokenBucket<T>>();
  tokenClearers.add((key) => {
    byToken.delete(key);
  });
  return (key, token, run, shouldCache) => {
    const tKey = tokenKey(token);
    let bucket = byToken.get(tKey);
    if (bucket === undefined) {
      bucket = { inFlight: new Map(), cached: new Map() };
      byToken.set(tKey, bucket);
    }
    const now = Date.now();
    const cached = bucket.cached.get(key);
    if (cached !== undefined && cached.expiresAt > now)
      return Promise.resolve(cached.value);
    const existing = bucket.inFlight.get(key);
    if (existing !== undefined) return existing;
    const pending = run().then(
      (value) => {
        if (bucket.inFlight.get(key) === pending) bucket.inFlight.delete(key);
        if (shouldCache(value))
          bucket.cached.set(key, {
            value,
            expiresAt: Date.now() + SHORT_TTL_MS,
          });
        return value;
      },
      (error: unknown) => {
        if (bucket.inFlight.get(key) === pending) bucket.inFlight.delete(key);
        throw error;
      },
    );
    bucket.inFlight.set(key, pending);
    return pending;
  };
}

/** Clears cached API entries for a token (on sign-out or person switch). */
export function invalidateApiCache(options: {
  api?: Api;
  token?: string | null;
}): void {
  const { api, token } = options;
  if (api !== undefined && token !== undefined) {
    routeMeByApi.get(api)?.delete(tokenKey(token));
  }
  if (token !== undefined) {
    const key = tokenKey(token);
    for (const clear of tokenClearers) clear(key);
  }
}

/** Associates `services` with its storage and sync client for lightweight reads without widening `PersonServices`. */
export function registerServicesMeta(
  services: PersonServices,
  meta: { storage: Storage | null; client: Promise<SyncClient> },
): void {
  metaByServices.set(services, meta);
}

export function storageOfServices(services: PersonServices): Storage | null {
  return metaByServices.get(services)?.storage ?? null;
}

/** Reads lightweight document summaries from the underlying sync client when available; null for synthetic mocks. */
export async function summariesOfServices(
  services: PersonServices,
): Promise<readonly DocSummary[] | null> {
  const clientPromise = metaByServices.get(services)?.client;
  if (clientPromise === undefined) return null;
  try {
    return await (await clientPromise).documents();
  } catch {
    return null;
  }
}
