// HTTP routes for workspace administration: people, role changes and workspace settings.
import {
  indexDocId,
  isWorkspaceId,
  isWorkspaceRoleRequest,
} from "@manent/sync-protocol";
import type {
  WorkspaceOutcome,
  WorkspaceRefusal,
} from "../../workspace/service.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";

const STATUS: Readonly<Record<WorkspaceRefusal, number>> = {
  bad_request: 400,
  invalid: 400,
  forbidden: 403,
  not_found: 404,
};

const answer = <T>(outcome: WorkspaceOutcome<T>): Response =>
  outcome.ok
    ? json(outcome.value)
    : failure(outcome.code, STATUS[outcome.code]);

function isRelayedWorkspace(
  mode: NonNullable<RouteContext["config"]["sync"]>["mode"],
  workspaceId: string,
): boolean {
  return (
    mode === "relay" ||
    (typeof mode === "function" &&
      mode(indexDocId("workspace", workspaceId)) === "relay")
  );
}

function readGetRoute(context: RouteContext):
  | {
      ok: true;
      userId: string;
      workspaceId: string;
      workspace: NonNullable<RouteContext["config"]["workspace"]>;
    }
  | { ok: false; response: Response } {
  const { workspace, sync } = context.config;
  if (sync?.mode === "relay" || workspace === undefined)
    return { ok: false, response: failure("not_found", 404) };
  const user = context.user();
  if (user === null)
    return { ok: false, response: failure("unauthenticated", 401) };
  const workspaceId = new URL(context.request.url).searchParams.get(
    "workspaceId",
  );
  if (!isWorkspaceId(workspaceId))
    return { ok: false, response: failure("bad_request", 400) };
  if (isRelayedWorkspace(sync?.mode, workspaceId))
    return { ok: false, response: failure("not_found", 404) };
  return { ok: true, userId: user.userId, workspaceId, workspace };
}

export const workspaceRoutes: readonly Route[] = [
  {
    method: "GET",
    path: "/api/workspace/people",
    handle(context) {
      const read = readGetRoute(context);
      if (!read.ok) return read.response;
      return answer(read.workspace.people(read.userId, read.workspaceId));
    },
  },
  {
    method: "POST",
    path: "/api/workspace/people/role",
    async handle(context) {
      const { workspace, sync } = context.config;
      if (sync?.mode === "relay" || workspace === undefined)
        return failure("not_found", 404);
      const user = context.user();
      if (user === null) return failure("unauthenticated", 401);
      const read = await readJsonBody(context.request);
      if (!read.ok || !isWorkspaceRoleRequest(read.body))
        return failure("bad_request", 400);
      const { workspaceId, userId, role } = read.body;
      if (isRelayedWorkspace(sync?.mode, workspaceId))
        return failure("not_found", 404);
      return answer(
        workspace.changeRole(user.userId, workspaceId, userId, role),
      );
    },
  },
  {
    method: "GET",
    path: "/api/workspace/settings",
    handle(context) {
      const read = readGetRoute(context);
      if (!read.ok) return read.response;
      return answer(read.workspace.settings(read.userId, read.workspaceId));
    },
  },
];
