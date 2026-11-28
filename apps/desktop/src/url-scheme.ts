// Pure parsers and URL builders for macOS `manent://` and `file://` links into the desktop shell.
import { fileURLToPath } from "node:url";

const SCHEME_PREFIX = "manent://";
const FILE_SCHEME_PREFIX = "file://";
const SCRIPT_PREFIX = "s/";

export type OpenUrlTarget =
  { kind: "script"; path: string } | { kind: "file"; path: string };

function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function hasForbiddenChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || code === 0x5c || /\s/.test(text[i]!)) {
      return true;
    }
  }
  return false;
}

function hasTraversalSegment(pathname: string): boolean {
  const segments = pathname.split("/");
  for (let i = 1; i < segments.length; i++) {
    const raw = segments[i]!;
    if (raw === "" || raw === "." || raw === "..") return true;
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return true;
    }
    if (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      hasForbiddenChar(decoded)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Maps a `manent://s/<rest>` link (case-insensitive scheme) to a safe in-app `/s/<rest>` path.
 * Returns `null` for any other scheme/host, empty script id, traversal segment, or malformed URL.
 */
export function parseManentUrl(raw: string): string | null {
  if (raw === "" || hasForbiddenChar(raw)) return null;
  if (raw.slice(0, SCHEME_PREFIX.length).toLowerCase() !== SCHEME_PREFIX)
    return null;
  if (!raw.startsWith(SCRIPT_PREFIX, SCHEME_PREFIX.length)) return null;
  const rest = raw.slice(SCHEME_PREFIX.length + SCRIPT_PREFIX.length);
  if (
    rest === "" ||
    rest.startsWith("/") ||
    rest.startsWith("?") ||
    rest.startsWith("#")
  )
    return null;

  const rawPath = rest.split(/[?#]/, 1)[0] ?? "";
  if (hasTraversalSegment(`/s/${rawPath}`)) return null;

  let parsed: URL;
  try {
    parsed = new URL(`/s/${rest}`, "http://manent.local");
  } catch {
    return null;
  }
  if (parsed.origin !== "http://manent.local") return null;
  if (!parsed.pathname.startsWith("/s/") || parsed.pathname.length <= 3)
    return null;
  if (hasTraversalSegment(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Maps a local `file://` URL to a filesystem path via `fileURLToPath`.
 * Returns `null` for non-file URLs, remote hosts, control characters, empty/root paths, or invalid URLs.
 */
export function parseFileUrl(raw: string): string | null {
  if (raw === "" || hasControlChar(raw)) return null;
  if (
    raw.slice(0, FILE_SCHEME_PREFIX.length).toLowerCase() !== FILE_SCHEME_PREFIX
  )
    return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "file:") return null;
  if (parsed.hostname !== "" && parsed.hostname.toLowerCase() !== "localhost") {
    return null;
  }

  let path: string;
  try {
    path = fileURLToPath(parsed);
  } catch {
    return null;
  }
  if (
    path === "" ||
    path === "/" ||
    path.endsWith("/") ||
    path.endsWith("\\") ||
    hasControlChar(path)
  ) {
    return null;
  }
  return path;
}

/** Parses either a `manent://s/...` script link or a local `file://...` open-file URL. */
export function parseOpenUrl(raw: string): OpenUrlTarget | null {
  const scriptPath = parseManentUrl(raw);
  if (scriptPath !== null) return { kind: "script", path: scriptPath };
  const filePath = parseFileUrl(raw);
  if (filePath !== null) return { kind: "file", path: filePath };
  return null;
}

/** Builds the main window's initial URL, preserving any query parameters from `initialPath`. */
export function mainWindowUrl(
  nodeUrl: string,
  launchToken: string,
  initialPath: string | null,
): string {
  const url = new URL(initialPath ?? "/", nodeUrl);
  url.searchParams.set("launch", launchToken);
  return url.toString();
}

/** Builds an in-app navigation URL for an already-running main window. */
export function scriptWindowUrl(nodeUrl: string, path: string): string {
  const url = new URL(path, nodeUrl);
  url.searchParams.delete("launch");
  return url.toString();
}
