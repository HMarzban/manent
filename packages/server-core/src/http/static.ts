// The built web app's files, never anything outside its directory.
import { realpath, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const INDEX = "index.html";

/** Files a browser asks for again on every load: the page, and the service worker that serves it. */
const FRESH = new Set([INDEX, "sw.js"]);

async function realFileInside(
  root: string,
  path: string,
): Promise<string | null> {
  const inside = (p: string) => p === root || p.startsWith(root + sep);
  if (!inside(path)) return null;
  try {
    const real = await realpath(path);
    return inside(real) && (await stat(real)).isFile() ? real : null;
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

/**
 * The file at `pathname` inside `webDir`, else the app's `index.html` so that
 * app routes load the app. Nothing outside `webDir` is ever served, through
 * encoded separators or symbolic links alike. Null when there is no web app.
 * `index.html` and `sw.js` carry `Cache-Control: no-cache`.
 */
export async function serveStatic(
  webDir: string,
  pathname: string,
): Promise<Response | null> {
  let root: string;
  try {
    root = await realpath(webDir);
  } catch {
    return null;
  }
  const decoded = decodePath(pathname);
  const asked = decoded === null ? null : resolve(root, `.${sep}${decoded}`);
  const named = asked === null ? null : await realFileInside(root, asked);
  const [file, name] =
    named !== null && asked !== null
      ? [named, relative(root, asked)]
      : [await realFileInside(root, join(root, INDEX)), INDEX];
  if (file === null) return null;
  const headers: Record<string, string> = FRESH.has(name)
    ? { "Cache-Control": "no-cache" }
    : {};
  return new Response(Bun.file(file), { headers });
}
