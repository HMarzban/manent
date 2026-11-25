// How a Present window opens, and at which address: the one place that decides it. On the web, a browser window of its
// own per mode and document; on desktop, a shell window opened over the shell channel.
import { activeDesktopHost } from "../../desktop/active-host.ts";
import { readPerson, tabStorage } from "../../session.ts";
import type { PresentMode } from "./modes.ts";

/** The last part of each mode's address, after `/s/<docId>/`. */
export const PRESENT_PATHS: Readonly<Record<PresentMode["id"], string>> =
  Object.freeze({ room: "present", prompter: "prompter" });

// the windows this tab opened, by name, so that opening one again focuses it instead of loading it again
const opened = new Map<string, Window>();

/**
 * Opens the window of `mode` on `docId`, or focuses it when this tab opened it before. On desktop, sends `open_window`
 * over the active shell channel (carrying this tab's `userId` when signed in). On the web, opens without `noopener` so
 * the new window copies this tab's session storage and so its person; returns false when the browser blocked the pop-up.
 */
export function openPresentWindow(
  docId: string,
  mode: PresentMode["id"],
): boolean {
  const host = activeDesktopHost();
  if (host !== null) {
    const userId = readPerson(tabStorage())?.userId;
    host.send({
      v: 1,
      t: "open_window",
      role: mode,
      docId,
      ...(userId ? { userId } : {}),
    });
    return true;
  }
  const name = `manent-${mode}-${docId}`;
  const open = opened.get(name);
  if (open !== undefined && !open.closed) {
    open.focus();
    return true;
  }
  const made = window.open(`/s/${docId}/${PRESENT_PATHS[mode]}`, name);
  if (made === null) return false;
  opened.set(name, made);
  return true;
}
