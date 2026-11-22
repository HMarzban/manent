// The Library read from index documents: each workspace's index of projects and documents, and the person's Continue.
import { ORIGIN_LOAD, ORIGIN_REMOTE } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { projectHome } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { LIBRARY_WORDS, createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type {
  ContinueItem,
  CreateResult,
  LibraryIndex,
  ProjectItem,
  ProjectKind,
} from "../ports.ts";
import { cached } from "./cached.ts";
import type { PersonSync } from "./create-sync.ts";
import { startImported, startScript } from "./create-script.ts";
import { createShelves } from "./index-shelves.ts";
import type { Found, Shelf, Shelves } from "./index-shelves.ts";
import { liveMap } from "./private-index.ts";
import type { PrivateIndex } from "./private-index.ts";

/** At most one `editedAt` write per person and document this often. */
const LAST_EDITED_EVERY_MS = 600_000;

type Value<T> = Subscribable<T> & { set(value: T): void };

/** The Library, and what it does while a document is open in this tab. */
export interface SyncLibrary extends LibraryIndex {
  /** Writes Continue for a document opened here once an index holds it; the returned function stops waiting for one. */
  markOpened(docId: string): () => void;
  /** Writes `editedAt` on the person's own changes; the returned function stops. */
  follow(docId: string, handle: DocHandle): () => void;
}

const isOwn = (origin: unknown): boolean =>
  origin !== ORIGIN_REMOTE && origin !== ORIGIN_LOAD;

/** Each change the person makes in whichever document `handle` holds, a document replaced under it included. */
export function onOwnChange(
  handle: DocHandle,
  listener: () => void,
): () => void {
  const watch = (doc: CrdtDoc) =>
    doc.subscribe((_, origin) => {
      if (isOwn(origin)) listener();
    });
  let stop = watch(handle.doc());
  const stopReplaced = handle.on((event) => {
    if (event.type !== "replaced") return;
    stop();
    stop = watch(handle.doc());
  });
  return () => {
    stop();
    stopReplaced();
  };
}

/** Lists a new project of `kind` in the index of `workspaceId`, with its one script, made on the device first and begun by `start`. */
async function addProject(
  options: {
    sync: PersonSync;
    shelves: Shelves;
    userId: string;
    language: string;
    now: () => number;
    newId: () => string;
  },
  workspaceId: string,
  kind: ProjectKind,
  titles: { project: string; script: string },
  start: (handle: DocHandle) => void,
): Promise<CreateResult> {
  const { sync, shelves } = options;
  const index = await shelves.shelf(workspaceId).handle;
  const projectId = options.newId();
  const handle = await sync.client.create({
    kind: "script",
    home: projectHome(projectId),
    workspaceId,
  });
  start(handle);
  const at = options.now();
  liveMap(index, "projects").set(projectId, {
    title: titles.project,
    kind,
    createdAt: at,
    createdByUserId: options.userId,
  });
  liveMap(index, "documents").set(handle.docId, {
    projectId,
    title: titles.script,
    kind: "script",
    createdAt: at,
    editedAt: null,
    editedByUserId: null,
  });
  await handle.close();
  // the new row says where its script is before it is returned
  await shelves.refresh();
  return { projectId, docId: handle.docId };
}

/** Writes that `userId` edited the document at `at`, unless they did less than LAST_EDITED_EVERY_MS before. */
function markEdited(
  found: Found,
  docId: string,
  userId: string,
  at: number,
): void {
  const { editedAt, editedByUserId } = found.entry;
  const recent =
    editedByUserId === userId &&
    editedAt !== null &&
    at - editedAt < LAST_EDITED_EVERY_MS;
  if (recent) return;
  liveMap(found.handle, "documents").set(docId, {
    ...found.entry,
    editedAt: at,
    editedByUserId: userId,
  });
}

interface DocumentValues {
  title(docId: string): Value<string | null>;
  kind(docId: string): Value<ProjectKind | null>;
  /** Writes Continue for `docId` once an index holds it; the returned function stops waiting. */
  continueOnce(docId: string): () => void;
  /** True once any document has been asked about. */
  asked(): boolean;
  /** Sets each value from the indexes, and writes the Continue entries an index now holds. */
  draw(): void;
}

/** Each document's title and kind, and its Continue entry, from whichever opened index holds it; `wanted` opens them. */
function createDocumentValues(options: {
  find: (docId: string) => Found | null;
  privateIndex: PrivateIndex;
  now: () => number;
  wanted: () => void;
}): DocumentValues {
  const { find } = options;
  const titles = new Map<string, Value<string | null>>();
  const kinds = new Map<string, Value<ProjectKind | null>>();
  // the documents opened here whose Continue entry waits for an index that holds them
  const continuing = new Set<string>();
  const valueOf = <T>(
    values: Map<string, Value<T | null>>,
    docId: string,
  ): Value<T | null> => {
    const known = values.has(docId);
    const value = cached(values, docId, () => createValue<T | null>(null));
    if (!known) options.wanted();
    return value;
  };
  return {
    title: (docId) => valueOf(titles, docId),
    kind: (docId) => valueOf(kinds, docId),
    continueOnce(docId) {
      continuing.add(docId);
      options.wanted();
      return () => {
        continuing.delete(docId);
      };
    },
    asked: () => titles.size + kinds.size + continuing.size > 0,
    draw() {
      for (const docId of continuing) {
        const workspaceId = find(docId)?.workspaceId;
        if (workspaceId === undefined) continue;
        continuing.delete(docId);
        const openedAt = options.now();
        options.privateIndex.continueMap.set(docId, { workspaceId, openedAt });
      }
      for (const [docId, title] of titles)
        title.set(find(docId)?.entry.title ?? null);
      for (const [docId, kind] of kinds) kind.set(find(docId)?.kind ?? null);
    },
  };
}

/** The shelf of a workspace still being seeded: opening no index, and refusing a new project. */
function seedingShelf(): Shelf {
  const handle = Promise.reject<DocHandle>(
    new Error("The workspace is still being seeded."),
  );
  // only a new project asks for the index, and it is told the refusal
  handle.catch(() => {});
  return {
    projects: createValue<readonly ProjectItem[]>([]),
    continueList: createValue<readonly ContinueItem[]>([]),
    loadState: createValue<"cached" | "problem">("cached"),
    handle,
    ready: Promise.resolve(),
    opened: null,
  };
}

interface SeedingWatch {
  workspaces: Subscribable<readonly WorkspaceRef[]>;
  isSeeding: (ws: string) => boolean;
}

/**
 * `seeded` while workspace `ws` is being seeded; once it is not, `pick`'s list, which it switches to once. `pick` is
 * called only then, since asking for a shelf opens its index.
 */
function followSeeding<T>(
  watch: SeedingWatch,
  ws: string,
  seeded: T,
  pick: () => Subscribable<T>,
): Subscribable<T> {
  let adopted: Subscribable<T> | null = null;
  const source = (): Subscribable<T> | null => {
    if (adopted === null && !watch.isSeeding(ws)) adopted = pick();
    return adopted;
  };
  // a workspace that is ready opens its index when its list is asked for, as its shelf does
  source();
  return {
    get: () => source()?.get() ?? seeded,
    subscribe(listener) {
      let stopList = source()?.subscribe(listener) ?? null;
      const stopWorkspaces = watch.workspaces.subscribe(() => {
        const list = source();
        if (list === null || stopList !== null) return;
        stopList = list.subscribe(listener);
        listener(list.get());
      });
      return () => {
        stopWorkspaces();
        stopList?.();
      };
    },
  };
}

/** Each workspace's lists, one value per list that a caller may keep, never a fixed one while it is being seeded. */
function createSeedingLists(
  watch: SeedingWatch,
  shelf: (ws: string) => Shelf,
): Pick<LibraryIndex, "continueList" | "projects" | "loadState"> {
  const continued = new Map<string, Subscribable<readonly ContinueItem[]>>();
  const projects = new Map<string, Subscribable<readonly ProjectItem[]>>();
  const states = new Map<string, Subscribable<"cached" | "problem">>();
  return {
    continueList: (ws) =>
      cached(continued, ws, () =>
        followSeeding(watch, ws, [], () => shelf(ws).continueList),
      ),
    projects: (ws) =>
      cached(projects, ws, () =>
        followSeeding(watch, ws, [], () => shelf(ws).projects),
      ),
    loadState: (ws) =>
      cached(states, ws, () =>
        followSeeding(watch, ws, "cached", () => shelf(ws).loadState),
      ),
  };
}

/**
 * Each workspace's index opens, from the device first, when its lists are first asked for, and stays open while the
 * services live. Rows say where each document is from what the device's store holds.
 */
export function createSyncLibrary(options: {
  sync: PersonSync;
  privateIndex: PrivateIndex;
  userId: string;
  workspaces: Subscribable<readonly WorkspaceRef[]>;
  localWorkspaceId: string | null;
  language: string;
  now: () => number;
  newId: () => string;
}): SyncLibrary {
  const { userId, now } = options;
  // a workspace still being seeded is no index's yet: none of its homes may be opened until it is ready
  const seeded: Subscribable<readonly WorkspaceRef[]> = {
    get: () => options.workspaces.get().filter((ref) => ref.seeding === null),
    subscribe: (listener) =>
      options.workspaces.subscribe(() => listener(seeded.get())),
  };
  const values = createDocumentValues({
    ...options,
    find: (docId) => shelves.find(docId),
    wanted() {
      shelves.openKnown();
      shelves.show();
    },
  });
  const opening = createShelves({
    ...options,
    workspaces: seeded,
    drawn: values.draw,
  });
  const seeding = seedingShelf();
  const isSeeding = (ws: string): boolean =>
    options.workspaces
      .get()
      .some((ref) => ref.id === ws && ref.seeding !== null);
  const shelves: Shelves = {
    ...opening,
    shelf: (ws) => (isSeeding(ws) ? seeding : opening.shelf(ws)),
  };
  options.workspaces.subscribe(() => {
    if (values.asked()) shelves.openKnown();
  });
  const lists = createSeedingLists(
    { workspaces: options.workspaces, isSeeding },
    opening.shelf,
  );
  return {
    continueList: lists.continueList,
    projects: lists.projects,
    async readProjects(ws) {
      const { ready, projects } = shelves.shelf(ws);
      await ready;
      return projects.get();
    },
    loadState: lists.loadState,
    createProject: (ws, kind) =>
      addProject(
        { ...options, shelves },
        ws,
        kind,
        {
          project: LIBRARY_WORDS.untitledProject(kind),
          script: LIBRARY_WORDS.untitledScript,
        },
        (handle) => startScript(handle, options.language),
      ),
    importProject: (ws, imported) =>
      addProject(
        { ...options, shelves },
        ws,
        "film",
        { project: imported.title, script: imported.title },
        (handle) => startImported(handle, imported, options.language),
      ),
    documentTitle: values.title,
    documentKind: values.kind,
    renameDocument(docId, title) {
      const found = shelves.find(docId);
      if (found === null) return;
      liveMap(found.handle, "documents").set(docId, { ...found.entry, title });
    },
    markOpened: values.continueOnce,
    follow: (docId, handle) =>
      onOwnChange(handle, () => {
        const found = shelves.find(docId);
        if (found !== null) markEdited(found, docId, userId, now());
      }),
  };
}
