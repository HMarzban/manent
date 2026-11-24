// The project's facts as its index keeps them: each under a new id, anchored to a line with its episode and scene.
import type { JsonMapView } from "@manent/crdt";
import { isTextAnchor } from "@manent/schema";
import type { TextAnchor } from "@manent/schema";

/** One pinned fact as the project index's `facts` map stores it. */
export interface FactValue {
  readonly docId: string;
  /** Null outside a series. */
  readonly episodeId: string | null;
  readonly sceneHeadingId: string | null;
  /** The scene number shown when pinned, so the list never opens a script. */
  readonly sceneLabel: string | null;
  readonly anchor: TextAnchor;
  readonly byUserId: string;
  /** Milliseconds since the epoch when the fact was pinned. */
  readonly at: number;
}

/** One pinned fact with the id its entry is kept under. */
export interface FactEntry extends FactValue {
  readonly id: string;
}

const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

const isOptionalString = (value: unknown): value is string | null =>
  value === null || isNonEmptyString(value);

const isInstant = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

/** Reads one stored fact value; an entry in any other shape reads as absent (null). */
export function readFact(value: unknown): FactValue | null {
  if (!isFields(value)) return null;
  const { docId, episodeId, sceneHeadingId, sceneLabel, anchor, byUserId, at } =
    value;
  if (!isNonEmptyString(docId) || !isOptionalString(episodeId)) return null;
  if (!isOptionalString(sceneHeadingId) || !isOptionalString(sceneLabel))
    return null;
  if (
    !isTextAnchor(anchor) ||
    !isNonEmptyString(anchor.blockId) ||
    anchor.start > anchor.end
  )
    return null;
  if (!isNonEmptyString(byUserId) || !isInstant(at)) return null;
  return {
    docId,
    episodeId,
    sceneHeadingId,
    sceneLabel,
    anchor,
    byUserId,
    at,
  };
}

const newestFirst = (a: FactEntry, b: FactEntry): number =>
  b.at - a.at || a.id.localeCompare(b.id);

/** Every entry of the `facts` map in the shape of a fact, newest first; an entry in any other shape reads as absent. */
export function readFacts(map: JsonMapView): FactEntry[] {
  return Object.entries(map.entries())
    .flatMap(([id, value]) => {
      const fact = readFact(value);
      return fact === null ? [] : [{ id, ...fact }];
    })
    .toSorted(newestFirst);
}

/** The address that opens the fact's document with the caret at `blockId`. */
export function factUrl(docId: string, blockId: string): string {
  return `/s/${docId}?at=${encodeURIComponent(blockId)}`;
}
