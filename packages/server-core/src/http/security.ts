// Build metadata lookup and HTTP security headers shared by routes and static files.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface BuildMeta {
  readonly buildId: string;
  readonly bootScriptHash: string;
}

interface CachedMeta {
  readonly mtimeNs: bigint;
  readonly size: bigint;
  readonly ino: bigint;
  readonly meta: BuildMeta | null;
}

const META_FILE = "build-meta.json";
const metaCache = new Map<string, CachedMeta>();

const BASE_SECURITY_HEADERS: readonly [string, string][] = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "no-referrer"],
  [
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  ],
];

function parseBuildMeta(raw: string): BuildMeta | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const buildId = Reflect.get(parsed, "buildId");
    const bootScriptHash = Reflect.get(parsed, "bootScriptHash");
    if (
      typeof buildId !== "string" ||
      buildId.length === 0 ||
      typeof bootScriptHash !== "string" ||
      bootScriptHash.length === 0
    )
      return null;
    return { buildId, bootScriptHash };
  } catch {
    return null;
  }
}

/** Reads `<webDir>/build-meta.json`, cached by file stat so rebuilds refresh automatically. */
export function readBuildMeta(webDir: string | null): BuildMeta | null {
  if (webDir === null) return null;
  const path = join(webDir, META_FILE);
  try {
    const info = statSync(path, { bigint: true });
    const cached = metaCache.get(path);
    if (
      cached !== undefined &&
      cached.mtimeNs === info.mtimeNs &&
      cached.size === info.size &&
      cached.ino === info.ino
    )
      return cached.meta;
    const meta = parseBuildMeta(readFileSync(path, "utf8"));
    metaCache.set(path, {
      mtimeNs: info.mtimeNs,
      size: info.size,
      ino: info.ino,
      meta,
    });
    return meta;
  } catch {
    metaCache.delete(path);
    return null;
  }
}

/** Strict Content-Security-Policy for Manent HTML documents given the boot script's SHA-256 hash. */
export function htmlCsp(bootScriptHash: string): string {
  return `default-src 'none'; script-src 'self' '${bootScriptHash}'; worker-src 'self'; child-src 'self'; manifest-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
}

/** Adds baseline security headers, API cache/build headers, and HTML CSP without clobbering existing directives. */
export function applySecurityHeaders(
  response: Response,
  options: { readonly isApi: boolean; readonly meta: BuildMeta | null },
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of BASE_SECURITY_HEADERS)
    if (!headers.has(name)) headers.set(name, value);
  if (options.isApi) {
    if (!headers.has("cache-control")) headers.set("Cache-Control", "no-store");
    if (options.meta !== null)
      headers.set("X-Manent-Build-Id", options.meta.buildId);
  }
  const type = (headers.get("content-type") ?? "").toLowerCase();
  if (
    type.startsWith("text/html") &&
    options.meta !== null &&
    !headers.has("content-security-policy")
  )
    headers.set(
      "Content-Security-Policy",
      htmlCsp(options.meta.bootScriptHash),
    );
  const noBody = response.status === 204 || response.status === 304;
  return new Response(noBody ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
