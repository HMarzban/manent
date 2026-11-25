// The gallery's Library: a fixed number of new films, listed alike in every workspace.
import type { DocKind } from "@manent/sync-protocol";
import { LIBRARY_WORDS, createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type {
  ContinueItem,
  LibraryIndex,
  ProjectItem,
  ProjectKind,
} from "../../services/ports.ts";

const PLACE = Object.freeze({ kind: "never_synced" } as const);

/**
 * `count` untitled films, each with one untitled script that has never synced, newest first in Projects and Continue.
 * It makes nothing: a new, imported or copied project never settles, and a rename changes nothing.
 */
export function createFixtureLibrary(options: {
  count: number;
  ids: () => string;
  /** Who made the films, and when, in milliseconds since the epoch. */
  made: { byName: string; at: number };
}): LibraryIndex {
  const made = Array.from({ length: options.count }, () => ({
    projectId: options.ids(),
    docId: options.ids(),
  }));
  const projectTitle = LIBRARY_WORDS.untitledProject("film");
  const title = LIBRARY_WORDS.untitledScript;
  const projects = createValue<readonly ProjectItem[]>(
    made.map(({ projectId, docId }) => ({
      projectId,
      title: projectTitle,
      kind: "film",
      firstDocId: docId,
      lastEdited: options.made,
      place: PLACE,
    })),
  );
  const continueList = createValue<readonly ContinueItem[]>(
    made.map(({ docId }) => ({
      docId,
      title,
      projectTitle,
      kind: "film",
      place: PLACE,
    })),
  );
  const titles = new Map<string, Subscribable<string | null>>(
    made.map(({ docId }) => [docId, createValue(title)]),
  );
  const kinds = new Map<string, Subscribable<ProjectKind | null>>(
    made.map(({ docId }) => [docId, createValue("film")]),
  );
  const projectIds = new Map<string, Subscribable<string | null>>(
    made.map(({ projectId, docId }) => [docId, createValue(projectId)]),
  );
  const cached = createValue<"cached" | "problem">("cached");
  const none = createValue(null);
  return {
    continueList: () => continueList,
    projects: () => projects,
    readProjects: async () => projects.get(),
    loadState: () => cached,
    createProject: () => new Promise(() => {}),
    importProject: () => new Promise(() => {}),
    documentTitle: (docId) => titles.get(docId) ?? none,
    documentKind: (docId) => kinds.get(docId) ?? none,
    docKindOf: (docId) =>
      kinds.has(docId) ? createValue<DocKind | null>("script") : none,
    documentProject: (docId) => projectIds.get(docId) ?? none,
    renameDocument() {},
    addCopy: () => new Promise(() => {}),
  };
}
