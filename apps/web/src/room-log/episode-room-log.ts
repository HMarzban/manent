// Opening or creating an episode's room log on first Open beside → Room log, with strict writer-role checks.
import {
  readEpisodes,
  scriptBody,
  writeEpisode,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type { CrdtDoc, EpisodeEntry } from "@manent/crdt";
import { randomBlockId } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { ROOM_LOG_WORDS } from "@manent/ui";
import type { BesideChoice, BesideHere } from "../beside/kinds.ts";
import type { PersonServices } from "../services/ports.ts";
import { liveMap } from "../services/sync/private-index.ts";

const INDEX_WAIT_MS = 2_000;

function findEpisodeForDoc(doc: CrdtDoc, docId: string): EpisodeEntry | null {
  for (const episode of readEpisodes(doc).values()) {
    const { docIds } = episode;
    if (
      docIds.script === docId ||
      docIds.outline === docId ||
      docIds.roomLog === docId
    )
      return episode;
  }
  return null;
}

/** Waits briefly for the project index to sync if the episode entry is not loaded yet. */
async function waitForEpisode(
  handle: DocHandle,
  docId: string,
): Promise<EpisodeEntry | null> {
  const existing = findEpisodeForDoc(handle.doc(), docId);
  if (existing !== null) return existing;
  const status = handle.status.get();
  if (
    status.synced ||
    status.link === "offline" ||
    status.side.includes("access_removed")
  )
    return null;
  return new Promise<EpisodeEntry | null>((resolve) => {
    let done = false;
    const finish = (found: EpisodeEntry | null): void => {
      if (done) return;
      done = true;
      stopMap();
      stopStatus();
      clearTimeout(timer);
      resolve(found);
    };
    const check = (): void => {
      const found = findEpisodeForDoc(handle.doc(), docId);
      if (found !== null) return finish(found);
      const next = handle.status.get();
      if (
        next.synced ||
        next.link === "offline" ||
        next.side.includes("access_removed")
      )
        finish(null);
    };
    const stopMap = liveMap(handle, "episodes").subscribe(check);
    const stopStatus = handle.status.subscribe(check);
    const timer = setTimeout(() => finish(null), INDEX_WAIT_MS);
  });
}

function isHandleWritable(handle: DocHandle): boolean {
  const { side } = handle.status.get();
  return (
    !side.includes("read_only") &&
    !side.includes("view_only") &&
    !side.includes("access_removed")
  );
}

function isDocumentEditableLocally(
  services: PersonServices,
  docId: string,
): boolean {
  const doc = services.documents.open(docId);
  try {
    const status = doc.status.get();
    return status.access === "edit" && status.server !== "access_removed";
  } finally {
    services.documents.close(docId);
  }
}

/** Verifies from local status and server-held role (when reachable) that the person may create a room log. */
async function mayCreateRoomLog(
  services: PersonServices,
  docId: string,
  projectId: string,
  indexHandle: DocHandle,
): Promise<boolean> {
  if (!isDocumentEditableLocally(services, docId)) return false;
  if (!isHandleWritable(indexHandle)) return false;
  const online = indexHandle.status.get().link !== "offline";
  const [me, docRole, indexRole] = await Promise.all([
    online ? services.api.me() : Promise.resolve({ ok: false as const }),
    services.api.role(docId),
    services.api.role(indexDocId("project", projectId)),
  ]);
  const signedInOnline = online && me.ok;
  if (signedInOnline && (docRole === null || indexRole === null)) return false;
  if (docRole !== null && docRole !== "owner" && docRole !== "edit")
    return false;
  if (indexRole !== null && indexRole !== "owner" && indexRole !== "edit")
    return false;
  return true;
}

function workspaceForProject(
  here: BesideHere,
  projectId: string,
): string | null {
  for (const workspaceId of here.workspaceIds) {
    if (
      here.services.library
        .projects(workspaceId)
        .get()
        .some((project) => project.projectId === projectId)
    )
      return workspaceId;
  }
  return here.workspaceIds[0] ?? null;
}

function startRoomLogDocument(
  handle: DocHandle,
  randomId: () => string = randomBlockId,
): void {
  const doc = handle.doc();
  if (yXmlFragmentForBinding(doc).length === 0) {
    scriptBody(doc).write((w) =>
      w.insertBlocks(null, [
        {
          type: "block",
          attrs: { id: randomId(), type: "general", kind: null },
        },
      ]),
    );
  }
  handle.setSetting("script.format", "screenplay");
}

/**
 * Returns the episode's existing `docIds.roomLog`, or creates one on first open for an editor/owner and writes
 * ONLY `docIds.roomLog` into the episode entry. Returns null when outside an episode, refused or read-only.
 */
export async function openOrCreateRoomLog(
  here: BesideHere,
  randomId: () => string = randomBlockId,
): Promise<string | null> {
  const { services, docId } = here;
  if (services.library.documentKind(docId).get() !== "series") return null;
  const projectId = services.library.documentProject(docId).get();
  if (projectId === null) return null;
  const index = services.projectIndex(projectId);
  try {
    let indexHandle: DocHandle;
    try {
      indexHandle = await index.handle();
    } catch {
      // project index unavailable or sync not started
      return null;
    }
    const episode = await waitForEpisode(indexHandle, docId);
    if (episode === null) return null;
    if (episode.docIds.roomLog !== null) return episode.docIds.roomLog;
    if (!(await mayCreateRoomLog(services, docId, projectId, indexHandle)))
      return null;
    const workspaceId = workspaceForProject(here, projectId);
    if (workspaceId === null) return null;
    const episodeTitle =
      services.library.documentTitle(episode.docIds.script ?? docId).get() ??
      (episode.title === null
        ? String(episode.number)
        : `${episode.number} ${episode.title}`);
    const title =
      episodeTitle === ""
        ? ROOM_LOG_WORDS.entry
        : ROOM_LOG_WORDS.title(episodeTitle);
    try {
      const created = await services.library.addCopy(
        workspaceId,
        projectId,
        "series",
        title,
        {
          docKind: "room_log",
          airDate: null,
          rundownId: null,
          start: (handle) => startRoomLogDocument(handle, randomId),
        },
      );
      const latest = findEpisodeForDoc(indexHandle.doc(), docId) ?? episode;
      if (latest.docIds.roomLog !== null) return latest.docIds.roomLog;
      writeEpisode(indexHandle.doc(), {
        ...latest,
        docIds: { ...latest.docIds, roomLog: created.docId },
      });
      return created.docId;
    } catch {
      // server refused or store unavailable
      return null;
    }
  } finally {
    void index.close();
  }
}

/** Open beside's Room log choice: offered only in a series, and never when a room log itself is the main document. */
export function roomLogChoices(here: BesideHere): readonly BesideChoice[] {
  const { library } = here.services;
  if (library.documentKind(here.docId).get() !== "series") return [];
  if (library.docKindOf(here.docId).get() === "room_log") return [];
  if (library.documentProject(here.docId).get() === null) return [];
  return [{ label: ROOM_LOG_WORDS.entry, open: openOrCreateRoomLog }];
}
