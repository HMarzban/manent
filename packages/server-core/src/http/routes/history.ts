// The version history routes: listing, viewing, naming, saving, uploading and restoring versions.
import { isDocId, isVersionCursor } from "@manent/sync-protocol";
import type { HttpErrorCode } from "@manent/sync-protocol";
import type { HistoryOutcome, HistoryService } from "../../history/service.ts";
import { failure, json } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";
import type { ServerConfig } from "../server.ts";
import {
  HISTORY_BODY_BYTES,
  VERSION_PAGE_ROWS,
  queryPosition,
  readAuthors,
  readCount,
  readName,
  readRestore,
  readSave,
  readUpload,
} from "./history-parse.ts";

const STATUS: Readonly<Record<HttpErrorCode, number>> = {
  bad_request: 400,
  forbidden_host: 403,
  forbidden_origin: 403,
  not_found: 404,
  unauthenticated: 401,
  unknown_user: 404,
  deleted: 410,
  exists_elsewhere: 409,
  forbidden: 403,
  unsupported_kind: 400,
  busy: 429,
  generation_current: 409,
  incomplete: 422,
  invalid: 422,
  past_window: 409,
  too_large: 413,
  unknown_generation: 409,
  unreachable: 502,
  not_restorable: 409,
  already_issued: 409,
  already_locked: 409,
  changed: 409,
  engine_unavailable: 422,
  not_locked: 409,
  recall_closed: 409,
  unknown_label: 422,
  link_expired: 410,
  link_revoked: 410,
  not_member: 403,
  not_sent: 404,
  driver_taken: 409,
  not_driver: 409,
  already_handed_in: 409,
  no_private_copy: 404,
  not_in_rundown: 404,
  cannot_send: 409,
  rate_limited: 429,
};

const answer = <T>(outcome: HistoryOutcome<T>): Response =>
  outcome.ok
    ? json<T>(outcome.value)
    : failure(outcome.code, STATUS[outcome.code]);

/** The service and the caller, or the Response that ends the request: 404 while history is off, 401 without a user. */
function served(
  context: RouteContext,
): { history: HistoryService; userId: string } | Response {
  const { sync, history } = context.config;
  if (sync === null || history === undefined || sync.mode === "relay")
    return failure("not_found", 404);
  const identity = context.user();
  if (identity === null) return failure("unauthenticated", 401);
  return { history, userId: identity.userId };
}

/** True when the document is relayed by this node: its history is the authority's. */
function isRelayed(config: ServerConfig, docId: string): boolean {
  const mode = config.sync?.mode;
  return typeof mode === "function" && mode(docId) === "relay";
}

/**
 * The body as text, read a chunk at a time; null when its declared length passes
 * HISTORY_BODY_BYTES, before any of it is read, or once what is read passes it.
 */
async function readText(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > HISTORY_BODY_BYTES) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body !== null)
    for await (const chunk of request.body) {
      size += chunk.byteLength;
      if (size > HISTORY_BODY_BYTES) return null;
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

/** A GET route: the query read by `read`, then asked of the service. */
function getRoute<Q extends { docId: string }>(
  path: string,
  read: (query: URLSearchParams) => Q | null,
  ask: (
    history: HistoryService,
    userId: string,
    query: Q,
  ) => Promise<HistoryOutcome<unknown>>,
): Route {
  return {
    method: "GET",
    path,
    async handle(context) {
      const caller = served(context);
      if (caller instanceof Response) return caller;
      const query = read(new URL(context.request.url).searchParams);
      if (query === null) return failure("bad_request", 400);
      if (isRelayed(context.config, query.docId))
        return failure("not_found", 404);
      return answer(await ask(caller.history, caller.userId, query));
    },
  };
}

/** A POST route: the body read up to HISTORY_BODY_BYTES and parsed, then read by `read` and asked of the service. */
function postRoute<B extends { docId: string }>(
  path: string,
  read: (body: unknown) => HistoryOutcome<B>,
  ask: (
    history: HistoryService,
    userId: string,
    body: B,
  ) => Promise<HistoryOutcome<unknown>>,
): Route {
  return {
    method: "POST",
    path,
    async handle(context) {
      const caller = served(context);
      if (caller instanceof Response) return caller;
      const text = await readText(context.request);
      if (text === null) return failure("too_large", 413);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return failure("bad_request", 400);
      }
      const body = read(parsed);
      if (!body.ok) return answer(body);
      if (isRelayed(context.config, body.value.docId))
        return failure("not_found", 404);
      return answer(await ask(caller.history, caller.userId, body.value));
    },
  };
}

export const historyRoutes: Route[] = [
  getRoute(
    "/api/versions",
    (query) => {
      const docId = query.get("docId");
      const cursor = query.get("cursor");
      const limit = query.has("limit")
        ? readCount(query.get("limit"))
        : VERSION_PAGE_ROWS;
      if (!isDocId(docId) || limit === null || limit > VERSION_PAGE_ROWS)
        return null;
      if (cursor === null) return { docId, cursor: null, limit };
      if (!isVersionCursor(cursor)) return null;
      const split = cursor.indexOf(":");
      const createdAt = Number(cursor.slice(0, split));
      if (!Number.isSafeInteger(createdAt)) return null;
      return {
        docId,
        cursor: { createdAt, id: cursor.slice(split + 1) },
        limit,
      };
    },
    (history, userId, { docId, cursor, limit }) =>
      history.list(userId, docId, cursor, limit),
  ),
  getRoute(
    "/api/versions/content",
    (query) => {
      const docId = query.get("docId");
      const versionId = query.get("versionId");
      if (!isDocId(docId)) return null;
      if (versionId !== null)
        return versionId === "" ? null : { docId, at: { versionId } };
      const position = queryPosition(query);
      return position === null ? null : { docId, at: { position } };
    },
    (history, userId, { docId, at }) => history.content(userId, docId, at),
  ),
  postRoute("/api/versions/name", readName, (history, userId, body) =>
    history.name(userId, body),
  ),
  postRoute("/api/versions/save", readSave, (history, userId, body) =>
    history.save(userId, body),
  ),
  postRoute("/api/versions/upload", readUpload, (history, userId, body) =>
    history.upload(userId, body),
  ),
  postRoute("/api/versions/restore", readRestore, (history, userId, body) =>
    history.restore(userId, body),
  ),
  getRoute(
    "/api/versions/who",
    (query) => {
      const docId = query.get("docId");
      const blockId = query.get("blockId");
      return isDocId(docId) && blockId !== null && blockId !== ""
        ? { docId, blockId }
        : null;
    },
    (history, userId, { docId, blockId }) =>
      history.whoWrote(userId, docId, blockId),
  ),
  getRoute(
    "/api/versions/since",
    (query) => {
      const docId = query.get("docId");
      const position = queryPosition(query);
      return isDocId(docId) && position !== null ? { docId, position } : null;
    },
    (history, userId, { docId, position }) =>
      history.since(userId, docId, position),
  ),
  postRoute("/api/versions/authors", readAuthors, (history, userId, body) =>
    history.authors(userId, body),
  ),
];
