// What the services read of the person's indexes before those have opened from the device: held writes, empty lists and
// nothing to review.
import type { CrdtDoc } from "@manent/crdt";
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
import type { Listed } from "./review-entries.ts";
import type { ReviewStore } from "./review.ts";

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

/** To review as the services hold it, with the open script each action writes. */
export interface PersonReview extends ReviewStore {
  /** The script followed here; null while it is not open in this tab. */
  docOf(docId: string): CrdtDoc | null;
}

/** To review once `store` has opened, with nothing to review until then; every script it follows is kept for `docOf`. */
export function createLaterReview(options: {
  /** Null: the sync could not start. */
  store: Promise<ReviewStore | null>;
}): PersonReview {
  let opened: ReviewStore | null = null;
  const { store } = options;
  void store.then((s) => {
    opened = s;
  });
  const docs = new Map<string, CrdtDoc>();
  const later = <T>(
    initial: T,
    read: (s: ReviewStore) => Subscribable<T>,
  ): Subscribable<T> =>
    opened !== null
      ? read(opened)
      : laterValue(
          initial,
          store.then((s) => (s === null ? null : read(s))),
        );
  const act = (run: (s: ReviewStore) => void): void => {
    if (opened !== null) run(opened);
  };
  const values = {
    counts: new Map<string, Subscribable<number>>(),
    entries: new Map<string, Subscribable<readonly Listed[]>>(),
    targets: new Map<string, Subscribable<string | null>>(),
  };
  return {
    openCount: (docId) =>
      cached(values.counts, docId, () => later(0, (s) => s.openCount(docId))),
    entries: (docId) =>
      cached(values.entries, docId, () => later([], (s) => s.entries(docId))),
    follow(docId, doc) {
      docs.set(docId, doc);
      let stop: (() => void) | null = null;
      let stopped = false;
      void store.then((s) => {
        if (!stopped && s !== null) stop = s.follow(docId, doc);
      });
      return () => {
        stopped = true;
        stop?.();
        if (docs.get(docId) === doc) docs.delete(docId);
      };
    },
    keepAsMerged: (id) => act((s) => s.keepAsMerged(id)),
    useMine: (id, doc) => act((s) => s.useMine(id, doc)),
    useTheirs: (id, doc) => act((s) => s.useTheirs(id, doc)),
    reopenKept: () => opened?.reopenKept() ?? false,
    focus: (docId, blockId) => act((s) => s.focus(docId, blockId)),
    focusTarget: (docId) =>
      cached(values.targets, docId, () =>
        later(null, (s) => s.focusTarget(docId)),
      ),
    docOf: (docId) => docs.get(docId) ?? null,
    dispose() {
      void store.then((s) => s?.dispose());
    },
  };
}
