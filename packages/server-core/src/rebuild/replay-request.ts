// A replay request's body read into a request and its updates, and the answer stored under a key
// read back.
import {
  decodeReplayUpdates,
  isDocId,
  isReplayKey,
} from "@manent/sync-protocol";
import type {
  ReplayOverlap,
  ReplayRequest,
  ReplayResponse,
  ReplaySetAside,
} from "@manent/sync-protocol";
import type { ReplayRow } from "@manent/storage";
import type { SyncLimits } from "../sync/ports.ts";

type Read =
  | { ok: true; request: ReplayRequest; updates: Uint8Array[] }
  | { ok: false; code: "bad_request" | "too_large" };

const isCount = (value: unknown, least: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= least;
const isText = (value: unknown): value is string => typeof value === "string";
const isTextOrNull = (value: unknown): value is string | null =>
  value === null || isText(value);

/** The fields of a JSON object; null for anything else. */
function fieldsOf(value: unknown): ((name: string) => unknown) | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return (name) => Reflect.get(value, name);
}

/**
 * The body as a request and its updates. Its size is the length of the updates' base64 text,
 * which is nearly all of a body, and is checked before any of it is decoded.
 */
export function readRequest(body: unknown, limits: SyncLimits): Read {
  const bad: Read = { ok: false, code: "bad_request" };
  const field = fieldsOf(body);
  if (field === null) return bad;
  const [docId, generation, lastServerSeq, key, given] = [
    "docId",
    "generation",
    "lastServerSeq",
    "key",
    "updates",
  ].map(field);
  if (!isDocId(docId) || !isReplayKey(key) || !Array.isArray(given)) return bad;
  if (!isCount(generation, 1) || !isCount(lastServerSeq, 0)) return bad;
  if (!given.every(isText)) return bad;
  const size = given.reduce((sum, text) => sum + text.length, 0);
  if (size > limits.replayBodyBytes) return { ok: false, code: "too_large" };
  const updates = decodeReplayUpdates(given);
  if (updates === null) return bad;
  const request = { docId, generation, lastServerSeq, key, updates: given };
  return { ok: true, request, updates };
}

function isOverlap(value: unknown): value is ReplayOverlap {
  const field = fieldsOf(value);
  return field !== null && isText(field("blockId")) && isText(field("text"));
}

function isSetAside(value: unknown): value is ReplaySetAside {
  const field = fieldsOf(value);
  if (field === null || !isText(field("text"))) return false;
  return isTextOrNull(field("blockId")) && isTextOrNull(field("nearBlockId"));
}

/** The answer stored under a key. RangeError when what is stored is not one. */
export function storedResponse(row: ReplayRow): ReplayResponse {
  const broken = new RangeError(
    `the answer stored under ${row.key} is not one`,
  );
  const stored: unknown = JSON.parse(row.result);
  const field = fieldsOf(stored);
  if (field === null) throw broken;
  const docId = field("docId");
  const generation = field("generation");
  const applied = field("applied");
  const overlaps = field("overlaps");
  const setAside = field("setAside");
  if (!isText(docId) || !isCount(generation, 1) || !isCount(applied, 0))
    throw broken;
  if (!Array.isArray(overlaps) || !overlaps.every(isOverlap)) throw broken;
  if (!Array.isArray(setAside) || !setAside.every(isSetAside)) throw broken;
  return { docId, generation, serverSeq: row.seq, applied, overlaps, setAside };
}
