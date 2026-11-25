// HTTP routes for project binary assets: PUT/GET/HEAD /api/projects/:projectId/assets/:assetId.
import type { ProjectAssetMeta } from "@manent/storage";
import type { AssetsRefusal, AssetsService } from "../../assets/service.ts";
import { MAX_ASSET_BYTES } from "../../assets/verify.ts";
import { failure } from "../respond.ts";
import type { RouteContext } from "../route.ts";

const ASSET_PATH_RE = /^\/api\/projects\/([^/]+)\/assets\/([^/]+)$/;

const STATUS: Readonly<Record<AssetsRefusal, number>> = {
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  too_large: 413,
  unsupported_kind: 415,
  invalid: 422,
};

function assetHeaders(meta: ProjectAssetMeta): Record<string, string> {
  return {
    "Content-Type": meta.mime,
    "Content-Length": String(meta.byteLength),
    ETag: `"${meta.assetId}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Asset-Width": String(meta.width),
    "X-Asset-Height": String(meta.height),
  };
}

/** Reads at most `limit` bytes from `request`; returns null when the body exceeds `limit`. */
async function readBoundedBytes(
  request: Request,
  limit: number,
): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const parsed = Number(declared);
    if (Number.isFinite(parsed) && parsed > limit) return null;
  }
  const stream = request.body;
  if (stream === null) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function matchesEtag(header: string | null, assetId: string): boolean {
  if (header === null) return false;
  const target = `"${assetId}"`;
  return header
    .split(",")
    .map((part) => part.trim())
    .some((tag) => tag === target || tag === `W/${target}` || tag === "*");
}

/**
 * Handles PUT/GET/HEAD `/api/projects/:projectId/assets/:assetId`.
 * Returns `null` when `pathname` does not match an asset route.
 */
export async function handleAssetRoute(
  pathname: string,
  context: RouteContext,
  service: AssetsService | null,
): Promise<Response | null> {
  const match = ASSET_PATH_RE.exec(pathname);
  if (match === null) return null;
  const method = context.request.method;
  if (method !== "PUT" && method !== "GET" && method !== "HEAD")
    return failure("not_found", 404);
  if (service === null || context.config.sync?.mode === "relay")
    return failure("not_found", 404);

  const identity = context.user();
  if (identity === null) return failure("unauthenticated", 401);

  const projectId = decodeURIComponent(match[1]!);
  const assetId = decodeURIComponent(match[2]!);

  if (method === "HEAD") {
    const outcome = service.head(identity.userId, projectId, assetId);
    if (!outcome.ok) return failure(outcome.code, STATUS[outcome.code]);
    return new Response(null, {
      status: 200,
      headers: assetHeaders(outcome.value),
    });
  }

  if (method === "GET") {
    const outcome = service.get(identity.userId, projectId, assetId);
    if (!outcome.ok) return failure(outcome.code, STATUS[outcome.code]);
    const headers = assetHeaders(outcome.value);
    if (matchesEtag(context.request.headers.get("if-none-match"), assetId))
      return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(outcome.value.bytes), {
      status: 200,
      headers,
    });
  }

  // PUT
  const bytes = await readBoundedBytes(context.request, MAX_ASSET_BYTES);
  if (bytes === null) return failure("too_large", 413);
  const outcome = service.put(identity.userId, projectId, assetId, bytes);
  if (!outcome.ok) return failure(outcome.code, STATUS[outcome.code]);
  return new Response(JSON.stringify(outcome.value.meta), {
    status: outcome.value.status === "stored" ? 201 : 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
