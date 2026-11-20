// The service worker's precache list, made from what the build wrote. Runs at build time, under Bun.

export interface PrecacheEntry {
  url: string;
  /** SHA-256 of the file in hex; null when the name carries the content hash, so the URL is the revision. */
  revision: string | null;
}

// the shell the worker keeps: no source map and nothing else the build may write
const PRECACHED = new RegExp("\\.(html|js|css|woff2?)$");
// Bun names a chunk or an asset with an 8-character content hash
const HASHED = new RegExp("-[a-z0-9]{8}\\.");

const sha256Hex = (data: Uint8Array | string): string =>
  new Bun.CryptoHasher("sha256").update(data).digest("hex");

/** One entry per shell file of `outputs`, sorted by URL; a path outside `outDir` throws a RangeError. */
export function precacheEntries(
  outputs: readonly { path: string; bytes: Uint8Array }[],
  outDir: string,
): PrecacheEntry[] {
  const prefix = outDir.endsWith("/") ? outDir : `${outDir}/`;
  return (
    outputs
      .filter((output) => PRECACHED.test(output.path))
      .map((output) => {
        if (!output.path.startsWith(prefix))
          throw new RangeError(
            `a build output must be inside ${outDir}, not ${output.path}`,
          );
        const name = output.path.slice(prefix.length);
        const base = name.slice(name.lastIndexOf("/") + 1);
        return {
          url: `/${name}`,
          revision: HASHED.test(base) ? null : sha256Hex(output.bytes),
        };
      })
      // URLs are unique, so no two compare equal
      .toSorted((a, b) => (a.url < b.url ? -1 : 1))
  );
}

/** The build's identity: the first 16 hex digits of the SHA-256 of the list's JSON. */
export function buildId(entries: readonly PrecacheEntry[]): string {
  return sha256Hex(JSON.stringify(entries)).slice(0, 16);
}
