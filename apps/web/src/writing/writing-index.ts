// What the person's private index says of their writing: the position kept per script, their private copies, and
// whether an episode they open is theirs to write.
import { readEpisodes } from "@manent/crdt";
import type { JsonMapView } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
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
  close(): void;
}

/** A JSON object, as an index map or a server's answer holds one. */
export const isFields = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function openWritingIndex(
  services: Pick<PersonServices, "userId" | "openHandle">,
): Promise<WritingIndex> {
  const handle = await services.openHandle(indexDocId("user", services.userId));
  return {
    writing: liveMap(handle, "writing"),
    copies: liveMap(handle, "private_copies"),
    continued: liveMap(handle, "continue"),
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
