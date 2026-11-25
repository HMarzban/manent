// HTTP route for full-text search: GET /api/search?q=<query>&workspaceId=<id>&tz=<IANA zone>.
import { SEARCH_QUERY_MAX_LEN, indexDocId } from "@manent/sync-protocol";
import type { SearchResponse } from "@manent/sync-protocol";
import type { SearchRefusal } from "../../search/service.ts";
import { failure, json } from "../respond.ts";
import type { Route } from "../route.ts";

const WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const STATUS: Readonly<Record<SearchRefusal, number>> = {
  bad_request: 400,
  forbidden: 403,
};

export const searchRoutes: readonly Route[] = [
  {
    method: "GET",
    path: "/api/search",
    handle(context) {
      const { sync, search, auth } = context.config;
      if (sync === null || sync.mode === "relay" || search === undefined)
        return failure("not_found", 404);
      const identity = context.user();
      if (identity === null) return failure("unauthenticated", 401);
      const params = new URL(context.request.url).searchParams;
      const q = params.get("q");
      if (
        q === null ||
        q.trim().length === 0 ||
        q.length > SEARCH_QUERY_MAX_LEN
      )
        return failure("bad_request", 400);
      const rawWorkspace = params.get("workspaceId");
      const workspaceId =
        rawWorkspace === null || rawWorkspace === "" ? null : rawWorkspace;
      if (workspaceId !== null && !WORKSPACE_ID.test(workspaceId))
        return failure("bad_request", 400);
      if (
        typeof sync.mode === "function" &&
        workspaceId !== null &&
        sync.mode(indexDocId("workspace", workspaceId)) === "relay"
      )
        return failure("not_found", 404);
      const tz = params.get("tz");
      const knownWorkspaces = auth.directory
        .workspacesOf(identity.userId)
        .map((w) => w.id);
      const outcome = search.search(identity.userId, {
        q,
        workspaceId,
        tz,
        knownWorkspaces,
      });
      return outcome.ok
        ? json<SearchResponse>(outcome.value)
        : failure(outcome.code, STATUS[outcome.code]);
    },
  },
];
