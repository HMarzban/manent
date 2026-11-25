// Request body and query parameter parsing for the version history HTTP routes.
import { rejects, validateBlocks } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { isDocId } from "@manent/sync-protocol";
import type {
  AuthorsRequest,
  HttpErrorCode,
  NameRequest,
  RestoreRequest,
  SaveRequest,
  UploadRequest,
  VersionPosition,
} from "@manent/sync-protocol";
import type { HistoryOutcome } from "../../history/service.ts";
import { isClientId } from "./docs-info.ts";
import { isObject } from "./docs.ts";

/** The largest upload or restore body, in bytes. */
export const HISTORY_BODY_BYTES = 67_108_864;
/** Versions on one page of the list, at most and by default. */
export const VERSION_PAGE_ROWS = 500;

const UPLOAD_KINDS = [
  "device",
  "saved",
  "named",
  "pre_restore",
  "pre_merge",
  "recovered",
] as const;

const refused = (code: HttpErrorCode) => ({ ok: false, code }) as const;

/** A whole number of at least 1 written in digits; null for anything else. */
export function readCount(text: string | null): number | null {
  if (text === null || !/^[1-9]\d*$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 1;

function readPosition(value: unknown): VersionPosition | null {
  if (!isObject(value)) return null;
  const { generation, seq } = value;
  return isCount(generation) && isCount(seq) ? { generation, seq } : null;
}

/** `generation` and `seq` of the query; null when either is missing or not a count. */
export function queryPosition(query: URLSearchParams): VersionPosition | null {
  const generation = readCount(query.get("generation"));
  const seq = readCount(query.get("seq"));
  return generation === null || seq === null ? null : { generation, seq };
}

/** True when the schema refuses none of `blocks`: each is then a block as `BlockJSON` describes it. */
const isBlockList = (blocks: readonly unknown[]): blocks is BlockJSON[] =>
  !rejects(validateBlocks(blocks, { isIdTaken: () => false }));

/** A device version's document: a doc of sections of blocks; `invalid` when the schema refuses a block. */
function readDeviceDoc(
  value: unknown,
): HistoryOutcome<UploadRequest["version"]["content"]> {
  if (!isObject(value) || value.type !== "doc") return refused("bad_request");
  const sections = value.content ?? [];
  if (!Array.isArray(sections)) return refused("bad_request");
  const content: { type: "section"; content: BlockJSON[] }[] = [];
  for (const section of sections) {
    if (!isObject(section) || section.type !== "section")
      return refused("bad_request");
    const blocks = section.content ?? [];
    if (!Array.isArray(blocks)) return refused("bad_request");
    if (!isBlockList(blocks)) return refused("invalid");
    content.push({ type: "section", content: blocks });
  }
  return { ok: true, value: { type: "doc", content } };
}

export function readUpload(body: unknown): HistoryOutcome<UploadRequest> {
  if (!isObject(body) || !isDocId(body.docId) || !isObject(body.version))
    return refused("bad_request");
  const { id, kind, name, deviceId, schemaVersion } = body.version;
  const known = UPLOAD_KINDS.find((member) => member === kind);
  if (typeof id !== "string" || known === undefined)
    return refused("bad_request");
  if (name !== null && typeof name !== "string") return refused("bad_request");
  if (typeof deviceId !== "string" || !isCount(schemaVersion))
    return refused("bad_request");
  const content = readDeviceDoc(body.version.content);
  if (!content.ok) return content;
  const version = {
    id,
    kind: known,
    name,
    deviceId,
    content: content.value,
    schemaVersion,
  };
  return { ok: true, value: { docId: body.docId, version } };
}

export function readName(body: unknown): HistoryOutcome<NameRequest> {
  if (!isObject(body) || !isDocId(body.docId)) return refused("bad_request");
  const { docId, key, name, fromVersionId } = body;
  if (typeof key !== "string" || typeof name !== "string")
    return refused("bad_request");
  if (fromVersionId !== null && typeof fromVersionId !== "string")
    return refused("bad_request");
  return { ok: true, value: { docId, key, name, fromVersionId } };
}

export function readSave(body: unknown): HistoryOutcome<SaveRequest> {
  if (!isObject(body) || !isDocId(body.docId)) return refused("bad_request");
  const { docId, key, kind } = body;
  if (typeof key !== "string" || (kind !== "saved" && kind !== "export"))
    return refused("bad_request");
  return { ok: true, value: { docId, key, kind } };
}

export function readRestore(body: unknown): HistoryOutcome<RestoreRequest> {
  if (!isObject(body) || !isDocId(body.docId) || !isObject(body.scope))
    return refused("bad_request");
  const { docId, key, versionId } = body;
  const { kind, headingId, rowId } = body.scope;
  // a build from before the field sends none: no device asked to keep what the restore writes
  const clientId = body.clientId ?? null;
  if (typeof key !== "string" || typeof versionId !== "string")
    return refused("bad_request");
  if (clientId !== null && !isClientId(clientId)) return refused("bad_request");
  const request = { docId, key, versionId, clientId };
  if (kind === "script")
    return { ok: true, value: { ...request, scope: { kind } } };
  if (kind === "scene" && typeof headingId === "string")
    return { ok: true, value: { ...request, scope: { kind, headingId } } };
  if (kind === "row" && typeof rowId === "string" && rowId !== "")
    return { ok: true, value: { ...request, scope: { kind, rowId } } };
  return refused("bad_request");
}

export function readAuthors(body: unknown): HistoryOutcome<AuthorsRequest> {
  if (!isObject(body) || !isDocId(body.docId) || !isObject(body.since))
    return refused("bad_request");
  const { docId, blockIds } = body;
  const { versionId, position } = body.since;
  if (
    !Array.isArray(blockIds) ||
    !blockIds.every((id) => typeof id === "string")
  )
    return refused("bad_request");
  if (typeof versionId === "string")
    return { ok: true, value: { docId, since: { versionId }, blockIds } };
  const at = readPosition(position);
  if (at === null) return refused("bad_request");
  return { ok: true, value: { docId, since: { position: at }, blockIds } };
}
