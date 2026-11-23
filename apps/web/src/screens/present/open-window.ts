// How a Present window opens, and at which address: the one place that decides it. On the web, a browser window of its
// own per mode and document.
import type { PresentMode } from "./modes.ts";

/** The last part of each mode's address, after `/s/<docId>/`. */
export const PRESENT_PATHS: Readonly<Record<PresentMode["id"], string>> =
  Object.freeze({ room: "present", prompter: "prompter" });

// the windows this tab opened, by name, so that opening one again focuses it instead of loading it again
const opened = new Map<string, Window>();

/**
 * Opens the window of `mode` on `docId`, or focuses it when this tab opened it before. It opens without `noopener`, so
 * the new window copies this tab's session storage and so its person.
 */
export function openPresentWindow(
  docId: string,
  mode: PresentMode["id"],
): void {
  const name = `manent-${mode}-${docId}`;
  const open = opened.get(name);
  if (open !== undefined && !open.closed) {
    open.focus();
    return;
  }
  const made = window.open(`/s/${docId}/${PRESENT_PATHS[mode]}`, name);
  if (made !== null) opened.set(name, made);
}
