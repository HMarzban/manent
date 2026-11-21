// What the services read of the person's indexes before those have opened from the device: held writes and empty lists.
import type { KeyValueMap } from "@manent/settings";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type {
  ContinueItem,
  CreateResult,
  ProjectItem,
  ProjectKind,
} from "../ports.ts";
import type { SyncLibrary } from "./library-index.ts";

type Listener = Parameters<KeyValueMap["subscribe"]>[0];

/** A map that holds what is written until the index's own map arrives, then writes it there and reads only that. */
export function createLaterMap(): KeyValueMap & {
  attach(map: KeyValueMap): void;
} {
  let target: KeyValueMap | null = null;
  const held = new Map<string, unknown>();
  const listeners = new Set<Listener>();
  const tell: Listener = (keys, origin) => {
    for (const listener of listeners) listener(keys, origin);
  };
  return {
    get: (key) => (target === null ? (held.get(key) ?? null) : target.get(key)),
    set(key, value) {
      if (target !== null) return target.set(key, value);
      held.set(key, value);
      tell([key], "local");
    },
    keys: () => target?.keys() ?? [...held.keys()].toSorted(),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attach(map) {
      target = map;
      map.subscribe(tell);
      for (const [key, value] of held) map.set(key, value);
      held.clear();
      tell(map.keys(), "remote");
    },
  };
}

/** One value per key, made once. */
function cached<T>(
  values: Map<string, Subscribable<T>>,
  key: string,
  make: () => Subscribable<T>,
): Subscribable<T> {
  const known = values.get(key);
  if (known !== undefined) return known;
  const made = make();
  values.set(key, made);
  return made;
}

/** `initial` until `source` arrives, then the source's value. */
function laterValue<T>(
  initial: T,
  source: Promise<Subscribable<T> | null>,
): Subscribable<T> {
  const value = createValue(initial);
  void source.then((s) => {
    if (s === null) return;
    value.set(s.get());
    s.subscribe(() => value.set(s.get()));
  });
  return value;
}

/**
 * The Library once `library` has opened, with empty lists until then. A sync that cannot start, or a device that cannot
 * hold a new script, still gives `createProject` a script to open, whose status says it is not saved.
 */
export function createLaterLibrary(options: {
  /** Null: the sync could not start. */
  library: Promise<SyncLibrary | null>;
  newId: () => string;
}): SyncLibrary {
  const { library } = options;
  // once it has opened, a write reaches it in the same task
  let opened: SyncLibrary | null = null;
  void library.then((l) => {
    opened = l;
  });
  /** The library's own value once it has opened; until then `initial`, then the library's. */
  const later = <T>(
    initial: T,
    read: (l: SyncLibrary) => Subscribable<T>,
  ): Subscribable<T> =>
    opened !== null
      ? read(opened)
      : laterValue(
          initial,
          library.then((l) => (l === null ? null : read(l))),
        );
  const fresh = (): CreateResult => ({
    projectId: options.newId(),
    docId: options.newId(),
  });
  const lists = {
    continueList: new Map<string, Subscribable<readonly ContinueItem[]>>(),
    projects: new Map<string, Subscribable<readonly ProjectItem[]>>(),
    loadState: new Map<string, Subscribable<"cached" | "problem">>(),
    titles: new Map<string, Subscribable<string | null>>(),
    kinds: new Map<string, Subscribable<ProjectKind | null>>(),
  };
  return {
    continueList: (ws) =>
      cached(lists.continueList, ws, () =>
        later([], (l) => l.continueList(ws)),
      ),
    projects: (ws) =>
      cached(lists.projects, ws, () => later([], (l) => l.projects(ws))),
    readProjects: async (ws) => {
      const l = await library;
      return l === null ? [] : l.readProjects(ws);
    },
    loadState: (ws) =>
      cached(lists.loadState, ws, () =>
        later("cached", (l) => l.loadState(ws)),
      ),
    async createProject(ws, kind): Promise<CreateResult> {
      const l = await library;
      return l === null ? fresh() : l.createProject(ws, kind).catch(fresh);
    },
    documentTitle: (docId) =>
      cached(lists.titles, docId, () =>
        later(null, (l) => l.documentTitle(docId)),
      ),
    documentKind: (docId) =>
      cached(lists.kinds, docId, () =>
        later(null, (l) => l.documentKind(docId)),
      ),
    renameDocument(docId, title) {
      if (opened !== null) opened.renameDocument(docId, title);
      else void library.then((l) => l?.renameDocument(docId, title));
    },
    follow(docId, handle) {
      let stop: (() => void) | null = null;
      let stopped = false;
      void library.then((l) => {
        if (!stopped && l !== null) stop = l.follow(docId, handle);
      });
      return () => {
        stopped = true;
        stop?.();
      };
    },
  };
}
