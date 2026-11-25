// Creates an outline document on first Open beside for an episode or film/stage play, enforcing write access.
import { scriptBody, writeEpisode, yXmlFragmentForBinding } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import type { FormatId } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { OUTLINE_WORDS } from "@manent/ui";
import type { BesideHere } from "../beside/kinds.ts";
import type { PersonServices } from "../services/ports.ts";
import {
  findEpisodeForScript,
  findScriptPlace,
  isHandleWritable,
  recordOutlineLink,
  resolveExistingOutline,
  supportsOutline,
} from "./outline-link.ts";
import type { ScriptPlace } from "./outline-link.ts";

const creating = new Map<string, Promise<string | null>>();

/** Checks server-held role when signed in and online; non-writers are refused cleanly. */
async function mayCreateOutline(
  services: PersonServices,
  scriptDocId: string,
  place: ScriptPlace,
): Promise<boolean> {
  const doc = services.documents.open(scriptDocId);
  let statusWritable: boolean;
  let online: boolean;
  let neverSynced: boolean;
  try {
    const facts = doc.status.get();
    statusWritable =
      facts.access === "edit" && facts.server !== "access_removed";
    online = facts.network === "online" && facts.server !== "unreachable";
    neverSynced = facts.neverSynced;
  } finally {
    services.documents.close(scriptDocId);
  }
  if (!statusWritable) return false;
  if (!isHandleWritable(place.workspaceHandle)) return false;
  const wsRole = await services.api.role(
    indexDocId("workspace", place.workspaceId),
  );
  if (wsRole === "view" || wsRole === "comment") return false;
  const role = await services.api.role(scriptDocId);
  if (role === "view" || role === "comment") return false;
  if (role === null && !neverSynced && online) {
    const me = await services.api.me();
    if (me.ok) return false;
  }
  if (place.projectKind === "series") {
    const projectIndex = services.projectIndex(place.projectId);
    try {
      const projectHandle = await projectIndex.handle();
      if (!isHandleWritable(projectHandle)) return false;
    } finally {
      void projectIndex.close();
    }
    const projectRole = await services.api.role(
      indexDocId("project", place.projectId),
    );
    if (projectRole === "view" || projectRole === "comment") return false;
  }
  return true;
}

/** Initializes a brand-new outline document with one empty General block and its script's format and paper. */
function startOutlineDocument(
  handle: DocHandle,
  format: FormatId,
  paper: "letter" | "a4",
): void {
  const doc = handle.doc();
  if (yXmlFragmentForBinding(doc).length === 0) {
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [
        {
          type: "block",
          attrs: { id: randomBlockId(), type: "general", kind: null },
        },
      ]),
    );
  }
  handle.setSetting("script.format", format);
  handle.setSetting("script.paper", paper);
}

async function openOrCreateInner(here: BesideHere): Promise<string | null> {
  const { docId: scriptDocId, services, workspaceIds } = here;
  const place = await findScriptPlace(services, scriptDocId, workspaceIds);
  if (place === null) return null;
  try {
    if (!supportsOutline(place.projectKind)) return null;
    const existing = await resolveExistingOutline(services, place, scriptDocId);
    if (existing.outlineDocId !== null) {
      recordOutlineLink(scriptDocId, {
        outlineDocId: existing.outlineDocId,
        projectKind: place.projectKind,
        hasEpisode: existing.hasEpisode,
        canCreate: false,
      });
      return existing.outlineDocId;
    }
    if (!existing.hasEpisode) return null;
    const allowed = await mayCreateOutline(services, scriptDocId, place);
    if (!allowed) return null;

    const store = services.openScriptStore(scriptDocId);
    const format = store.get("script.format");
    const paper = store.get("script.paper");
    let createdDocId: string;
    try {
      const created = await services.library.addCopy(
        place.workspaceId,
        place.projectId,
        place.projectKind,
        OUTLINE_WORDS.besideTitle(place.scriptTitle),
        {
          docKind: "outline",
          airDate: null,
          rundownId: null,
          start: (handle) => startOutlineDocument(handle, format, paper),
        },
      );
      createdDocId = created.docId;
    } catch {
      // server refused creation or storage failed; leave state clean
      return null;
    }

    if (place.projectKind === "series") {
      const projectIndex = services.projectIndex(place.projectId);
      try {
        const projectHandle = await projectIndex.handle();
        const projectDoc = projectHandle.doc();
        const current = findEpisodeForScript(projectDoc, scriptDocId);
        if (current === null) return null;
        if (current.docIds.outline !== null) {
          createdDocId = current.docIds.outline;
        } else {
          writeEpisode(projectDoc, {
            ...current,
            docIds: { ...current.docIds, outline: createdDocId },
          });
        }
      } catch {
        // project index write refused; do not report unlinked outline
        return null;
      } finally {
        void projectIndex.close();
      }
    }

    recordOutlineLink(scriptDocId, {
      outlineDocId: createdDocId,
      projectKind: place.projectKind,
      hasEpisode: true,
      canCreate: true,
    });
    return createdDocId;
  } finally {
    void place.workspaceHandle.close();
  }
}

/**
 * Opens `here.docId`'s outline, creating it on first open when the person has write access. In a series the new id is
 * written only to the episode entry's `docIds.outline`; in a film or stage play it is the project's workspace-index
 * `documents` entry of kind `outline`. Never mutates for read-only or comment roles.
 */
export function openOrCreateOutline(here: BesideHere): Promise<string | null> {
  const active = creating.get(here.docId);
  if (active !== undefined) return active;
  const task = openOrCreateInner(here).finally(() => {
    creating.delete(here.docId);
  });
  creating.set(here.docId, task);
  return task;
}
