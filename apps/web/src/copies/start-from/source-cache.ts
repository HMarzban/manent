// Cached `source` entries from project indexes, so Beside and Open beside can read them without blocking render.
import { observeProjectMap, readSources } from "@manent/crdt";
import type { SourceEntry } from "@manent/crdt";
import { useSubscribable } from "@manent/ui";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useServices } from "../../services/context.tsx";
import type { PersonServices } from "../../services/ports.ts";

const cache = new Map<string, SourceEntry | null>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Records `entry` for `docId` immediately, e.g. right after Start a … from this… creates the copy. */
export function rememberSource(docId: string, entry: SourceEntry | null): void {
  cache.set(docId, entry);
  notify();
}

/** What is already cached for `docId`: `undefined` before it has been loaded, `null` when it has no source. */
export function peekSource(docId: string): SourceEntry | null | undefined {
  return cache.get(docId);
}

/** Loads the `source` entry of `docId` from its project index once, skipping if already cached or in flight. */
export async function loadSourceFor(
  services: Pick<PersonServices, "library" | "projectIndex">,
  docId: string,
): Promise<SourceEntry | null> {
  const existing = cache.get(docId);
  if (existing !== undefined) return existing;
  if (inFlight.has(docId)) return null;
  const projectId = services.library.documentProject(docId).get();
  if (projectId === null) return null;
  inFlight.add(docId);
  const index = services.projectIndex(projectId);
  try {
    const handle = await index.handle();
    const { side } = handle.status.get();
    if (side.includes("access_removed") || side.includes("deleted")) {
      rememberSource(docId, null);
      return null;
    }
    const entry = readSources(handle.doc()).get(docId) ?? null;
    rememberSource(docId, entry);
    return entry;
  } catch {
    // a project index that could not open yet leaves the cache unset so a later attempt can retry
    return null;
  } finally {
    inFlight.delete(docId);
    await index.close();
  }
}

/** Subscribes to the `source` entry recorded for `docId` in its project index; null while absent or loading. */
export function useSourceEntry(docId: string | null): SourceEntry | null {
  const services = useServices();
  const projectSource = useMemo(
    () => (docId === null ? null : services.library.documentProject(docId)),
    [services.library, docId],
  );
  const projectId = useSubscribable(
    projectSource ?? { get: () => null, subscribe: () => () => {} },
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => (docId === null ? null : (cache.get(docId) ?? null)),
    () => null,
  );
  useEffect(() => {
    if (docId === null || projectId === null) return undefined;
    let cancelled = false;
    let stopObserve: (() => void) | null = null;
    const index = services.projectIndex(projectId);
    void index
      .handle()
      .then((handle) => {
        if (cancelled) return;
        const read = (): void => {
          const { side } = handle.status.get();
          if (side.includes("access_removed") || side.includes("deleted")) {
            rememberSource(docId, null);
            return;
          }
          rememberSource(docId, readSources(handle.doc()).get(docId) ?? null);
        };
        read();
        stopObserve = observeProjectMap(handle.doc(), "source", read);
      })
      .catch(() => {
        // an index that could not open leaves the entry null without disturbing the beside frame
      });
    return () => {
      cancelled = true;
      stopObserve?.();
      void index.close();
    };
  }, [services, docId, projectId]);
  return entry;
}
