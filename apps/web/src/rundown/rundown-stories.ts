// Workspace place lookup, empty story creation for Start a script, and quiet index cleanup for undone row pastes.
import { jsonMap, scriptBody, yXmlFragmentForBinding } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import { paperForRegion } from "@manent/settings";
import type { DocHandle, DocStatus } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import type { PersonServices, ProjectKind } from "../services/ports.ts";
import { readWorkspace } from "../services/sync/index-entries.ts";

const SYNC_WAIT_MS = 5_000;

export interface RundownPlace {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly kind: ProjectKind;
}

function isHandleSettled(status: DocStatus): boolean {
  if (status.docSync === "synced" || status.link === "offline") return true;
  return (
    status.side.includes("access_removed") ||
    status.side.includes("deleted") ||
    status.side.includes("sign_in")
  );
}

/** Opens `docId` and waits for its initial sync when online and not yet synced, so callers see remote content. */
export async function openSyncedHandle(
  services: PersonServices,
  docId: string,
  schedule: (fn: () => void, delayMs: number) => () => void,
): Promise<DocHandle> {
  const handle = await services.openHandle(docId);
  if (isHandleSettled(handle.status.get())) return handle;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      stopSub();
      stopTimer();
      resolve();
    };
    const stopSub = handle.status.subscribe((st) => {
      if (isHandleSettled(st)) finish();
    });
    const stopTimer = schedule(finish, SYNC_WAIT_MS);
  });
  return handle;
}

/** Resolves the workspace, project and kind holding `docId`; falls back to library subscriptions when absent from index. */
export async function resolveRundownPlace(
  services: PersonServices,
  docId: string,
  schedule: (fn: () => void, delayMs: number) => () => void,
): Promise<RundownPlace | null> {
  const me = await services.api.me().catch(() => null);
  const listed = me !== null && me.ok ? me.me.workspaces.map((w) => w.id) : [];
  for (const workspaceId of new Set([...listed, services.userId])) {
    try {
      const handle = await openSyncedHandle(
        services,
        indexDocId("workspace", workspaceId),
        schedule,
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
        if (entry !== undefined && project !== undefined) {
          return {
            workspaceId,
            projectId: entry.projectId,
            kind: project.kind,
          };
        }
      } finally {
        await handle.close();
      }
    } catch {
      // workspace index unavailable: try the next workspace or fallback
    }
  }
  const projectId = services.library.documentProject(docId).get();
  if (projectId === null) return null;
  const kind = services.library.documentKind(docId).get() ?? "show";
  return { workspaceId: listed[0] ?? services.userId, projectId, kind };
}

/** Creates a new empty story document in `place`'s project linked to `rundownId` via its index entry. */
export async function createStoryForRow(options: {
  readonly services: PersonServices;
  readonly place: RundownPlace;
  readonly rundownId: string;
  readonly title: string;
  readonly language: string;
}): Promise<string> {
  const { services, place, rundownId, title, language } = options;
  const made = await services.library.addCopy(
    place.workspaceId,
    place.projectId,
    place.kind,
    title,
    {
      docKind: "script",
      airDate: null,
      rundownId,
      start(handle) {
        const doc = handle.doc();
        if (yXmlFragmentForBinding(doc).length === 0) {
          scriptBody(doc).write((writer) =>
            writer.insertBlocks(null, [
              {
                type: "block",
                attrs: { id: randomBlockId(), type: "slug", kind: null },
              },
            ]),
          );
        }
        handle.setSetting("script.format", "variety");
        handle.setSetting("script.paper", paperForRegion(language));
      },
    },
  );
  return made.docId;
}

/** Quietly removes `docIds` from the workspace index (matching untouched-project cleanup) and returns removed raw entries. */
export async function removeQuietlyFromIndex(
  services: PersonServices,
  workspaceId: string,
  docIds: readonly string[],
): Promise<ReadonlyMap<string, unknown>> {
  const saved = new Map<string, unknown>();
  if (docIds.length === 0) return saved;
  try {
    const handle = await services.openHandle(
      indexDocId("workspace", workspaceId),
    );
    try {
      const docs = jsonMap(handle.doc(), "documents");
      for (const id of docIds) {
        const existing = docs.get(id);
        if (existing !== null) saved.set(id, existing);
        docs.delete(id);
      }
    } finally {
      await handle.close();
    }
  } catch {
    // workspace index unavailable during undo cleanup
  }
  try {
    const priv = await services.openHandle(indexDocId("user", services.userId));
    try {
      const cont = jsonMap(priv.doc(), "continue");
      for (const id of docIds) cont.delete(id);
    } finally {
      await priv.close();
    }
  } catch {
    // private index unavailable during undo cleanup
  }
  return saved;
}

/** Restores previously removed workspace index entries when a paste or script start is redone. */
export async function restoreQuietlyToIndex(
  services: PersonServices,
  workspaceId: string,
  entries: ReadonlyMap<string, unknown>,
): Promise<void> {
  if (entries.size === 0) return;
  try {
    const handle = await services.openHandle(
      indexDocId("workspace", workspaceId),
    );
    try {
      const docs = jsonMap(handle.doc(), "documents");
      for (const [id, value] of entries) docs.set(id, value);
    } finally {
      await handle.close();
    }
  } catch {
    // workspace index unavailable during redo restore
  }
}
