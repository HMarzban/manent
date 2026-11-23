// What the person's private index says of their writing: the position kept per script, their private copies, and
// whether an episode they open is theirs to write.
import { readEpisodes } from "@manent/crdt";
import type { JsonMapView } from "@manent/crdt";
import type { DocHandle, DocStatus, SideState } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import type { PersonServices } from "../services/ports.ts";
import { liveMap } from "../services/sync/private-index.ts";
import type { WritingPosition } from "../state/writing.store.ts";

const POSITIONS: readonly WritingPosition[] = [
  "everyone",
  "suggestions",
  "private",
];

/** The private index's maps the switch reads; `close` lets its handle go. */
export interface WritingIndex {
  /** By the room script's docId: `{ position, at }`, `at` in milliseconds since the epoch. */
  writing: JsonMapView;
  /** By the room script's docId: the person's private copy, written by the server only. */
  copies: JsonMapView;
  /** By docId: the workspace the person last opened it in. */
  continued: JsonMapView;
  /**
   * Calls `then` once the server has answered for the index: synced with nothing waiting, or a side state the server
   * raises; or once the device's link has dropped. An index the server holds no document for is answered too: made and then synced, when the device asked to
   * create it, or refused as `forbidden`, which the handle shows as a side state. The returned function stops waiting.
   */
  whenAnswered(then: () => void): () => void;
  close(): void;
}

/** A JSON object, as an index map or a server's answer holds one. */
export const isFields = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Whether the server holds everything of a document this device holds: true once it is synced; false once the link
 * has gone, or the server has refused the document, first; null while neither.
 */
export function syncedOf(status: DocStatus): boolean | null {
  if (status.synced && status.waiting === 0) return true;
  return status.link === "offline" || status.side.length > 0 ? false : null;
}

/** Whether each side state is the server's answer; `not_saved` is this device's store refusing a write. */
const SERVER_ANSWERS: Readonly<Record<SideState, boolean>> = Object.freeze({
  access_removed: true,
  deleted: true,
  read_only: true,
  rejected: true,
  not_saved: false,
  sign_in: true,
  server_old: true,
  view_only: true,
});

/**
 * Whether the server has answered for the person's index, or the device's link has dropped. An offline link with no
 * drop recorded is not enough: a following tab shows that until the leading tab first tells it the index's status.
 */
function isAnswered(status: DocStatus): boolean {
  if (status.synced && status.waiting === 0) return true;
  if (status.link === "offline" && status.wentOfflineAt !== null) return true;
  return status.side.some((side) => SERVER_ANSWERS[side]);
}

export async function openWritingIndex(
  services: Pick<PersonServices, "userId" | "openHandle">,
): Promise<WritingIndex> {
  const handle = await services.openHandle(indexDocId("user", services.userId));
  return {
    writing: liveMap(handle, "writing"),
    copies: liveMap(handle, "private_copies"),
    continued: liveMap(handle, "continue"),
    whenAnswered(then) {
      if (isAnswered(handle.status.get())) {
        then();
        return () => {};
      }
      const stop = handle.status.subscribe((status) => {
        if (!isAnswered(status)) return;
        stop();
        then();
      });
      return stop;
    },
    close() {
      void handle.close().catch(() => {
        // a handle of a sync disposed already holds nothing more to release
      });
    },
  };
}

/** The position kept for `docId`; null when none is kept, or what is kept does not read as one. */
export function keptPosition(
  index: WritingIndex,
  docId: string,
): WritingPosition | null {
  const entry = index.writing.get(docId);
  const position = isFields(entry) ? entry.position : null;
  return POSITIONS.find((each) => each === position) ?? null;
}

/** The person's latest private copy of `docId`; null when the index holds none, or what it holds does not read as one. */
export function copyEntryOf(
  index: WritingIndex,
  docId: string,
): { privateDocId: string; handedIn: boolean } | null {
  const entry = index.copies.get(docId);
  if (!isFields(entry) || typeof entry.privateDocId !== "string") return null;
  return {
    privateDocId: entry.privateDocId,
    handedIn: entry.handedInAt !== null,
  };
}

/** Closes `handle` once `read` has read what it needs of its document. */
async function readThenClose<T>(
  handle: Promise<DocHandle>,
  read: (held: DocHandle) => T,
): Promise<T> {
  const held = await handle;
  try {
    return read(held);
  } finally {
    void held.close();
  }
}

/** The project of `docId`, as the workspace the person last opened it in lists it; null while that is not known here. */
export async function projectOf(
  services: Pick<PersonServices, "openHandle">,
  index: WritingIndex,
  docId: string,
): Promise<string | null> {
  const continued = index.continued.get(docId);
  const workspaceId = isFields(continued) ? continued.workspaceId : null;
  if (typeof workspaceId !== "string") return null;
  const entry = await readThenClose(
    services.openHandle(indexDocId("workspace", workspaceId)),
    (handle) => liveMap(handle, "documents").get(docId),
  );
  const projectId = isFields(entry) ? entry.projectId : null;
  return typeof projectId === "string" ? projectId : null;
}

/** Whether the project `projectId` names `userId` the writer of the episode whose script is `docId`. */
export async function isWriterOf(
  services: Pick<PersonServices, "userId" | "projectIndex">,
  projectId: string,
  docId: string,
): Promise<boolean> {
  const project = services.projectIndex(projectId);
  try {
    const episodes = readEpisodes((await project.handle()).doc());
    return [...episodes.values()].some(
      (episode) =>
        episode.docIds.script === docId &&
        episode.writerUserId === services.userId,
    );
  } finally {
    void project.close();
  }
}
