// The service worker's precache list, made from what the build wrote. Runs at build time, under Bun.

export interface PrecacheEntry {
  url: string;
  /** SHA-256 of the file in hex; null when the name carries the content hash, so the URL is the revision. */
  revision: string | null;
}

export interface BuiltOutput {
  path: string;
  bytes: Uint8Array;
}

// the shell the worker keeps: no source map, no legacy PDF-only .woff font, and nothing else the build may write
const PRECACHED = new RegExp("\\.(html|js|css|woff2|webmanifest)$");
const ICON_PRECACHED = new RegExp("^/icons/.+\\.(svg|png)$");
const LEGACY_FONT = new RegExp("\\.woff$");
// Bun names a chunk or an asset with an 8-character content hash
const HASHED = new RegExp("-[a-z0-9]{8}\\.");

// Windows paths use backslashes; URLs and the prefix check use slashes on every platform
const toSlashes = (path: string): string => path.replaceAll("\\", "/");

const sha256Hex = (data: Uint8Array | string): string =>
  new Bun.CryptoHasher("sha256").update(data).digest("hex");

function normalizeOutput(
  output: BuiltOutput,
  outDir: string,
  prefix: string,
): { url: string; base: string; bytes: Uint8Array } {
  const path = toSlashes(output.path);
  if (!path.startsWith(prefix))
    throw new RangeError(
      `a build output must be inside ${outDir}, not ${output.path}`,
    );
  const name = path.slice(prefix.length);
  const base = name.slice(name.lastIndexOf("/") + 1);
  return { url: `/${name}`, base, bytes: output.bytes };
}

function prefixOf(outDir: string): string {
  const dir = toSlashes(outDir);
  return dir.endsWith("/") ? dir : `${dir}/`;
}

const isPrecachedUrl = (url: string): boolean =>
  PRECACHED.test(url) || ICON_PRECACHED.test(url);

const isRuntimeUrl = (url: string): boolean =>
  isPrecachedUrl(url) || LEGACY_FONT.test(url);

/**
 * One entry per shell file of `outputs`, sorted by URL; a path outside `outDir` throws a RangeError.
 * URLs in `options.exclude` stay out of the eager precache and are cached on demand at runtime instead.
 */
export function precacheEntries(
  outputs: readonly BuiltOutput[],
  outDir: string,
  options?: { readonly exclude?: ReadonlySet<string> },
): PrecacheEntry[] {
  const prefix = prefixOf(outDir);
  const exclude = options?.exclude;
  return (
    outputs
      .map((output) => normalizeOutput(output, outDir, prefix))
      .filter(
        ({ url }) =>
          isPrecachedUrl(url) && (exclude === undefined || !exclude.has(url)),
      )
      .map(({ url, base, bytes }) => {
        const alwaysRevisioned =
          ICON_PRECACHED.test(url) || url.endsWith(".webmanifest");
        return {
          url,
          revision:
            !alwaysRevisioned && HASHED.test(base) ? null : sha256Hex(bytes),
        };
      })
      // URLs are unique, so no two compare equal
      .toSorted((a, b) => (a.url < b.url ? -1 : 1))
  );
}

/**
 * One revisioned entry per runtime output (precached shell, excluded on-demand assets, hashed Ink worker,
 * legacy `.woff` fonts, manifest, and icons), sorted by URL so any file change rotates `buildId`.
 */
export function allBuildEntries(
  outputs: readonly BuiltOutput[],
  outDir: string,
): PrecacheEntry[] {
  const prefix = prefixOf(outDir);
  return outputs
    .map((output) => normalizeOutput(output, outDir, prefix))
    .filter(({ url }) => isRuntimeUrl(url))
    .map(({ url, bytes }) => ({ url, revision: sha256Hex(bytes) }))
    .toSorted((a, b) => (a.url < b.url ? -1 : 1));
}

/**
 * Root-relative URLs warmed in the background after install: excluded on-demand JS chunks,
 * the hashed Ink worker, and emitted `.woff` fonts, sorted and deduplicated.
 */
export function warmAssetUrls(
  outputs: readonly BuiltOutput[],
  outDir: string,
  exclude?: ReadonlySet<string>,
): string[] {
  const prefix = prefixOf(outDir);
  const urls = new Set<string>();
  for (const output of outputs) {
    const { url } = normalizeOutput(output, outDir, prefix);
    if ((exclude !== undefined && exclude.has(url)) || LEGACY_FONT.test(url))
      urls.add(url);
  }
  return [...urls].toSorted((a, b) => (a < b ? -1 : 1));
}

/** The build's identity: the first 16 hex digits of the SHA-256 of the list's JSON. */
export function buildId(entries: readonly PrecacheEntry[]): string {
  return sha256Hex(JSON.stringify(entries)).slice(0, 16);
}
