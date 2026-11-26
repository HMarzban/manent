// Creating projects and documents in a workspace index, plus quiet removal of untouched blank projects.
import { readRundown } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { projectHome } from "@manent/sync-protocol";
import type { WorkspaceRef } from "@manent/sync-protocol";
import { LIBRARY_WORDS } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { projectIndexCreated } from "../../project/project-index.ts";
import { projectTemplateCreated } from "../../project/settings-bag.ts";
import { seriesCreated } from "../../series/series-start.ts";
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
import { readWorkspace } from "./index-entries.ts";
import type { WorkspaceEntries } from "./index-entries.ts";
import type { Shelves } from "./index-shelves.ts";
import { liveMap } from "./private-index.ts";
import type { PrivateIndex } from "./private-index.ts";

/** A project just made on this device, and its first document. */
export interface NewProject {
  readonly sync: PersonSync;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly kind: ProjectKind;
  readonly docId: string;
  readonly newId?: () => string;
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
export const PROJECT_CREATED: readonly ProjectCreated[] = [
  projectIndexCreated,
  projectTemplateCreated,
  seriesCreated,
];

/** What the Library is made over. */
export interface LibraryOptions {
  sync: PersonSync;
  privateIndex: PrivateIndex;
  userId: string;
  workspaces: Subscribable<readonly WorkspaceRef[]>;
  localWorkspaceId: string | null;
  language: string;
  now: () => number;
  newId: () => string;
}

/** A project made here, by its first document, that no one has changed yet. */
export interface UntouchedProject {
  projectId: string;
  kind: ProjectKind;
  title: string;
  createdFromTemplate?: boolean;
  isUntouched(handle: DocHandle): boolean;
}

/** The index's projects and documents, read. */
export const entriesOf = (index: DocHandle): WorkspaceEntries =>
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
export async function addProject(
  options: LibraryOptions & { shelves: Shelves },
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
  if (isNew) {
    const { newId } = options;
    const made = {
      sync,
      workspaceId,
      projectId,
      kind,
      docId: handle.docId,
      newId,
    };
    for (const created of PROJECT_CREATED) await created.made(made);
  }
  const { project, script } = titles(index);
  const at = options.now();
  if (isNew)
    liveMap(index, "projects").set(projectId, {
      title: project,
      kind,
      createdAt: at,
      createdByUserId: options.userId,
    });
  const initialAirDate =
    opening.airDate ??
    (opening.docKind === "rundown"
      ? readRundown(handle.doc()).rundown.airDate || null
      : null);
  liveMap(index, "documents").set(handle.docId, {
    projectId,
    title: script,
    kind: opening.docKind,
    createdAt: at,
    editedAt: null,
    editedByUserId: null,
    airDate: initialAirDate,
    rundownId: opening.rundownId,
  });
  await handle.close();
  // the new row says where its script is before it is returned
  await shelves.refresh();
  return { projectId, docId: handle.docId };
}

/** True when `made` is eligible for quiet removal on leave; template-instantiated documents are never untouched. */
export function isProjectUntouched(
  made: UntouchedProject,
  handle: DocHandle,
): boolean {
  if (made.createdFromTemplate === true) return false;
  return made.isUntouched(handle);
}

/**
 * Removes the project `made` with `docId` when `handle` and both names are still as made and neither the project nor
 * the document is a favourite: never trashed. Documents created from a template are never removed as untouched.
 */
export function removeUntouched(
  options: { sync: PersonSync; privateIndex: PrivateIndex; shelves: Shelves },
  docId: string,
  made: UntouchedProject,
  handle: DocHandle,
): void {
  const found = options.shelves.find(docId);
  if (found === null || !isProjectUntouched(made, handle)) return;
  const favourites = liveMap(options.privateIndex.handle, "favourites");
  if ([made.projectId, docId].some((key) => favourites.get(key) !== null))
    return;
  const renamed =
    found.entry.title !== LIBRARY_WORDS.untitledScript ||
    entriesOf(found.handle).projects.get(made.projectId)?.title !== made.title;
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
}

/** New, imported and copied documents, each listed in its workspace's index; each new project goes in `untouched`. */
export function projectMaking(
  options: LibraryOptions & { shelves: Shelves },
  untouched: Map<string, UntouchedProject>,
): Pick<LibraryIndex, "createProject" | "importProject" | "addCopy"> {
  return {
    async createProject(ws, kind) {
      let title = "";
      const start = projectStartOf(kind);
      const added = await addProject(
        options,
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
      untouched.set(added.docId, {
        projectId: added.projectId,
        kind,
        title,
        createdFromTemplate: false,
        isUntouched: start.isUntouched,
      });
      return added;
    },
    importProject: (ws, imported) =>
      addProject(
        options,
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
    addCopy: (ws, projectId, kind, title, start) =>
      addProject(
        options,
        { workspaceId: ws, projectId, kind },
        () => ({ project: title, script: title }),
        start,
      ),
  };
}
