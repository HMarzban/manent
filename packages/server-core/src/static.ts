import { realpath, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

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
  const file =
    (decoded === null
      ? null
      : await realFileInside(root, resolve(root, `.${sep}${decoded}`))) ??
    (await realFileInside(root, join(root, "index.html")));
  return file === null ? null : new Response(Bun.file(file));
}
