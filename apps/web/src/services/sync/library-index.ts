// The Library read from index documents: each workspace's index of projects and documents, and the person's Continue.
import { ORIGIN_LOAD, ORIGIN_REMOTE } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocHandle, DocSummary } from "@manent/sync-client";
import { indexDocId, projectHome, workspaceHome } from "@manent/sync-protocol";
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
import type { PersonSync } from "./create-sync.ts";
import { startScript } from "./create-script.ts";
import {
  continueItems,
  nameOf,
  projectItems,
  readContinueMap,
  readWorkspace,
} from "./index-entries.ts";
import type {
  DocumentEntry,
  RowFacts,
  WorkspaceEntries,
} from "./index-entries.ts";
import { liveMap } from "./private-index.ts";
import type { PrivateIndex } from "./private-index.ts";

/** At most one `editedAt` write per person and document this often. */
const LAST_EDITED_EVERY_MS = 600_000;

type Value<T> = Subscribable<T> & { set(value: T): void };

/** One workspace's lists, and its index once it has opened. */
interface Shelf {
  projects: Value<readonly ProjectItem[]>;
  continueList: Value<readonly ContinueItem[]>;
  loadState: Value<"cached" | "problem">;
  handle: Promise<DocHandle>;
  /** Settles once the index has been read. */
  ready: Promise<void>;
  /** Null until the index has opened. */
  opened: { handle: DocHandle; index: WorkspaceEntries } | null;
}

/** A document the index holds, and the workspace whose index holds it. */
interface Found {
  workspaceId: string;
  entry: DocumentEntry;
  handle: DocHandle;
  kind: ProjectKind | null;
}

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
  const { sync, privateIndex, userId, now } = options;
  const shelves = new Map<string, Shelf>();
  const titles = new Map<string, Value<string | null>>();
  const kinds = new Map<string, Value<ProjectKind | null>>();
  // the documents opened here whose Continue entry waits for an index that holds them
  const continuing = new Set<string>();
  let summaries: ReadonlyMap<string, DocSummary> = new Map();

  const find = (docId: string): Found | null => {
    for (const [workspaceId, { opened }] of shelves) {
      const entry = opened?.index.documents.get(docId);
      if (entry === undefined || opened === null) continue;
      const kind = opened.index.projects.get(entry.projectId)?.kind ?? null;
      return { workspaceId, entry, handle: opened.handle, kind };
    }
    return null;
  };
  const writeContinue = (): void => {
    for (const docId of continuing) {
      const found = find(docId);
      if (found === null) continue;
      continuing.delete(docId);
      privateIndex.continueMap.set(docId, {
        workspaceId: found.workspaceId,
        openedAt: now(),
      });
    }
  };
  const show = (): void => {
    writeContinue();
    const facts: RowFacts = {
      userId,
      summaries,
      continued: readContinueMap(privateIndex.continueMap),
      nameOf,
    };
    for (const [ws, shelf] of shelves) {
      if (shelf.opened === null) continue;
      const { index } = shelf.opened;
      shelf.projects.set(projectItems(index, facts));
      shelf.continueList.set(continueItems(ws, index, facts));
    }
    for (const [docId, title] of titles)
      title.set(find(docId)?.entry.title ?? null);
    for (const [docId, kind] of kinds) kind.set(find(docId)?.kind ?? null);
  };
  let reading: Promise<void> | null = null;
  let again = false;
  /** Reads what the store holds again, once more when asked while it reads. */
  const refresh = (): Promise<void> => {
    again = reading !== null;
    reading ??= (async () => {
      do {
        again = false;
        const listed = await sync.client.documents();
        summaries = new Map(listed.map((s) => [s.docId, s]));
      } while (again);
      reading = null;
      show();
    })();
    return reading;
  };

  /** Keeps `shelf` to its index, opened, and says when the person has no access to it. */
  const fill = (shelf: Shelf, handle: DocHandle): void => {
    const maps = {
      projects: liveMap(handle, "projects"),
      documents: liveMap(handle, "documents"),
    };
    const read = (): void => {
      shelf.opened = { handle, index: readWorkspace(maps) };
      show();
      void refresh();
    };
    const access = (): void => {
      const refused = handle.status.get().side.includes("access_removed");
      shelf.loadState.set(refused ? "problem" : "cached");
    };
    access();
    handle.status.subscribe(access);
    maps.projects.subscribe(read);
    maps.documents.subscribe(read);
    read();
  };
  const shelf = (ws: string): Shelf => {
    const known = shelves.get(ws);
    if (known !== undefined) return known;
    const handle = sync.client.open(indexDocId("workspace", ws), {
      create: { kind: "index", home: workspaceHome(ws), workspaceId: null },
    });
    const created: Shelf = {
      projects: createValue<readonly ProjectItem[]>([]),
      continueList: createValue<readonly ContinueItem[]>([]),
      loadState: createValue<"cached" | "problem">("cached"),
      handle,
      ready: handle.then(
        (opened) => fill(created, opened),
        () => created.loadState.set("problem"),
      ),
      opened: null,
    };
    shelves.set(ws, created);
    return created;
  };
  /** The workspaces a document of this person may be in: the listed ones and the person's own. */
  const openKnown = (): void => {
    for (const ref of options.workspaces.get()) shelf(ref.id);
    if (options.localWorkspaceId !== null) shelf(options.localWorkspaceId);
  };
  const valueOf = <T>(
    values: Map<string, Value<T | null>>,
    docId: string,
  ): Value<T | null> => {
    const existing = values.get(docId);
    if (existing !== undefined) return existing;
    const created = createValue<T | null>(null);
    values.set(docId, created);
    openKnown();
    show();
    return created;
  };
  const changed = (): void => void refresh();

  privateIndex.continueMap.subscribe(show);
  privateIndex.onDevice.subscribe(changed);
  sync.link.subscribe(changed);
  options.workspaces.subscribe(() => {
    if (titles.size + kinds.size + continuing.size > 0) openKnown();
  });

  return {
    continueList: (ws) => shelf(ws).continueList,
    projects: (ws) => shelf(ws).projects,
    async readProjects(ws) {
      const { ready, projects } = shelf(ws);
      await ready;
      return projects.get();
    },
    loadState: (ws) => shelf(ws).loadState,
    async createProject(ws, kind): Promise<CreateResult> {
      const index = await shelf(ws).handle;
      const projectId = options.newId();
      const handle = await sync.client.create({
        kind: "script",
        home: projectHome(projectId),
        workspaceId: ws,
      });
      startScript(handle, options.language);
      const at = now();
      liveMap(index, "projects").set(projectId, {
        title: LIBRARY_WORDS.untitledProject(kind),
        kind,
        createdAt: at,
        createdByUserId: userId,
      });
      liveMap(index, "documents").set(handle.docId, {
        projectId,
        title: LIBRARY_WORDS.untitledScript,
        kind: "script",
        createdAt: at,
        editedAt: null,
        editedByUserId: null,
      });
      await handle.close();
      // the new row says where its script is before it is returned
      await refresh();
      return { projectId, docId: handle.docId };
    },
    documentTitle: (docId) => valueOf(titles, docId),
    documentKind: (docId) => valueOf(kinds, docId),
    renameDocument(docId, title) {
      const found = find(docId);
      if (found === null) return;
      liveMap(found.handle, "documents").set(docId, { ...found.entry, title });
    },
    markOpened(docId) {
      continuing.add(docId);
      openKnown();
      show();
      return () => {
        continuing.delete(docId);
      };
    },
    follow(docId, handle) {
      return onOwnChange(handle, () => {
        const found = find(docId);
        if (found === null) return;
        const { editedAt, editedByUserId } = found.entry;
        const at = now();
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
      });
    },
  };
}
