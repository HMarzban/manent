// History and production on the node: served here for a script it is the authority of, and sent on to
// the cloud as the person for a script it relays, whose versions and production the cloud sequences.
import { createWorkflow } from "@manent/server-core";
import type {
  HistoryService,
  ProductionService,
  SessionStore,
  SyncService,
} from "@manent/server-core";
import { ConnectError } from "@manent/sync-client";
import type { ErrorResponse } from "@manent/sync-protocol";
import { readPerson } from "../auth/people.ts";
import type { RelayBridge } from "../relay/bridge.ts";
import type { NodeCoreOptions } from "./ports.ts";
import { WORKFLOW_PATHS } from "./workflow-paths.ts";

export interface NodeWorkflow {
  readonly history: HistoryService;
  readonly production: ProductionService;
  /** A history or production request for a relayed script, answered by the cloud; null for any other request, and for one from nobody chosen here. */
  forward(request: Request): Promise<Response | null>;
}

const RESTORE_PATH = "/api/versions/restore";

const isWorkflowPath = (path: string): boolean =>
  WORKFLOW_PATHS.some((entry) =>
    entry.match === "exact" ? path === entry.path : path.startsWith(entry.path),
  );

/** An unsigned 32-bit integer, as a Yjs client ID is. */
const isClientId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 0xffff_ffff;

/** A POST's body as JSON; null for one that is not JSON, which names nothing: the route refuses it. */
const bodyOf = (request: Request): Promise<unknown> =>
  request
    .clone()
    .json()
    .catch(() => null);

/** The script a workflow request names: in the query of a GET, in the body of a POST; null for none. */
async function docIdOf(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  if (!isWorkflowPath(url.pathname)) return null;
  if (request.method === "GET") return url.searchParams.get("docId");
  const body = await bodyOf(request);
  if (typeof body !== "object" || body === null || !("docId" in body))
    return null;
  return typeof body.docId === "string" ? body.docId : null;
}

/**
 * A restore the window asks to have written under a client ID it keeps, asking instead for one
 * the person's upstream document keeps: for a relayed script that document, not the window, sets
 * aside the restored text someone removes without having seen it. Any other request, and one for
 * a script whose hand-off has not finished, as it is.
 */
async function keptUpstream(
  request: Request,
  reserve: () => Promise<number | null>,
): Promise<Request> {
  const { pathname } = new URL(request.url);
  if (request.method !== "POST" || pathname !== RESTORE_PATH) return request;
  const body = await bodyOf(request);
  if (typeof body !== "object" || body === null || !("clientId" in body))
    return request;
  const clientId = isClientId(body.clientId) ? await reserve() : null;
  if (clientId === null) return request;
  const sent = JSON.stringify({ ...body, clientId });
  return new Request(request, { method: "POST", body: sent });
}

export function createNodeWorkflow(
  options: Pick<
    NodeCoreOptions,
    | "storage"
    | "records"
    | "cloud"
    | "clock"
    | "directory"
    | "registry"
    | "renderPdf"
  > & {
    sessions: SessionStore;
    ids(): string;
    sync: () => SyncService;
    reserveClientId: RelayBridge["reserveClientId"];
  },
): NodeWorkflow {
  const { storage, records, cloud, clock, ids, sync } = options;
  const isAuthority = (docId: string): boolean =>
    records.docState(docId) === null;
  const { history, production } = createWorkflow({
    storage,
    sync,
    clock,
    ids,
    names: (userId) => options.directory.user(userId)?.name ?? userId,
    renderPdf: options.renderPdf,
    rules: options.registry,
  });
  return {
    history,
    production,
    async forward(request) {
      const docId = await docIdOf(request);
      if (docId === null || isAuthority(docId)) return null;
      const person = readPerson(request, {
        sessions: options.sessions,
        records,
      });
      if (person === null) return null;
      const unreachable = Response.json(
        { error: "unreachable" } satisfies ErrorResponse,
        { status: 503 },
      );
      if (person.cloudToken === null) return unreachable;
      const { userId, cloudToken } = person;
      const sent = await keptUpstream(request, () =>
        options.reserveClientId(userId, docId),
      );
      try {
        return await cloud.forward(cloudToken, sent);
      } catch (error) {
        if (!(error instanceof ConnectError)) throw error;
        return unreachable;
      }
    },
  };
}
