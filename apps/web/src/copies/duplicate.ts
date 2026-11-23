// Duplicate: a script, as it is now or as one version held it, copied into its own project under "{title} — copy".
import { jsonMap } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import { COPIES_WORDS } from "@manent/ui";
import type { PersonServices, ProjectKind } from "../services/ports.ts";
import { readWorkspace } from "../services/sync/index-entries.ts";
import { copyDocument } from "./copy-document.ts";
import type { CopySource } from "./copy-document.ts";

interface Place {
  workspaceId: string;
  projectId: string;
  kind: ProjectKind;
}

/** The workspace and project whose index lists `docId`, among the person's workspaces and their own desk; null when none does. */
async function placeOf(
  services: PersonServices,
  docId: string,
): Promise<Place | null> {
  const me = await services.api.me();
  const listed = me.ok ? me.me.workspaces.map((w) => w.id) : [];
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
      const entry = index.documents.get(docId);
      const project =
        entry === undefined ? undefined : index.projects.get(entry.projectId);
      if (entry !== undefined && project !== undefined)
        return { workspaceId, projectId: entry.projectId, kind: project.kind };
    } finally {
      await handle.close();
    }
  }
  return null;
}

/**
 * Copies `source` into the project that holds it, titled "{title} — copy". `not_saved` also when no index of the
 * person's lists the script. Rejects when the person's sync could not start.
 */
export async function duplicate(
  services: PersonServices,
  source: CopySource,
): Promise<
  | { ok: true; docId: string; title: string }
  | { ok: false; reason: "not_held" | "not_saved"; title: string }
> {
  const title = COPIES_WORDS.copyTitle(
    services.library.documentTitle(source.docId).get() ?? "",
  );
  const place = await placeOf(services, source.docId);
  if (place === null) return { ok: false, reason: "not_saved", title };
  const made = await copyDocument({
    source,
    target: {
      ...place,
      title,
      format: null,
      entry: { rundownId: null },
    },
    library: services.library,
    history: services.history,
    open: (docId) => services.openHandle(docId),
    ids: randomBlockId,
  });
  return made.ok
    ? { ok: true, docId: made.docId, title }
    : { ok: false, reason: made.reason, title };
}
