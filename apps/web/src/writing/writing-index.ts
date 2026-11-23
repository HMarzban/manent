// What the person's private index says of their writing: the position kept per script and their private copies.
import type { JsonMapView } from "@manent/crdt";
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
