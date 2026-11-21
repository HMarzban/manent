// The production routes: the state, lock, pages, layout, unlock, end, issue, recall and the issued files.
import {
  COLOUR_ORDER_IDS,
  ISSUE_FILES,
  NUMBERING_SCHEMES,
  PAGE_OPS,
  isDocId,
} from "@manent/sync-protocol";
import type {
  FileRequest,
  IssueFile,
  IssueRequest,
  LayoutRequest,
  LockRequest,
  PagesRequest,
  RecallRequest,
} from "@manent/sync-protocol";
import { refused } from "../../production/outcome.ts";
import type { ProductionOutcome } from "../../production/outcome.ts";
import type { ProductionService } from "../../production/service.ts";
import { failure, json } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";
import { isObject } from "./docs.ts";

/** The largest body of a production request, in bytes. */
const PRODUCTION_BODY_BYTES = 1_048_576;

type Fields = Record<string, unknown>;

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const memberOf = <T extends string>(
  list: readonly T[],
  value: unknown,
): T | null => list.find((member) => member === value) ?? null;

function readFiles(value: unknown): IssueFile[] | null {
  if (!Array.isArray(value)) return null;
  const files = value.flatMap((f) => memberOf(ISSUE_FILES, f) ?? []);
  return files.length === value.length ? files : null;
}

const answer = <T>(outcome: ProductionOutcome<T>): Response =>
  outcome.ok ? json(outcome.value) : json(outcome.body, outcome.status);

const pdf = (outcome: ProductionOutcome<Uint8Array>): Response =>
  outcome.ok
    ? new Response(new Uint8Array(outcome.value), {
        headers: { "Content-Type": "application/pdf" },
      })
    : json(outcome.body, outcome.status);

const badRequest = (): Response => answer(refused("bad_request"));

/**
 * The body as text, read a chunk at a time; null when its declared length passes
 * PRODUCTION_BODY_BYTES, before any of it is read, or once what is read passes it.
 */
async function readText(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > PRODUCTION_BODY_BYTES) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body !== null)
    for await (const chunk of request.body) {
      size += chunk.byteLength;
      if (size > PRODUCTION_BODY_BYTES) return null;
      chunks.push(chunk);
    }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function readBody(
  request: Request,
): Promise<(Fields & { docId: string }) | null> {
  const text = await readText(request);
  if (text === null) return null;
  try {
    const body: unknown = JSON.parse(text);
    if (!isObject(body) || !isDocId(body.docId)) return null;
    return { ...body, docId: body.docId };
  } catch {
    // a body that is not JSON is a bad request
    return null;
  }
}

/** True when this node relays the document: its production state is the authority's. */
function isRelayed(context: RouteContext, docId: string): boolean {
  const mode = context.config.sync?.mode;
  return (
    mode === "relay" || (typeof mode === "function" && mode(docId) === "relay")
  );
}

/** A POST route: the body read up to PRODUCTION_BODY_BYTES, then read by `read` and asked of the service. */
function route<B extends { docId: string }>(
  path: string,
  read: (body: Fields & { docId: string }) => B | null,
  ask: (
    service: ProductionService,
    userId: string,
    body: B,
  ) => Promise<Response>,
): Route {
  return {
    method: "POST",
    path,
    async handle(context) {
      const service = context.config.production;
      if (service === undefined) return failure("not_found", 404);
      const identity = context.user();
      if (identity === null) return failure("unauthenticated", 401);
      const fields = await readBody(context.request);
      const body = fields === null ? null : read(fields);
      if (body === null) return badRequest();
      if (isRelayed(context, body.docId)) return failure("not_found", 404);
      return ask(service, identity.userId, body);
    },
  };
}

function readMutating(body: Fields & { docId: string }) {
  const { docId, key } = body;
  return typeof key === "string" ? { docId, key } : null;
}

function readLock(body: Fields & { docId: string }): LockRequest | null {
  const mutating = readMutating(body);
  const numbering = memberOf(NUMBERING_SCHEMES, body.numbering);
  const colourOrder = memberOf(COLOUR_ORDER_IDS, body.colourOrder);
  const { lockedOn } = body;
  if (mutating === null || numbering === null || colourOrder === null)
    return null;
  return typeof lockedOn === "string"
    ? { ...mutating, numbering, colourOrder, lockedOn }
    : null;
}

function readPages(body: Fields & { docId: string }): PagesRequest | null {
  const mutating = readMutating(body);
  const op = memberOf(PAGE_OPS, body.op);
  const { labels, label } = body;
  if (mutating === null || op === null || !isStrings(labels)) return null;
  if (label !== null && typeof label !== "string") return null;
  return { ...mutating, op, labels, label };
}

function readLayout(body: Fields & { docId: string }): LayoutRequest | null {
  const mutating = readMutating(body);
  const { changes, affected } = body;
  if (mutating === null || !Array.isArray(changes) || !isObject(affected))
    return null;
  const read = changes.flatMap((change: unknown) =>
    isObject(change) && typeof change.key === "string" && "value" in change
      ? [{ key: change.key, value: change.value }]
      : [],
  );
  const { gainAPages, fallShort } = affected;
  if (read.length !== changes.length) return null;
  if (!isStrings(gainAPages) || !isStrings(fallShort)) return null;
  return { ...mutating, changes: read, affected: { gainAPages, fallShort } };
}

/** What an issue and a correction both send. */
function readSending(body: Fields) {
  const { pages, memo, issuedOn, tint } = body;
  const files = readFiles(body.files);
  if (!isStrings(pages) || typeof memo !== "string" || files === null)
    return null;
  return typeof issuedOn === "string" && typeof tint === "boolean"
    ? { pages, memo, issuedOn, files, tint }
    : null;
}

function readIssue(body: Fields & { docId: string }): IssueRequest | null {
  const mutating = readMutating(body);
  const sending = readSending(body);
  const what = memberOf(["changed", "full"], body.what);
  const { expectedOrdinal, recipientUserIds } = body;
  if (mutating === null || sending === null || what === null) return null;
  if (!Number.isSafeInteger(expectedOrdinal) || !isStrings(recipientUserIds))
    return null;
  return {
    ...mutating,
    ...sending,
    expectedOrdinal: Number(expectedOrdinal),
    what,
    recipientUserIds,
  };
}

function readRecall(body: Fields & { docId: string }): RecallRequest | null {
  const mutating = readMutating(body);
  const sending = readSending(body);
  const { setId } = body;
  if (mutating === null || sending === null || typeof setId !== "string")
    return null;
  return { ...mutating, ...sending, setId };
}

function readFile(body: Fields & { docId: string }): FileRequest | null {
  const { docId, issueId } = body;
  const file = memberOf(ISSUE_FILES, body.file);
  return typeof issueId === "string" && file !== null
    ? { docId, issueId, file }
    : null;
}

export const productionRoutes: Route[] = [
  route(
    "/api/production/state",
    ({ docId }) => ({ docId }),
    async (service, userId, { docId }) => answer(service.state(userId, docId)),
  ),
  route("/api/production/lock", readLock, async (service, userId, body) =>
    answer(await service.lock(userId, body)),
  ),
  route("/api/production/pages", readPages, async (service, userId, body) =>
    answer(await service.pages(userId, body)),
  ),
  route("/api/production/layout", readLayout, async (service, userId, body) =>
    answer(await service.layout(userId, body)),
  ),
  route("/api/production/unlock", readMutating, async (service, userId, body) =>
    answer(await service.unlock(userId, body)),
  ),
  route("/api/production/end", readMutating, async (service, userId, body) =>
    answer(await service.end(userId, body)),
  ),
  route("/api/production/issue", readIssue, async (service, userId, body) =>
    answer(await service.issue(userId, body)),
  ),
  route("/api/production/recall", readRecall, async (service, userId, body) =>
    answer(await service.recall(userId, body)),
  ),
  route("/api/production/file", readFile, async (service, userId, body) =>
    pdf(await service.file(userId, body)),
  ),
];
