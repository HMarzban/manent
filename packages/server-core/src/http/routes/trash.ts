// HTTP routes for Trash: moving a document to Trash, restoring it, and listing Trash by workspace.
import { isDocId } from "@manent/sync-protocol";
import type {
  TrashListRequest,
  TrashMoveRequest,
  TrashRestoreRequest,
} from "@manent/sync-protocol";
import type {
  TrashOutcome,
  TrashRefusal,
  TrashService,
} from "../../library/service.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";
import { isObject } from "./docs.ts";

const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const STATUS: Readonly<Record<TrashRefusal, number>> = {
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  deleted: 410,
  busy: 429,
};

interface Caller {
  service: TrashService;
  userId: string;
}

function served(context: RouteContext): Caller | Response {
  const { sync, trash } = context.config;
  if (sync === null || sync.mode === "relay" || trash === undefined)
    return failure("not_found", 404);
  const identity = context.user();
  if (identity === null) return failure("unauthenticated", 401);
  return { service: trash, userId: identity.userId };
}

function postRoute<B, T>(
  path: string,
  read: (body: unknown) => B | null,
  ask: (caller: Caller, body: B) => Promise<TrashOutcome<T>>,
  relayed?: (
    body: B,
    mode: (docId: string) => "authority" | "relay",
  ) => boolean,
): Route {
  return {
    method: "POST",
    path,
    async handle(context) {
      const caller = served(context);
      if (caller instanceof Response) return caller;
      const parsed = await readJsonBody(context.request);
      const body = parsed.ok ? read(parsed.body) : null;
      if (body === null) return failure("bad_request", 400);
      const mode = context.config.sync?.mode;
      if (
        typeof mode === "function" &&
        relayed !== undefined &&
        relayed(body, mode)
      )
        return failure("not_found", 404);
      const outcome = await ask(caller, body);
      return outcome.ok
        ? json<T>(outcome.value)
        : failure(outcome.code, STATUS[outcome.code]);
    },
  };
}

function readDocBody(
  body: unknown,
): TrashMoveRequest | TrashRestoreRequest | null {
  if (!isObject(body) || !isDocId(body.docId)) return null;
  return { docId: body.docId };
}

function readListBody(body: unknown): TrashListRequest | null {
  if (
    !isObject(body) ||
    typeof body.workspaceId !== "string" ||
    !WORKSPACE_ID.test(body.workspaceId)
  )
    return null;
  return { workspaceId: body.workspaceId };
}

export const trashRoutes: readonly Route[] = [
  postRoute(
    "/api/trash/move",
    readDocBody,
    ({ service, userId }, body) => service.move(userId, body.docId),
    (body, mode) => mode(body.docId) === "relay",
  ),
  postRoute(
    "/api/trash/restore",
    readDocBody,
    ({ service, userId }, body) => service.restore(userId, body.docId),
    (body, mode) => mode(body.docId) === "relay",
  ),
  postRoute("/api/trash/list", readListBody, ({ service, userId }, body) =>
    service.list(userId, body.workspaceId),
  ),
];
