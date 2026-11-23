// A hand-in's stored answer read back for a retried key.
import type {
  HandInOverlap,
  HandInResponse,
  ReplaySetAside,
} from "@manent/sync-protocol";

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const isOptionalId = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isBlock = (value: unknown): value is HandInOverlap["mine"] =>
  isFields(value) && value.type === "block";

function readOverlap(value: unknown): HandInOverlap | null {
  if (!isFields(value)) return null;
  const { blockId, mine, theirs, otherUserIds } = value;
  if (typeof blockId !== "string" || !isBlock(mine) || !isBlock(theirs))
    return null;
  if (!Array.isArray(otherUserIds)) return null;
  const others = otherUserIds.filter(
    (id): id is string => typeof id === "string",
  );
  if (others.length !== otherUserIds.length) return null;
  return { blockId, mine, theirs, otherUserIds: others };
}

function readSetAside(value: unknown): ReplaySetAside | null {
  if (!isFields(value)) return null;
  const { blockId, nearBlockId, text } = value;
  if (!isOptionalId(blockId) || !isOptionalId(nearBlockId)) return null;
  return typeof text === "string" ? { blockId, nearBlockId, text } : null;
}

/** Each item read, or null when one of them does not read. */
function readAll<T>(
  value: unknown,
  read: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(read);
  return items.every((item): item is T => item !== null) ? items : null;
}

/** The answer a hand-in stored; null for text this service did not write. */
export function readStoredAnswer(text: string): HandInResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // stored text that is not JSON is no answer: the caller refuses the retry like a damaged one
    return null;
  }
  if (!isFields(parsed)) return null;
  const { versionId, scenes } = parsed;
  if (typeof versionId !== "string" || !isCount(scenes)) return null;
  const overlaps = readAll(parsed.overlaps, readOverlap);
  const setAside = readAll(parsed.setAside, readSetAside);
  if (overlaps === null || setAside === null) return null;
  return { versionId, scenes, overlaps, setAside };
}
