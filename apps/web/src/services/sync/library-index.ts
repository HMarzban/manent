// The Library read from index documents: each workspace's index of projects and documents, and the person's Continue.
import { ORIGIN_LOAD, ORIGIN_REMOTE } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import type { WorkspaceRef } from "@manent/sync-protocol";
import type { Subscribable } from "@manent/ui";
import type { LibraryIndex } from "../ports.ts";
import { createDocumentValues } from "./document-values.ts";
import type { DocumentValues } from "./document-values.ts";
import { createShelves } from "./index-shelves.ts";
import type { Found, Shelves } from "./index-shelves.ts";
import {
  PROJECT_CREATED,
  projectMaking,
  removeUntouched,
} from "./library-create.ts";
import type {
  LibraryOptions,
  NewProject,
  ProjectCreated,
  UntouchedProject,
} from "./library-create.ts";
import { liveMap } from "./private-index.ts";
import { createSeedingLists, seedingShelf } from "./seeding-lists.ts";

export { PROJECT_CREATED };
export type { NewProject, ProjectCreated };

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
 * Each workspace's shelf, with each document's values drawn from them. A workspace still being seeded is no index's
 * yet: none of its homes may be opened until it is ready.
 */
function libraryShelves(options: LibraryOptions): {
  shelves: Shelves;
  values: DocumentValues;
  lists: Pick<LibraryIndex, "continueList" | "projects" | "loadState">;
} {
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
  return { shelves, values, lists };
}

/**
 * Each workspace's index opens, from the device first, when its lists are first asked for, and stays open while the
 * services live. Rows say where each document is from what the device's store holds.
 */
export function createSyncLibrary(options: LibraryOptions): SyncLibrary {
  const { userId, now } = options;
  const { shelves, values, lists } = libraryShelves(options);
  // by each project's first document
  const untouched = new Map<string, UntouchedProject>();
  return {
    continueList: lists.continueList,
    projects: lists.projects,
    async readProjects(ws) {
      const { ready, projects } = shelves.shelf(ws);
      await ready;
      return projects.get();
    },
    loadState: lists.loadState,
    ...projectMaking({ ...options, shelves }, untouched),
    documentTitle: values.title,
    documentKind: values.kind,
    docKindOf: values.docKind,
    documentProject: values.project,
    renameDocument(docId, title) {
      const found = shelves.find(docId);
      if (found === null) return;
      liveMap(found.handle, "documents").set(docId, { ...found.entry, title });
    },
    markOpened: values.continueOnce,
    follow(docId, handle) {
      const stop = onOwnChange(handle, () => {
        untouched.delete(docId);
        const found = shelves.find(docId);
        if (found !== null) markEdited(found, docId, userId, now());
      });
      return () => {
        stop();
        const made = untouched.get(docId);
        untouched.delete(docId);
        if (made !== undefined)
          removeUntouched({ ...options, shelves }, docId, made, handle);
      };
    },
  };
}
