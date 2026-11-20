// The script the node puts first in the page it serves: the desktop's global and the page's startup values.
import type { DesktopGlobal, FirstPaintWrite } from "@manent/sync-protocol";

const UNSAFE = new RegExp("[<>&\\u2028\\u2029]", "g");

const escapeChar = (c: string): string =>
  `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;

/** JSON with every character that could end a script or a line in it escaped. */
const literal = (value: unknown): string =>
  JSON.stringify(value).replaceAll(UNSAFE, escapeChar);

/**
 * The script's source, without the `<script>` tags. It sets `window.manentDesktop` to the frozen global first,
 * then the tab's `manent.boot` and, when `session` is not null, `manent.demo.session`, each write on its own,
 * so a storage that refuses leaves the global in place. `session` is the tab session's JSON text.
 */
export function bootScript(values: {
  global: DesktopGlobal;
  boot: readonly FirstPaintWrite[];
  session: string | null;
}): string {
  const lines = [
    `window.manentDesktop = Object.freeze(${literal(values.global)});`,
    `try { window.sessionStorage.setItem("manent.boot", ${literal(JSON.stringify(values.boot))}); } catch (_) {}`,
  ];
  if (values.session !== null)
    lines.push(
      `try { window.sessionStorage.setItem("manent.demo.session", ${literal(values.session)}); } catch (_) {}`,
    );
  return lines.join("\n");
}
