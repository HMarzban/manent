// The names of the project a document is in, as its page and the name commands read and write them.
import type { JsonMapView } from "@manent/crdt";
import type { ProjectNameKind } from "@manent/revisions";
import { indexDocId } from "@manent/sync-protocol";
import type { PersonServices } from "../services/ports.ts";
import {
  readContinueMap,
  readWorkspace,
} from "../services/sync/index-entries.ts";
import { liveMap } from "../services/sync/private-index.ts";
import { readNames } from "./names-entries.ts";

/**
 * What `read` finds in `map`; with a `signal`, once it finds something after a change, or null once the signal
 * aborts; without one, null at once when it finds nothing.
 */
function found<T>(
  map: JsonMapView,
  read: () => T | null,
  signal: AbortSignal | null,
): Promise<T | null> {
  const now = read();
  if (now !== null || signal === null || signal.aborted)
    return Promise.resolve(now);
  return new Promise((settle) => {
    const done = (value: T | null): void => {
      stop();
      signal.removeEventListener("abort", aborted);
      settle(value);
    };
    const aborted = (): void => done(null);
    const stop = map.subscribe(() => {
      const value = read();
      if (value !== null) done(value);
    });
    signal.addEventListener("abort", aborted);
  });
}

/**
 * The project that holds `docId`: the person's Continue names its workspace once the document has opened, and that
 * workspace's index names its project. With a `signal`, it waits for both until the signal aborts; null when either
 * is missing then, or when the person's sync could not start.
 */
async function findProject(
  services: PersonServices,
  docId: string,
  signal: AbortSignal | null,
): Promise<string | null> {
  const own = await services.openHandle(indexDocId("user", services.userId));
  try {
    const continued = liveMap(own, "continue");
    const workspaceId = await found(
      continued,
      () => readContinueMap(continued).get(docId)?.workspaceId ?? null,
      signal,
    );
    if (workspaceId === null) return null;
    const index = await services.openHandle(
      indexDocId("workspace", workspaceId),
    );
    try {
      const maps = {
        projects: liveMap(index, "projects"),
        documents: liveMap(index, "documents"),
      };
      return await found(
        maps.documents,
        () => readWorkspace(maps).documents.get(docId)?.projectId ?? null,
        signal,
      );
    } finally {
      await index.close();
    }
  } finally {
    await own.close();
  }
}

/** The names of one document's project, its index opened while someone listens and for each write. */
export interface DocumentNames {
  /** The listed spellings, in key order; empty until the index has been read. */
  spellings(): readonly string[];
  /** Calls back when the spellings change; returns unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Adds `name` as `kind` under a new id; false, writing nothing, when the document's project is not known. */
  add(name: string, kind: ProjectNameKind): Promise<boolean>;
}

const NONE: readonly string[] = Object.freeze([]);

/** Reads the project's names into `read` until `signal` aborts, then closes its index. */
async function follow(
  services: PersonServices,
  docId: string,
  signal: AbortSignal,
  read: (names: JsonMapView) => void,
): Promise<void> {
  const projectId = await findProject(services, docId, signal);
  if (projectId === null || signal.aborted) return;
  const index = services.projectIndex(projectId);
  try {
    const names = await index.map("names");
    if (signal.aborted) return;
    const stop = names.subscribe(() => read(names));
    read(names);
    await new Promise((settle) =>
      signal.addEventListener("abort", settle, { once: true }),
    );
    stop();
  } finally {
    await index.close();
  }
}

export function documentNames(
  services: PersonServices,
  docId: string,
): DocumentNames {
  let spellings = NONE;
  return {
    spellings: () => spellings,
    subscribe(listener) {
      const controller = new AbortController();
      follow(services, docId, controller.signal, (names) => {
        spellings = readNames(names).map((entry) => entry.name);
        listener();
      }).catch(
        // the person's sync could not start: the page lists no names, as before they were read
        () => {},
      );
      return () => controller.abort();
    },
    async add(name, kind) {
      const projectId = await findProject(services, docId, null);
      if (projectId === null) return false;
      const index = services.projectIndex(projectId);
      try {
        (await index.map("names")).set(crypto.randomUUID(), { kind, name });
        return true;
      } finally {
        await index.close();
      }
    },
  };
}
