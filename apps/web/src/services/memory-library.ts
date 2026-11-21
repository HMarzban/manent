// The Library's index for this tab until sync supplies it: projects and Continue per workspace, held in memory.
import { LIBRARY_WORDS, createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type {
  ContinueItem,
  CreateResult,
  LibraryIndex,
  ProjectItem,
  ProjectKind,
} from "./ports.ts";
import type { NewScript } from "./sync/create-script.ts";

type Value<T> = Subscribable<T> & { set(value: T): void };

interface Workspace {
  continueList: Value<readonly ContinueItem[]>;
  projects: Value<readonly ProjectItem[]>;
}

/**
 * Every workspace starts empty. `createProject` makes one untitled document in a new project through `createScript`,
 * with the paper of `language`'s region, and lists it first in Continue once it is made; it never rejects.
 */
export function createMemoryLibrary(options: {
  ids: () => string;
  createScript: (script: NewScript) => Promise<void>;
  language: string;
}): LibraryIndex {
  const workspaces = new Map<string, Workspace>();
  const titles = new Map<string, Value<string | null>>();
  const kinds = new Map<string, Value<ProjectKind | null>>();
  // memory holds everything it lists
  const cached = createValue<"cached" | "problem">("cached");

  const workspace = (id: string): Workspace => {
    const existing = workspaces.get(id);
    if (existing !== undefined) return existing;
    const created = {
      continueList: createValue([]),
      projects: createValue([]),
    };
    workspaces.set(id, created);
    return created;
  };
  const valueOf = <T>(
    values: Map<string, Value<T | null>>,
    docId: string,
  ): Value<T | null> => {
    const existing = values.get(docId);
    if (existing !== undefined) return existing;
    const created = createValue<T | null>(null);
    values.set(docId, created);
    return created;
  };

  return {
    continueList: (id) => workspace(id).continueList,
    projects: (id) => workspace(id).projects,
    loadState: () => cached,
    async createProject(id, kind): Promise<CreateResult> {
      const result = { projectId: options.ids(), docId: options.ids() };
      await options
        .createScript({ ...result, language: options.language })
        .catch(() => {
          // a device that cannot hold the script still lists it, and its status says it is not saved
        });
      const projectTitle = LIBRARY_WORDS.untitledProject(kind);
      const title = LIBRARY_WORDS.untitledScript;
      const place = { kind: "never_synced" } as const;
      const { continueList, projects } = workspace(id);
      projects.set([
        {
          projectId: result.projectId,
          title: projectTitle,
          kind,
          firstDocId: result.docId,
          lastEdited: null,
          place,
        },
        ...projects.get(),
      ]);
      continueList.set([
        { docId: result.docId, title, projectTitle, kind, place },
        ...continueList.get(),
      ]);
      valueOf(titles, result.docId).set(title);
      valueOf(kinds, result.docId).set(kind);
      return result;
    },
    documentTitle: (docId) => valueOf(titles, docId),
    documentKind: (docId) => valueOf(kinds, docId),
    renameDocument(docId, title) {
      valueOf(titles, docId).set(title);
      for (const { continueList } of workspaces.values())
        continueList.set(
          continueList
            .get()
            .map((item) => (item.docId === docId ? { ...item, title } : item)),
        );
    },
  };
}
