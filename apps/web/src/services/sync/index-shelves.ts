// Each workspace's index as the Library holds it: opened from the device first when it is first asked for, read, and
// drawn into that workspace's lists.
import { StoreError } from "@manent/sync-client";
import type { DocHandle, DocSummary } from "@manent/sync-client";
import { indexDocId, workspaceHome } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { ContinueItem, ProjectItem, ProjectKind } from "../ports.ts";
import type { PersonSync } from "./create-sync.ts";
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

type Value<T> = Subscribable<T> & { set(value: T): void };

/** One workspace's lists, and its index once it has opened. */
export interface Shelf {
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
export interface Found {
  workspaceId: string;
  entry: DocumentEntry;
  handle: DocHandle;
  kind: ProjectKind | null;
}

export interface Shelves {
  /** The workspace's shelf; its index opens the first time it is asked for, and stays open. */
  shelf(workspaceId: string): Shelf;
  /** Opens the index of each workspace a document of this person may be in: the listed ones and their own. */
  openKnown(): void;
  /** The opened index that holds `docId`; null when none does. */
  find(docId: string): Found | null;
  /** Reads what the device's store holds again, then draws; once more when asked while it reads. */
  refresh(): Promise<void>;
  /** Draws every opened shelf's lists again, then tells `drawn`. */
  show(): void;
}

function findIn(
  shelves: ReadonlyMap<string, Shelf>,
  docId: string,
): Found | null {
  for (const [workspaceId, { opened }] of shelves) {
    const entry = opened?.index.documents.get(docId);
    if (entry === undefined || opened === null) continue;
    const kind = opened.index.projects.get(entry.projectId)?.kind ?? null;
    return { workspaceId, entry, handle: opened.handle, kind };
  }
  return null;
}

/** Keeps `shelf` to its index, opened, and says when the person has no access to it; `read` is told each change. */
function fill(shelf: Shelf, handle: DocHandle, read: () => void): void {
  const maps = {
    projects: liveMap(handle, "projects"),
    documents: liveMap(handle, "documents"),
  };
  const update = (): void => {
    shelf.opened = { handle, index: readWorkspace(maps) };
    read();
  };
  const access = (): void => {
    const refused = handle.status.get().side.includes("access_removed");
    shelf.loadState.set(refused ? "problem" : "cached");
  };
  access();
  handle.status.subscribe(access);
  maps.projects.subscribe(update);
  maps.documents.subscribe(update);
  update();
}

/** The shelf of `workspaceId`, whose index opens from the device first; `read` is told each time it is read. */
function openShelf(
  sync: PersonSync,
  workspaceId: string,
  read: () => void,
): Shelf {
  const handle = sync.client.open(indexDocId("workspace", workspaceId), {
    create: {
      kind: "index",
      home: workspaceHome(workspaceId),
      workspaceId: null,
    },
  });
  const shelf: Shelf = {
    projects: createValue<readonly ProjectItem[]>([]),
    continueList: createValue<readonly ContinueItem[]>([]),
    loadState: createValue<"cached" | "problem">("cached"),
    handle,
    ready: handle.then(
      (opened) => fill(shelf, opened, read),
      () => shelf.loadState.set("problem"),
    ),
    opened: null,
  };
  return shelf;
}

/** A store closed under a reading, as when the tab's person changes, leaves the rows as last read; anything else is thrown. */
function keepRowsOnClose(error: unknown): void {
  if (!(error instanceof StoreError && error.code === "unavailable"))
    throw error;
}

/** Rows say where each document is from what the device's store holds, read again as the indexes and the link change. */
export function createShelves(options: {
  sync: PersonSync;
  privateIndex: PrivateIndex;
  userId: string;
  workspaces: Subscribable<readonly WorkspaceRef[]>;
  localWorkspaceId: string | null;
  drawn: () => void;
}): Shelves {
  const { sync, privateIndex, userId } = options;
  const shelves = new Map<string, Shelf>();
  let summaries: ReadonlyMap<string, DocSummary> = new Map();
  const show = (): void => {
    const facts: RowFacts = {
      userId,
      summaries,
      continued: readContinueMap(privateIndex.continueMap),
      nameOf,
    };
    for (const [ws, { opened, projects, continueList }] of shelves) {
      if (opened === null) continue;
      projects.set(projectItems(opened.index, facts));
      continueList.set(continueItems(ws, opened.index, facts));
    }
    options.drawn();
  };
  let reading: Promise<void> | null = null;
  let again = false;
  const refresh = (): Promise<void> => {
    again = reading !== null;
    reading ??= (async () => {
      try {
        do {
          again = false;
          const listed = await sync.client.documents();
          summaries = new Map(listed.map((s) => [s.docId, s]));
        } while (again);
      } finally {
        reading = null;
      }
      show();
    })();
    return reading;
  };
  const read = (): void => {
    show();
    void refresh().catch(keepRowsOnClose);
  };
  const shelf = (ws: string): Shelf => {
    const known = shelves.get(ws);
    if (known !== undefined) return known;
    const opened = openShelf(sync, ws, read);
    shelves.set(ws, opened);
    return opened;
  };
  const changed = (): void => void refresh().catch(keepRowsOnClose);
  privateIndex.continueMap.subscribe(show);
  privateIndex.onDevice.subscribe(changed);
  sync.link.subscribe(changed);
  return {
    shelf,
    openKnown() {
      for (const ref of options.workspaces.get()) shelf(ref.id);
      if (options.localWorkspaceId !== null) shelf(options.localWorkspaceId);
    },
    find: (docId) => findIn(shelves, docId),
    refresh,
    show,
  };
}
