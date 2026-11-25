// Public REST API routes (/api/v1/*): authenticated strictly by workspace API key, never by user session.
import type { HttpErrorCode } from "@manent/sync-protocol";
import type {
  PublicApiRefusal,
  PublicApiService,
} from "../../public-api/service.ts";
import { failure, json } from "../respond.ts";
import type { Route, RouteContext } from "../route.ts";

function refusalResponse(
  code: PublicApiRefusal,
  retryAfterSec?: number,
): Response {
  switch (code) {
    case "unauthenticated":
      return failure("unauthenticated", 401);
    case "forbidden":
      return failure("forbidden", 403);
    case "bad_request":
      return failure("bad_request", 400);
    case "not_found":
      return failure("not_found", 404);
    case "unsupported_kind":
      return failure("unsupported_kind", 415);
    case "invalid":
      return failure("invalid", 422);
    case "rate_limited": {
      const error: HttpErrorCode = "rate_limited";
      return new Response(JSON.stringify({ error }), {
        status: 429,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Retry-After": String(Math.max(1, retryAfterSec ?? 1)),
        },
      });
    }
    default: {
      const unreachable: never = code;
      return failure(unreachable, 400);
    }
  }
}

function queryParam(request: Request, name: string): string | null {
  const value = new URL(request.url).searchParams.get(name);
  return value === null || value.length === 0 ? null : value;
}

function publicApiOf(context: RouteContext): PublicApiService | null {
  if (context.config.sync?.mode === "relay") return null;
  return context.config.publicApi ?? null;
}

export const publicApiRoutes: readonly Route[] = [
  {
    method: "GET",
    path: "/api/v1/folder",
    async handle(context) {
      const service = publicApiOf(context);
      if (service === null) return failure("not_found", 404);
      const authHeader = context.request.headers.get("authorization");
      const folderId = queryParam(context.request, "folderId");
      const result = await service.folder(authHeader, folderId);
      if (!result.ok) {
        return refusalResponse(result.code, result.retryAfterSec);
      }
      return json(result.value);
    },
  },
  {
    method: "GET",
    path: "/api/v1/lines",
    async handle(context) {
      const service = publicApiOf(context);
      if (service === null) return failure("not_found", 404);
      const authHeader = context.request.headers.get("authorization");
      const docId = queryParam(context.request, "docId") ?? "";
      const result = await service.lines(authHeader, docId);
      if (!result.ok) {
        return refusalResponse(result.code, result.retryAfterSec);
      }
      return json(result.value);
    },
  },
  {
    method: "GET",
    path: "/api/v1/fdx",
    async handle(context) {
      const service = publicApiOf(context);
      if (service === null) return failure("not_found", 404);
      const authHeader = context.request.headers.get("authorization");
      const docId = queryParam(context.request, "docId") ?? "";
      const result = await service.fdx(authHeader, docId);
      if (!result.ok) {
        return refusalResponse(result.code, result.retryAfterSec);
      }
      return new Response(result.value.xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="${result.value.filename}"`,
        },
      });
    },
  },
  {
    method: "GET",
    path: "/api/v1/ink",
    async handle(context) {
      const service = publicApiOf(context);
      if (service === null) return failure("not_found", 404);
      const authHeader = context.request.headers.get("authorization");
      const docId = queryParam(context.request, "docId") ?? "";
      const result = await service.ink(authHeader, docId);
      if (!result.ok) {
        return refusalResponse(result.code, result.retryAfterSec);
      }
      return new Response(result.value.json, {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    },
  },
];
