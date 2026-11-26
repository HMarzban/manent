// HTTP routes for workspace MOS configuration, handshake check, and per-rundown opt-in.
import { isDocId, isWorkspaceId } from "@manent/sync-protocol";
import type { Identity } from "@manent/sync-protocol";
import type { MosBridgeService } from "../../mos/bridge.ts";
import type { MosConfigOutcome, MosConfigRefusal } from "../../mos/config.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route } from "../route.ts";
import { isObject } from "./docs.ts";

export interface MosRouteCaller {
  mos: MosBridgeService;
  user(): Identity | null;
}

type MosRouteMatch =
  | { kind: "ws_get"; workspaceId: string | null }
  | { kind: "ws_put"; workspaceId: string | null }
  | { kind: "ws_delete"; workspaceId: string | null }
  | { kind: "ws_check"; workspaceId: string | null }
  | { kind: "rd_get"; docId: string | null }
  | { kind: "rd_put"; docId: string | null };

const PARAM_WS = new RegExp("^/api/workspaces/([^/]+)/mos$");
const PARAM_WS_CHECK = new RegExp("^/api/workspaces/([^/]+)/mos/check$");
const PARAM_RD = new RegExp("^/api/prompter/([^/]+)/mos$");

const STATUS: Readonly<Record<MosConfigRefusal, number>> = {
  bad_request: 400,
  host_not_allowed: 400,
  forbidden: 403,
  not_found: 404,
  deleted: 410,
};

function respond<T>(outcome: MosConfigOutcome<T>): Response {
  if (outcome.ok) return json(outcome.value);
  if (outcome.code === "host_not_allowed")
    return json({ error: "host_not_allowed" }, 400);
  return failure(outcome.code, STATUS[outcome.code]);
}

function matchMosRoute(method: string, pathname: string): MosRouteMatch | null {
  if (pathname === "/api/workspace/mos") {
    if (method === "GET") return { kind: "ws_get", workspaceId: null };
    if (method === "PUT" || method === "POST")
      return { kind: "ws_put", workspaceId: null };
    if (method === "DELETE") return { kind: "ws_delete", workspaceId: null };
  }
  if (pathname === "/api/workspace/mos/check" && method === "POST")
    return { kind: "ws_check", workspaceId: null };
  if (pathname === "/api/prompter/mos") {
    if (method === "GET") return { kind: "rd_get", docId: null };
    if (method === "PUT" || method === "POST")
      return { kind: "rd_put", docId: null };
  }

  const wsCheck = PARAM_WS_CHECK.exec(pathname);
  if (wsCheck !== null && method === "POST")
    return { kind: "ws_check", workspaceId: wsCheck[1]! };
  const ws = PARAM_WS.exec(pathname);
  if (ws !== null) {
    if (method === "GET") return { kind: "ws_get", workspaceId: ws[1]! };
    if (method === "PUT" || method === "POST")
      return { kind: "ws_put", workspaceId: ws[1]! };
    if (method === "DELETE") return { kind: "ws_delete", workspaceId: ws[1]! };
  }
  const rd = PARAM_RD.exec(pathname);
  if (rd !== null) {
    if (method === "GET") return { kind: "rd_get", docId: rd[1]! };
    if (method === "PUT" || method === "POST")
      return { kind: "rd_put", docId: rd[1]! };
  }
  return null;
}

async function readOptionalObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const read = await readJsonBody(request);
  return read.ok && isObject(read.body) ? read.body : null;
}

/** Handles workspace MOS config, check, and per-rundown opt-in routes (GET/PUT/POST/DELETE). */
export async function answerMosRequest(
  request: Request,
  caller: MosRouteCaller,
): Promise<Response | null> {
  const url = new URL(request.url);
  const matched = matchMosRoute(request.method, url.pathname);
  if (matched === null) return null;
  const user = caller.user();
  if (user === null) return failure("unauthenticated", 401);

  if (matched.kind === "ws_get" || matched.kind === "ws_delete") {
    const wsId = matched.workspaceId ?? url.searchParams.get("workspaceId");
    if (!isWorkspaceId(wsId)) return failure("bad_request", 400);
    return matched.kind === "ws_get"
      ? respond(await caller.mos.getWorkspace(user.userId, wsId))
      : respond(await caller.mos.deleteWorkspace(user.userId, wsId));
  }

  if (matched.kind === "ws_put") {
    const body = await readOptionalObject(request);
    if (body === null) return failure("bad_request", 400);
    const wsId =
      matched.workspaceId ??
      (typeof body.workspaceId === "string" ? body.workspaceId : null);
    if (!isWorkspaceId(wsId)) return failure("bad_request", 400);
    return respond(await caller.mos.saveWorkspace(user.userId, wsId, body));
  }

  if (matched.kind === "ws_check") {
    const body = await readOptionalObject(request);
    const wsId =
      matched.workspaceId ??
      (typeof body?.workspaceId === "string"
        ? body.workspaceId
        : url.searchParams.get("workspaceId"));
    if (!isWorkspaceId(wsId)) return failure("bad_request", 400);
    const override = body !== null && "host" in body ? body : undefined;
    return respond(
      await caller.mos.checkWorkspace(user.userId, wsId, override),
    );
  }

  if (matched.kind === "rd_get") {
    const docId = matched.docId ?? url.searchParams.get("docId");
    if (!isDocId(docId)) return failure("bad_request", 400);
    return respond(await caller.mos.getRundown(user.userId, docId));
  }

  const body = await readOptionalObject(request);
  if (body === null) return failure("bad_request", 400);
  const docId =
    matched.docId ?? (typeof body.docId === "string" ? body.docId : null);
  const workspaceId =
    typeof body.workspaceId === "string" ? body.workspaceId : "";
  const enabled = body.enabled;
  const roSlug = typeof body.roSlug === "string" ? body.roSlug : undefined;
  if (
    !isDocId(docId) ||
    !isWorkspaceId(workspaceId) ||
    typeof enabled !== "boolean"
  )
    return failure("bad_request", 400);
  return respond(
    await caller.mos.setRundown(user.userId, docId, {
      workspaceId,
      enabled,
      ...(roSlug !== undefined ? { roSlug } : {}),
    }),
  );
}

const STATIC_MOS_ROUTES: readonly { method: Route["method"]; path: string }[] =
  [
    { method: "GET", path: "/api/workspace/mos" },
    { method: "POST", path: "/api/workspace/mos" },
    { method: "POST", path: "/api/workspace/mos/check" },
    { method: "GET", path: "/api/prompter/mos" },
    { method: "POST", path: "/api/prompter/mos" },
  ];

export const MOS_ROUTES: readonly Route[] = STATIC_MOS_ROUTES.map((route) => ({
  method: route.method,
  path: route.path,
  async handle(context) {
    const mos = context.config.mos;
    if (mos === undefined) return failure("not_found", 404);
    const answered = await answerMosRequest(context.request, {
      mos,
      user: context.user,
    });
    return answered ?? failure("not_found", 404);
  },
}));
