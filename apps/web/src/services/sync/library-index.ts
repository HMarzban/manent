// The Library read from index documents: each workspace's index of projects and documents, and the person's Continue.
import { ORIGIN_LOAD, ORIGIN_REMOTE } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { projectHome } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { LIBRARY_WORDS } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type {
  CreateResult,
  DocumentStart,
  LibraryIndex,
  ProjectKind,
} from "../ports.ts";
import type { PersonSync } from "./create-sync.ts";
import {
  PROJECT_KIND_FORMATS,
  projectStartOf,
  startImported,
} from "./create-script.ts";
import { createDocumentValues } from "./document-values.ts";
import { readWorkspace } from "./index-entries.ts";
import type { WorkspaceEntries } from "./index-entries.ts";
import { createShelves } from "./index-shelves.ts";
import type { Found, Shelves } from "./index-shelves.ts";
import { liveMap } from "./private-index.ts";
import type { PrivateIndex } from "./private-index.ts";
import { createSeedingLists, seedingShelf } from "./seeding-lists.ts";

/** A project just made on this device, and its first document. */
export interface NewProject {
  readonly sync: PersonSync;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly kind: ProjectKind;
  readonly docId: string;
}

/** What is made with every new project, and removed with one made here and left untouched. */
export interface ProjectCreated {
  readonly id: string;
  /** Makes it on the device, before the project is listed in its index. */
  made(project: NewProject): Promise<void>;
  /** Removes it in the step that removes the project, so that it never reaches the server. */
  removed(project: NewProject): void;
}

/** Each is made in list order. */
export const PROJECT_CREATED: readonly ProjectCreated[] = [];

/** At most one `editedAt` write per person and document this often. */
const LAST_EDITED_EVERY_MS = 600_000;

/** The Library, and what it does while a document is open in this tab. */
export interface SyncLibrary extends LibraryIndex {
  /** Writes Continue for a document opened here once an index holds it; the returned function stops waiting for one. */
  markOpened(docId: string): () => void;
  /**
   * Writes `editedAt` on the person's own changes; the returned function stops, and removes the project if it was made
   * here, left untouched and neither it nor the document is a favourite.
   */
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

/** The index's projects and documents, read. */
const entriesOf = (index: DocHandle): WorkspaceEntries =>
  readWorkspace({
    projects: liveMap(index, "projects"),
    documents: liveMap(index, "documents"),
  });

/** The first of the kind's names, "Untitled film", "Untitled film 2" and on, that no project in `index` has. */
function freeName(index: DocHandle, kind: ProjectKind): string {
  const taken = new Set(
    [...entriesOf(index).projects.values()].map((p) => p.title),
  );
  for (let n = 1; ; n += 1) {
    const name = LIBRARY_WORDS.untitledProject(kind, n);
    if (!taken.has(name)) return name;
  }
}

/**
 * Lists a new document of `opening.docKind` in the index of `workspaceId`, made on the device first and begun by
 * `opening.start`: in the project `projectId`, or in a new project of `kind` listed with it and made with what
 * PROJECT_CREATED makes when `projectId` is null.
 */
async function addProject(
  options: {
    sync: PersonSync;
    shelves: Shelves;
    userId: string;
    language: string;
    now: () => number;
    newId: () => string;
  },
  target: { workspaceId: string; projectId: string | null; kind: ProjectKind },
  titles: (index: DocHandle) => { project: string; script: string },
  opening: DocumentStart,
): Promise<CreateResult> {
  const { sync, shelves } = options;
  const { workspaceId, kind } = target;
  const index = await shelves.shelf(workspaceId).handle;
  const projectId = target.projectId ?? options.newId();
  const handle = await sync.client.create({
    kind: opening.docKind,
    home: projectHome(projectId),
    workspaceId,
  });
  opening.start(handle);
  const isNew = target.projectId === null;
  if (isNew)
    for (const created of PROJECT_CREATED)
      await created.made({
        sync,
        workspaceId,
        projectId,
        kind,
        docId: handle.docId,
      });
  const { project, script } = titles(index);
  const at = options.now();
  if (isNew)
    liveMap(index, "projects").set(projectId, {
      title: project,
      kind,
      createdAt: at,
      createdByUserId: options.userId,
    });
  liveMap(index, "documents").set(handle.docId, {
    projectId,
    title: script,
    kind: opening.docKind,
    createdAt: at,
    editedAt: null,
    editedByUserId: null,
    airDate: opening.airDate,
    rundownId: opening.rundownId,
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
  // the projects made here, by their first document, that no one has changed yet: one left so is removed, never trashed
  const untouched = new Map<
    string,
    {
      projectId: string;
      kind: ProjectKind;
      title: string;
      isUntouched(handle: DocHandle): boolean;
    }
  >();
  const leave = (docId: string, handle: DocHandle) => {
    const made = untouched.get(docId);
    untouched.delete(docId);
    const found = shelves.find(docId);
    if (made === undefined || found === null || !made.isUntouched(handle))
      return;
    const favourites = liveMap(options.privateIndex.handle, "favourites");
    if ([made.projectId, docId].some((key) => favourites.get(key) !== null))
      return;
    const renamed =
      found.entry.title !== LIBRARY_WORDS.untitledScript ||
      entriesOf(found.handle).projects.get(made.projectId)?.title !==
        made.title;
    if (renamed) return;
    // undone in the index that listed it, so made and removed offline, it never shows in the server's index
    liveMap(found.handle, "projects").delete(made.projectId);
    liveMap(found.handle, "documents").delete(docId);
    options.privateIndex.continueMap.delete(docId);
    const { projectId, kind } = made;
    const { workspaceId } = found;
    for (const created of PROJECT_CREATED)
      created.removed({
        sync: options.sync,
        workspaceId,
        projectId,
        kind,
        docId,
      });
  };
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
    async createProject(ws, kind) {
      let title = "";
      const start = projectStartOf(kind);
      const made = await addProject(
        { ...options, shelves },
        { workspaceId: ws, projectId: null, kind },
        (index) => {
          title = freeName(index, kind);
          return { project: title, script: LIBRARY_WORDS.untitledScript };
        },
        {
          docKind: start.docKind,
          airDate: null,
          rundownId: null,
          start: (handle) => start.start(handle, kind, options.language),
        },
      );
      untouched.set(made.docId, {
        projectId: made.projectId,
        kind,
        title,
        isUntouched: start.isUntouched,
      });
      return made;
    },
    importProject: (ws, imported) =>
      addProject(
        { ...options, shelves },
        { workspaceId: ws, projectId: null, kind: "film" },
        () => ({ project: imported.title, script: imported.title }),
        {
          docKind: "script",
          airDate: null,
          rundownId: null,
          start: (handle) =>
            startImported(
              handle,
              imported,
              options.language,
              PROJECT_KIND_FORMATS.film,
            ),
        },
      ),
    documentTitle: values.title,
    documentKind: values.kind,
    docKindOf: values.docKind,
    renameDocument(docId, title) {
      const found = shelves.find(docId);
      if (found === null) return;
      liveMap(found.handle, "documents").set(docId, { ...found.entry, title });
    },
    addCopy: (ws, projectId, kind, title, start) =>
      addProject(
        { ...options, shelves },
        { workspaceId: ws, projectId, kind },
        () => ({ project: title, script: title }),
        start,
      ),
    markOpened: values.continueOnce,
    follow(docId, handle) {
      const stop = onOwnChange(handle, () => {
        untouched.delete(docId);
        const found = shelves.find(docId);
        if (found !== null) markEdited(found, docId, userId, now());
      });
      return () => {
        stop();
        leave(docId, handle);
      };
    },
  };
}
