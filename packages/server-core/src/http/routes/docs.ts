// The routes that create and delete documents; both repeat safely, keyed by the document's id.
import type {
  CreateDocumentResponse,
  RemoveDocumentResponse,
} from "@manent/sync-protocol";
import { createDocumentAccess } from "../../sync/access.ts";
import type {
  CreateResult,
  DocumentAccess,
  RemoveResult,
} from "../../sync/access.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";
import type { ServerConfig } from "../server.ts";

/** Who hears of a removal made through a configuration: the sync service the server built from it. */
const removals = new WeakMap<ServerConfig, { removed(docId: string): void }>();

/** The server that serves `config` names the service told of each document deleted through it. */
export function hearRemovals(
  config: ServerConfig,
  service: { removed(docId: string): void },
): void {
  removals.set(config, service);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type CreateRefusal = Extract<CreateResult, { ok: false }>["code"];
type RemoveRefusal = Extract<RemoveResult, { ok: false }>["code"];

const CREATE_STATUS: Readonly<Record<CreateRefusal, number>> = {
  bad_request: 400,
  unsupported_kind: 400,
  forbidden: 403,
  exists_elsewhere: 409,
  deleted: 410,
};

const REMOVE_STATUS: Readonly<Record<RemoveRefusal, number>> = {
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
};

/** The caller, the body and the access rules; a Response when the request goes no further. */
async function readRequest(
  context: RouteContext,
): Promise<
  | { ok: true; userId: string; body: unknown; access: DocumentAccess }
  | { ok: false; response: Response }
> {
  const { config, request, user } = context;
  if (config.sync === null)
    return { ok: false, response: failure("not_found", 404) };
  const identity = user();
  if (identity === null)
    return { ok: false, response: failure("unauthenticated", 401) };
  const read = await readJsonBody(request);
  if (!read.ok) return { ok: false, response: failure("bad_request", 400) };
  const access = createDocumentAccess({
    storage: config.sync.storage,
    versions: config.socket.versions,
  });
  return { ok: true, userId: identity.userId, body: read.body, access };
}

export const docsRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/docs",
    async handle(context) {
      const read = await readRequest(context);
      if (!read.ok) return read.response;
      const created = read.access.create(read.userId, read.body);
      if (!created.ok)
        return failure(created.code, CREATE_STATUS[created.code]);
      return json<CreateDocumentResponse>(created.document);
    },
  },
  {
    method: "POST",
    path: "/api/docs/remove",
    async handle(context) {
      const read = await readRequest(context);
      if (!read.ok) return read.response;
      const removed = read.access.remove(read.userId, read.body);
      if (!removed.ok)
        return failure(removed.code, REMOVE_STATUS[removed.code]);
      // a removal succeeds only for a body whose docId is a document's id
      if (isObject(read.body) && typeof read.body.docId === "string")
        removals.get(context.config)?.removed(read.body.docId);
      return json<RemoveDocumentResponse>({ removed: true });
    },
  },
];
