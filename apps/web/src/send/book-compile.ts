// Multi-part Book Compile: discovers ordered manuscript parts in a Book project and joins them into one continuous export.
import { jsonMap, scriptBody } from "@manent/crdt";
import { combineBookParts } from "@manent/formats";
import type { BookPart, ScriptForExport } from "@manent/formats";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import { LIBRARY_WORDS } from "@manent/ui";
import { liveEditor } from "../editor-host/live-editor.ts";
import { storageOfServices } from "../services/api-cache.ts";
import type { PersonServices } from "../services/ports.ts";
import {
  browserStores,
  createDeviceMemory,
} from "../services/sync/device-memory.ts";
import { readWorkspace } from "../services/sync/index-entries.ts";

export interface ListedBookProject {
  readonly projectId: string;
  readonly title: string;
  readonly parts: readonly { readonly docId: string; readonly title: string }[];
}

type CompileServices = Pick<PersonServices, "api" | "userId" | "openHandle">;

/** Lists all non-trashed script documents belonging to `docId`'s Book project in creation order. */
export async function listBookProjectParts(
  services: CompileServices,
  docId: string,
): Promise<ListedBookProject | null> {
  const me = await services.api.me();
  const storage =
    storageOfServices(services as PersonServices) ?? browserStores().local;
  const cached =
    createDeviceMemory({ local: storage, session: null }).workspaces(
      services.userId,
    ) ?? [];
  const listed = me.ok
    ? me.me.workspaces.map((w) => w.id)
    : cached.map((w) => w.id);

  for (const workspaceId of new Set([...listed, services.userId])) {
    const handle = await services.openHandle(
      indexDocId("workspace", workspaceId),
    );
    try {
      const doc = handle.doc();
      const index = readWorkspace({
        projects: jsonMap(doc, "projects"),
        documents: jsonMap(doc, "documents"),
      });
      const projectId = index.documents.get(docId)?.projectId;
      const project =
        projectId === undefined ? undefined : index.projects.get(projectId);
      if (project === undefined || project.kind !== "book") continue;
      const parts = [...index.documents]
        .filter(
          ([, entry]) =>
            entry.projectId === projectId &&
            entry.kind === "script" &&
            entry.trashedAt === null,
        )
        .toSorted(
          ([a, x], [b, y]) => x.createdAt - y.createdAt || a.localeCompare(b),
        )
        .map(([id, entry]) => ({
          docId: id,
          title:
            entry.title === "" ? LIBRARY_WORDS.untitledScript : entry.title,
        }));
      return {
        projectId: projectId!,
        title: project.title,
        parts,
      };
    } finally {
      await handle.close();
    }
  }
  return null;
}

function blocksFromDocJson(json: DocJSON): BlockJSON[] {
  return (json.content ?? []).flatMap((section) => section.content ?? []);
}

async function readPartBlocks(
  services: CompileServices,
  docId: string,
): Promise<readonly BlockJSON[]> {
  const open = liveEditor(docId);
  if (open !== null) {
    return blocksFromDocJson(open.view.state.doc.toJSON());
  }
  const handle = await services.openHandle(docId);
  try {
    return blocksFromDocJson(scriptBody(handle.doc()).materialize());
  } finally {
    await handle.close();
  }
}

/** Compiles all parts of `docId`'s Book project into one continuous `ScriptForExport`. */
export async function compileBookProject(
  services: CompileServices,
  docId: string,
  fallbackTitle: string,
): Promise<{
  readonly title: string;
  readonly script: ScriptForExport;
  readonly partsCount: number;
} | null> {
  const project = await listBookProjectParts(services, docId);
  if (project === null || project.parts.length === 0) return null;
  const loaded: BookPart[] = [];
  for (const part of project.parts) {
    loaded.push({
      title: part.title,
      blocks: await readPartBlocks(services, part.docId),
    });
  }
  const title = project.title.trim() || fallbackTitle;
  return {
    title,
    script: combineBookParts({ title, parts: loaded }),
    partsCount: loaded.length,
  };
}
