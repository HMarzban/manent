// Session-authenticated routes for workspace API key management; never accepts an API key.
import {
  isApiKeyCreateRequest,
  isApiKeyRevokeRequest,
} from "@manent/sync-protocol";
import type { PublicApiRefusal } from "../../public-api/service.ts";
import { failure, json, readJsonBody } from "../respond.ts";
import type { Route } from "../route.ts";

function mapStatus(code: PublicApiRefusal): number {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "unsupported_kind":
      return 415;
    case "invalid":
      return 422;
    case "rate_limited":
      return 429;
    case "bad_request":
      return 400;
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

export const apiKeyRoutes: readonly Route[] = [
  {
    method: "GET",
    path: "/api/workspace/api-keys",
    handle(context) {
      const user = context.user();
      if (user === null) return failure("unauthenticated", 401);
      const service = context.config.publicApi;
      if (service === undefined) return failure("not_found", 404);
      const workspaceId =
        new URL(context.request.url).searchParams.get("workspaceId") ?? "";
      const result = service.listKeys(user.userId, workspaceId);
      return result.ok
        ? json(result.value)
        : failure(result.code, mapStatus(result.code));
    },
  },
  {
    method: "POST",
    path: "/api/workspace/api-keys/create",
    async handle(context) {
      const user = context.user();
      if (user === null) return failure("unauthenticated", 401);
      const service = context.config.publicApi;
      if (service === undefined) return failure("not_found", 404);
      const parsed = await readJsonBody(context.request);
      if (!parsed.ok || !isApiKeyCreateRequest(parsed.body)) {
        return failure("bad_request", 400);
      }
      const result = await service.createKey(
        user.userId,
        parsed.body.workspaceId,
        parsed.body.name,
      );
      return result.ok
        ? json(result.value)
        : failure(result.code, mapStatus(result.code));
    },
  },
  {
    method: "POST",
    path: "/api/workspace/api-keys/revoke",
    async handle(context) {
      const user = context.user();
      if (user === null) return failure("unauthenticated", 401);
      const service = context.config.publicApi;
      if (service === undefined) return failure("not_found", 404);
      const parsed = await readJsonBody(context.request);
      if (!parsed.ok || !isApiKeyRevokeRequest(parsed.body)) {
        return failure("bad_request", 400);
      }
      const result = service.revokeKey(
        user.userId,
        parsed.body.workspaceId,
        parsed.body.id,
      );
      return result.ok
        ? json(result.value)
        : failure(result.code, mapStatus(result.code));
    },
  },
];
