// The built web app's files, never anything outside its directory.
import { realpath, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

const INDEX = "index.html";
const SW = "sw.js";
const MANIFEST_TYPE = "application/manifest+json; charset=utf-8";

/** Files a browser revalidates on every load via strong ETag. */
const FRESH = new Set([
  INDEX,
  "manifest.webmanifest",
  "benchmark-report.html",
  "third-party-notices.txt",
  "build-meta.json",
]);

const STATIC_EXT = new RegExp(
  "\\.(?:js|mjs|css|map|woff2?|ttf|otf|png|jpe?g|webp|svg|ico|json|webmanifest|wasm|txt)$",
  "i",
);

const IMMUTABLE_ASSET = new RegExp(
  "-(?:[a-z0-9]{8}\\.(?:js|css|woff2?|svg|png)|[0-9a-f]{8}\\.worker\\.js)$",
);

interface CachedTag {
  readonly mtimeNs: bigint;
  readonly size: bigint;
  readonly etag: string;
}

const etagCache = new Map<string, CachedTag>();

async function realFileInside(
  root: string,
  path: string,
): Promise<{ real: string; mtimeNs: bigint; size: bigint } | null> {
  const inside = (p: string) => p === root || p.startsWith(root + sep);
  if (!inside(path)) return null;
  try {
    const real = await realpath(path);
    if (!inside(real)) return null;
    const info = await stat(real, { bigint: true });
    return info.isFile()
      ? { real, mtimeNs: info.mtimeNs, size: info.size }
      : null;
  } catch {
    return null;
  }
}

function decodePath(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded.includes("\0") ? null : decoded;
  } catch {
    return null;
  }
}

function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) return false;
  return header
    .split(",")
    .map((part) => part.trim())
    .some((tag) => tag === etag || tag === `W/${etag}` || tag === "*");
}

function cacheControlFor(name: string): string {
  if (name === SW) return "no-cache, max-age=0, must-revalidate";
  if (FRESH.has(name)) return "no-cache";
  if (IMMUTABLE_ASSET.test(basename(name)))
    return "public, max-age=31536000, immutable";
  return "no-cache";
}

function contentTypeFor(name: string, filePath: string): string {
  if (name.endsWith(".webmanifest")) return MANIFEST_TYPE;
  return Bun.file(filePath).type;
}

function strongEtag(bytes: Uint8Array): string {
  const digest = new Bun.CryptoHasher("sha256")
    .update(bytes)
    .digest("hex")
    .slice(0, 32);
  return `"${digest}"`;
}

async function resolveEtagAndBytes(
  entry: { real: string; mtimeNs: bigint; size: bigint },
  immutable: boolean,
  needBytes: boolean,
): Promise<{ etag: string; bytes: Uint8Array<ArrayBuffer> | null }> {
  if (immutable) {
    const cached = etagCache.get(entry.real);
    if (
      cached !== undefined &&
      cached.mtimeNs === entry.mtimeNs &&
      cached.size === entry.size
    ) {
      return {
        etag: cached.etag,
        bytes: needBytes ? await Bun.file(entry.real).bytes() : null,
      };
    }
  }
  const bytes = await Bun.file(entry.real).bytes();
  const etag = strongEtag(bytes);
  if (immutable) {
    if (etagCache.size >= 512) etagCache.clear();
    etagCache.set(entry.real, {
      mtimeNs: entry.mtimeNs,
      size: entry.size,
      etag,
    });
  }
  return { etag, bytes: needBytes ? bytes : null };
}

function notFoundAsset(isHead: boolean): Response {
  return new Response(isHead ? null : "Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * The file at `pathname` inside `webDir`, else `404` for missing static asset extensions or the app's
 * `index.html` for SPA routes. Nothing outside `webDir` is ever served, through encoded separators or
 * symbolic links alike. Null when there is no web app. Supports `GET`, `HEAD`, strong `ETag`, and `304`.
 */
export async function serveStatic(
  webDir: string,
  pathname: string,
  request?: Pick<Request, "method" | "headers">,
): Promise<Response | null> {
  let root: string;
  try {
    root = await realpath(webDir);
  } catch {
    return null;
  }
  const isHead = request?.method === "HEAD";
  const decoded = decodePath(pathname);
  const asked = decoded === null ? null : resolve(root, `.${sep}${decoded}`);
  const named = asked === null ? null : await realFileInside(root, asked);
  if (named === null && STATIC_EXT.test(decoded ?? pathname))
    return notFoundAsset(isHead);

  const [entry, name] =
    named !== null && asked !== null
      ? [named, relative(root, asked).replaceAll("\\", "/")]
      : [await realFileInside(root, join(root, INDEX)), INDEX];
  if (entry === null) return null;

  const cacheControl = cacheControlFor(name);
  const immutable = cacheControl.includes("immutable");
  const ifNoneMatch = request?.headers.get("if-none-match") ?? null;
  const { etag, bytes } = await resolveEtagAndBytes(
    entry,
    immutable,
    !isHead && ifNoneMatch === null,
  );
  const headers: Record<string, string> = {
    "Content-Type": contentTypeFor(name, entry.real),
    "Cache-Control": cacheControl,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };
  if (matchesEtag(ifNoneMatch, etag))
    return new Response(null, { status: 304, headers });

  headers["Content-Length"] = String(entry.size);
  if (isHead) return new Response(null, { status: 200, headers });
  const body = bytes ?? (await Bun.file(entry.real).bytes());
  return new Response(body, { status: 200, headers });
}
