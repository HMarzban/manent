// History and production on the node: served here for a script it is the authority of, and sent on to
// the cloud as the person for a script it relays, whose versions and production the cloud sequences.
import {
  createHistoryService,
  createProductionService,
} from "@manent/server-core";
import type {
  HistoryExtras,
  HistoryService,
  ProductionService,
  SessionStore,
  SyncHooks,
  SyncService,
} from "@manent/server-core";
import { ConnectError } from "@manent/sync-client";
import type { ErrorResponse } from "@manent/sync-protocol";
import { readPerson } from "../auth/people.ts";
import type { NodeCoreOptions } from "./ports.ts";

export interface NodeWorkflow {
  readonly history: HistoryService;
  readonly production: ProductionService;
  /** Both services' hooks, told and asked only for a room in authority mode. */
  readonly hooks: readonly SyncHooks[];
  /** A history or production request for a relayed script, answered by the cloud; null for any other request, and for one from nobody chosen here. */
  forward(request: Request): Promise<Response | null>;
}

const isWorkflowPath = (path: string): boolean =>
  path === "/api/versions" ||
  path.startsWith("/api/versions/") ||
  path.startsWith("/api/production/");

/** The script a workflow request names: in the query of a GET, in the body of a POST; null for none. */
async function docIdOf(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  if (!isWorkflowPath(url.pathname)) return null;
  if (request.method === "GET") return url.searchParams.get("docId");
  // a body that is not JSON names nothing: the route refuses it
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  if (typeof body !== "object" || body === null || !("docId" in body))
    return null;
  return typeof body.docId === "string" ? body.docId : null;
}

/** `hook` as the node's sync service tells it: a relayed room's workflow events are the cloud's. */
function authorityOnly(
  hook: SyncHooks,
  isAuthority: (docId: string) => boolean,
): SyncHooks {
  return {
    committed(committed) {
      if (committed.room.mode === "authority") hook.committed?.(committed);
    },
    editorLeft(room, userId) {
      if (room.mode === "authority") hook.editorLeft?.(room, userId);
    },
    forgotten(room) {
      if (room.mode === "authority") hook.forgotten?.(room);
    },
    subscribed: (docId) =>
      isAuthority(docId) ? (hook.subscribed?.(docId) ?? null) : null,
    checkPush: (room, report) =>
      room.mode === "authority" ? (hook.checkPush?.(room, report) ?? []) : [],
  };
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
  > & { sessions: SessionStore; ids(): string; sync: () => SyncService },
): NodeWorkflow {
  const { storage, records, cloud, clock, ids, sync } = options;
  const isAuthority = (docId: string): boolean =>
    records.docState(docId) === null;
  // the history service and the production service take each other through getters
  const extras: HistoryExtras = {
    locksAt: (...args) => production.extras.locksAt(...args),
    authority: (...args) => production.extras.authority(...args),
  };
  const history = createHistoryService({ sync, storage, clock, ids, extras });
  const production = createProductionService({
    storage,
    sync,
    history,
    now: clock.now,
    ids,
    names: (userId) => options.directory.user(userId)?.name ?? userId,
    renderPdf: options.renderPdf,
    rules: options.registry,
  });
  return {
    history,
    production,
    hooks: [history, production.hooks].map((hook) =>
      authorityOnly(hook, isAuthority),
    ),
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
      try {
        return await cloud.forward(person.cloudToken, request);
      } catch (error) {
        if (!(error instanceof ConnectError)) throw error;
        return unreachable;
      }
    },
  };
}
