// The routes a device hands a document over with, and asks what it may do with one.
import {
  CrdtUpdateError,
  applyInspecting,
  createDoc,
  updateMeta,
} from "@manent/crdt";
import { rejects, validateBlocks } from "@manent/schema";
import type { DocFile, Home, Storage } from "@manent/storage";
import {
  commentsDocId,
  decodeReplayUpdates,
  isDocId,
  isDocKind,
} from "@manent/sync-protocol";
import type {
  AdoptRequest,
  AdoptResponse,
  DescribeResponse,
  DocKind,
} from "@manent/sync-protocol";
import { validateCommentsState } from "../../comments/validate.ts";
import {
  keepAdoptedWorkflow,
  readAdoptedWorkflow,
} from "../../production/adoption.ts";
import type { AdoptedWorkflow } from "../../production/adoption.ts";
import { SYNCED_KINDS, createDocumentAccess } from "../../sync/access.ts";
import type { CreateResult, DocumentAccess } from "../../sync/access.ts";
import { INDEX_KINDS } from "../../sync/index-docs.ts";
import { DEFAULT_LIMITS } from "../../sync/ports.ts";
import { failure, json } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";
import { isObject, readRequest } from "./docs.ts";

/** A 64 MiB state in base64, with room for the rest of the body. */
const ADOPT_BODY_LIMIT_BYTES = 96 * 1024 * 1024;

type Refusal =
  Extract<CreateResult, { ok: false }>["code"] | "too_large" | "invalid";

const STATUS: Readonly<Record<Refusal, number>> = {
  bad_request: 400,
  unsupported_kind: 400,
  forbidden: 403,
  exists_elsewhere: 409,
  deleted: 410,
  too_large: 413,
  invalid: 422,
};

const refuse = (code: Refusal): Response => failure(code, STATUS[code]);

/** The body as JSON, refused as soon as it is known to be over `limit` bytes, before it is read whole. */
async function readLimitedJson(
  request: Request,
  limit: number,
): Promise<
  { ok: true; body: unknown } | { ok: false; code: "too_large" | "bad_request" }
> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit) return { ok: false, code: "too_large" };
  const utf8 = new TextDecoder();
  let text = "";
  let size = 0;
  for await (const chunk of request.body ?? []) {
    size += chunk.byteLength;
    if (size > limit) return { ok: false, code: "too_large" };
    text += utf8.decode(chunk, { stream: true });
  }
  try {
    return { ok: true, body: JSON.parse(text + utf8.decode()) };
  } catch {
    // not JSON: the body is refused as a bad request
    return { ok: false, code: "bad_request" };
  }
}

const isText = (value: unknown): value is string => typeof value === "string";

/** The body's fields, each of the right kind; null when one is missing or is not. */
function adoptionOf(body: unknown): AdoptRequest | null {
  if (!isObject(body)) return null;
  const { key, docId, kind, home, workspaceId, state, scriptDocId } = body;
  if (!isDocId(key) || !isDocId(docId) || !isText(kind) || !isText(home))
    return null;
  if (!isText(state) || !(workspaceId === null || isText(workspaceId)))
    return null;
  if (scriptDocId !== undefined && !isText(scriptDocId)) return null;
  const workflow = readAdoptedWorkflow(body);
  if (workflow === null) return null;
  return {
    key,
    docId,
    kind,
    home,
    workspaceId,
    state,
    ...(scriptDocId === undefined ? {} : { scriptDocId }),
    ...workflow,
  };
}

/** True when a version's blocks hold what the editor never writes. */
const holdsInvalid = ({ versions }: AdoptedWorkflow): boolean =>
  versions.some(({ content }) =>
    rejects(validateBlocks(content.blocks, { isIdTaken: () => false })),
  );

/** A client id's clock range in an update, `toClock` exclusive. */
interface Meta {
  clientId: number;
  toClock: number;
}

/**
 * The state's bytes and their client ids when they are one whole update whose blocks validate,
 * applied to a document of their own; the settings maps come over, since the device wrote them as
 * the authority.
 */
function checkState(
  kind: DocKind,
  userId: string,
  state: string,
  documentBytes: number,
):
  | { ok: true; update: Uint8Array; metas: Meta[] }
  | { ok: false; code: "bad_request" | "too_large" | "invalid" } {
  const [update] = decodeReplayUpdates([state]) ?? [];
  if (update === undefined) return { ok: false, code: "bad_request" };
  if (update.byteLength > documentBytes)
    return { ok: false, code: "too_large" };
  const doc = createDoc();
  try {
    const metas = updateMeta(update);
    const report = applyInspecting(doc, update);
    if (doc.hasPendingStructs()) return { ok: false, code: "bad_request" };
    const issues =
      kind === "comments"
        ? validateCommentsState(doc, report, userId)
        : validateBlocks(report?.touched() ?? [], {
            isIdTaken: () => false,
          });
    const refused = issues.some(
      (issue) => issue.severity === "reject" || issue.severity === "newer",
    );
    return refused
      ? { ok: false, code: "invalid" }
      : { ok: true, update, metas };
  } catch (error) {
    if (!(error instanceof CrdtUpdateError)) throw error;
    return { ok: false, code: "bad_request" };
  } finally {
    doc.destroy();
  }
}

const keyOf = (home: Home): string => `${home.kind}:${home.id}`;

/**
 * Rule 2: only the script's owner adopts its comments document (and with empty workflow),
 * and only an existing document's owner adopts into a pre-created headSeq === 0 entry.
 */
function authorizeAdoption(
  access: DocumentAccess,
  storage: Storage,
  userId: string,
  adoption: AdoptRequest,
): { ok: true; kind: DocKind } | { ok: false; code: Refusal } {
  const { docId, kind, home, workspaceId, scriptDocId, versions, production } =
    adoption;
  if (!isDocKind(kind) || ![...SYNCED_KINDS, ...INDEX_KINDS].includes(kind))
    return { ok: false, code: "unsupported_kind" };
  if (storage.directory.tombstoneOf(docId) !== null)
    return { ok: false, code: "deleted" };
  if (kind === "comments") {
    if (
      workspaceId !== null ||
      scriptDocId === undefined ||
      !isDocId(scriptDocId) ||
      commentsDocId(scriptDocId) !== docId ||
      versions.length > 0 ||
      production !== null
    )
      return { ok: false, code: "bad_request" };
    const script = access.resolve(userId, scriptDocId);
    if (!script.ok) return { ok: false, code: script.code };
    if (script.access.role !== "owner") return { ok: false, code: "forbidden" };
    return script.kind === "script" && keyOf(script.home) === home
      ? { ok: true, kind }
      : { ok: false, code: "bad_request" };
  }
  if (storage.directory.placeOf(docId) !== null) {
    const resolved = access.resolve(userId, docId);
    if (!resolved.ok) return { ok: false, code: resolved.code };
    if (resolved.access.role !== "owner")
      return { ok: false, code: "forbidden" };
  }
  return { ok: true, kind };
}

/**
 * Rule 1: the answer recorded when the document's file adopted it under `key` (`created` false);
 * null when it adopted nothing yet; "elsewhere" when it adopted it under another key.
 */
function recorded(
  storage: Storage,
  adoption: AdoptRequest,
): AdoptResponse | null | "elsewhere" {
  const { docId } = adoption;
  const place = storage.directory.placeOf(docId);
  if (place === null) return null;
  const file = storage.open(place.home);
  const row = file.adoptions.get(docId);
  if (row === null) return null;
  const doc = file.log.get(docId);
  if (row.key !== adoption.key || doc === null || !isDocKind(place.kind))
    return "elsewhere";
  return {
    docId,
    kind: place.kind,
    home: keyOf(place.home),
    generation: doc.generation,
    adoptedSeq: row.seq,
    created: false,
  };
}

/**
 * Rule 3, in one transaction: the state's client ids are the adopter's, the state is a row of the
 * log, the versions and production come with it, and the key is kept.
 */
function adoptInto(
  file: DocFile,
  write: { docId: string; key: string; userId: string; at: number },
  state: { update: Uint8Array; metas: readonly Meta[] },
  workflow: AdoptedWorkflow,
  generation: number,
): number {
  const { docId, key, userId, at } = write;
  const { update, metas } = state;
  const clocks = metas.map((m) => ({ clientId: m.clientId, clock: m.toClock }));
  return file.transaction(() => {
    const ids = metas.map((m) => m.clientId);
    file.log.registerClients(docId, userId, ids);
    const append = { docId, generation, update, userId, clocks };
    const seq = file.log.append({ ...append, origin: "import" });
    keepAdoptedWorkflow(file, docId, workflow, { generation, seq });
    file.adoptions.put({ docId, key, userId, seq, adoptedAt: at });
    return seq;
  });
}

const accessOf = (context: RouteContext, storage: Storage): DocumentAccess =>
  createDocumentAccess({ storage, versions: context.config.socket.versions });

async function adopt(context: RouteContext): Promise<Response> {
  const { config, request, user } = context;
  if (config.sync === null) return failure("not_found", 404);
  const identity = user();
  if (identity === null) return failure("unauthenticated", 401);
  const read = await readLimitedJson(request, ADOPT_BODY_LIMIT_BYTES);
  if (!read.ok) return refuse(read.code);
  const adoption = adoptionOf(read.body);
  if (adoption === null) return refuse("bad_request");
  const { storage, clock, limits } = config.sync;
  const before = recorded(storage, adoption);
  if (before === "elsewhere") return refuse("exists_elsewhere");
  if (before !== null) return json<AdoptResponse>(before);
  const { userId } = identity;
  const access = accessOf(context, storage);
  const authorized = authorizeAdoption(access, storage, userId, adoption);
  if (!authorized.ok) return refuse(authorized.code);
  const documentBytes = limits?.documentBytes ?? DEFAULT_LIMITS.documentBytes;
  const checked = checkState(
    authorized.kind,
    userId,
    adoption.state,
    documentBytes,
  );
  if (!checked.ok) return refuse(checked.code);
  if (holdsInvalid(adoption)) return refuse("invalid");
  const { docId, kind, home, workspaceId, key, scriptDocId } = adoption;
  const asked = {
    docId,
    kind,
    home,
    ...(workspaceId === null ? {} : { workspaceId }),
    ...(scriptDocId === undefined ? {} : { scriptDocId }),
  };
  const created = access.create(userId, asked);
  if (!created.ok) return refuse(created.code);
  const place = storage.directory.placeOf(docId);
  const row = place === null ? null : storage.open(place.home).log.get(docId);
  // a document someone has written to is not a device's to hand over
  if (place === null || row === null || row.headSeq > 0)
    return refuse("exists_elsewhere");
  const file = storage.open(place.home);
  // a version id is the file's: one another document holds is not this device's to give
  if (adoption.versions.some(({ id }) => file.history.get(id) !== null))
    return refuse("bad_request");
  const write = { docId, key, userId, at: clock.now() };
  const adoptedSeq = adoptInto(file, write, checked, adoption, row.generation);
  const { document } = created;
  return json<AdoptResponse>({
    ...document,
    adoptedSeq,
    created: true,
  });
}

async function describe(context: RouteContext): Promise<Response> {
  const read = await readRequest(context);
  if (!read.ok) return read.response;
  const { body, storage, userId } = read;
  if (!isObject(body) || !isDocId(body.docId)) return refuse("bad_request");
  const { docId } = body;
  const resolved = accessOf(context, storage).resolve(userId, docId);
  if (!resolved.ok) return refuse(resolved.code);
  const row = storage.open(resolved.home).log.get(docId);
  // placed and not yet in its file, as a create cut short leaves it: not one this person may use yet
  if (row === null) return refuse("forbidden");
  const { kind, home, access } = resolved;
  return json<DescribeResponse>({
    docId,
    kind,
    home: keyOf(home),
    generation: row.generation,
    role: access.role,
    capabilities: access.capabilities,
  });
}

export const adoptRoutes: Route[] = [
  { method: "POST", path: "/api/docs/adopt", handle: adopt },
  { method: "POST", path: "/api/docs/describe", handle: describe },
];
