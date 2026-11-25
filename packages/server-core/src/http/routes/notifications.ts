// HTTP routes for workspace notification settings: list status and set/remove adapter addresses.
import { indexDocId, isNotificationsSetRequest } from "@manent/sync-protocol";
import type {
  NotificationsOutcome,
  NotificationsRefusal,
} from "../../notifications/service.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";

const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const STATUS: Readonly<Record<NotificationsRefusal, number>> = {
  bad_request: 400,
  forbidden: 403,
};

const answer = <T>(outcome: NotificationsOutcome<T>): Response =>
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

export const notificationRoutes: readonly Route[] = [
  {
    method: "GET",
    path: "/api/workspace/notifications",
    handle(context) {
      const { notify, sync } = context.config;
      if (sync?.mode === "relay" || notify === undefined)
        return failure("not_found", 404);
      const user = context.user();
      if (user === null) return failure("unauthenticated", 401);
      const workspaceId = new URL(context.request.url).searchParams.get(
        "workspaceId",
      );
      if (workspaceId === null || !WORKSPACE_ID.test(workspaceId))
        return failure("bad_request", 400);
      if (isRelayedWorkspace(sync?.mode, workspaceId))
        return failure("not_found", 404);
      return answer(notify.get(user.userId, workspaceId));
    },
  },
  {
    method: "POST",
    path: "/api/workspace/notifications/set",
    async handle(context) {
      const { notify, sync } = context.config;
      if (sync?.mode === "relay" || notify === undefined)
        return failure("not_found", 404);
      const user = context.user();
      if (user === null) return failure("unauthenticated", 401);
      const read = await readJsonBody(context.request);
      if (!read.ok || !isNotificationsSetRequest(read.body))
        return failure("bad_request", 400);
      const { workspaceId, adapter, address } = read.body;
      if (isRelayedWorkspace(sync?.mode, workspaceId))
        return failure("not_found", 404);
      return answer(notify.set(user.userId, workspaceId, adapter, address));
    },
  },
];
