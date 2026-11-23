// The private-copy routes: a writer's private copy of a script made, and handed in to the room.
import { isDocId, isReplayKey } from "@manent/sync-protocol";
import type {
  HandInRequest,
  PrivateCreateRequest,
} from "@manent/sync-protocol";
import type { HistoryService } from "../../history/service.ts";
import type {
  PrivateCopyOutcome,
  PrivateCopyRefusal,
  PrivateCopyService,
} from "../../private-copy/service.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";
import { isObject } from "./docs.ts";

const STATUS: Readonly<Record<PrivateCopyRefusal, number>> = {
  bad_request: 400,
  unsupported_kind: 400,
  forbidden: 403,
  no_private_copy: 404,
  already_handed_in: 409,
  deleted: 410,
  invalid: 422,
  busy: 429,
};

interface Caller {
  service: PrivateCopyService;
  history: HistoryService;
  userId: string;
}

/** The services and the caller, or the Response that ends the request: 404 while either service is off or this node relays, 401 without a user. */
function served(context: RouteContext): Caller | Response {
  const { sync, privateCopy, history } = context.config;
  if (sync === null || sync.mode === "relay") return failure("not_found", 404);
  if (privateCopy === undefined || history === undefined)
    return failure("not_found", 404);
  const identity = context.user();
  if (identity === null) return failure("unauthenticated", 401);
  return { service: privateCopy, history, userId: identity.userId };
}

/** A POST route: the body parsed and read by `read`, the document refused when this node relays it, then asked. */
function postRoute<B extends { docId: string }, T>(
  path: string,
  read: (body: unknown) => B | null,
  ask: (caller: Caller, body: B) => Promise<PrivateCopyOutcome<T>>,
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
      // a relayed document's private copies are the authority's, which the desktop forwards these paths to
      const mode = context.config.sync?.mode;
      if (typeof mode === "function" && mode(body.docId) === "relay")
        return failure("not_found", 404);
      const outcome = await ask(caller, body);
      return outcome.ok
        ? json<T>(outcome.value)
        : failure(outcome.code, STATUS[outcome.code]);
    },
  };
}

function readCreate(body: unknown): PrivateCreateRequest | null {
  if (!isObject(body) || !isDocId(body.docId)) return null;
  return { docId: body.docId };
}

function readHandIn(body: unknown): HandInRequest | null {
  if (!isObject(body) || !isDocId(body.docId) || !isReplayKey(body.key))
    return null;
  return { docId: body.docId, key: body.key };
}

export const PRIVATE_ROUTES: readonly Route[] = [
  postRoute("/api/private/create", readCreate, ({ service, userId }, body) =>
    service.create(userId, body),
  ),
  postRoute(
    "/api/private/handin",
    readHandIn,
    ({ service, history, userId }, body) =>
      service.handIn(userId, body, history.keep),
  ),
];
