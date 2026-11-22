// The application menu: drawn from the page's model, and each click sent back to the page as its command.
import type { NativeMenu, ShellMessage } from "@manent/sync-protocol";
import { menuTemplate } from "../menu-template.ts";
import type { MenuEntry } from "../menu-template.ts";
import { ApplicationMenu } from "./sdk.ts";
import type { ApplicationMenuItemConfig } from "./sdk.ts";

function toItem({
  type,
  submenu,
  ...fields
}: MenuEntry): ApplicationMenuItemConfig {
  if (type === "separator") return { type };
  return submenu === undefined
    ? fields
    : { ...fields, submenu: submenu.map(toItem) };
}

/** The command a click names; null for an event of another shape. */
function clicked(event: unknown): string | null {
  if (typeof event !== "object" || event === null || !("data" in event))
    return null;
  const { data } = event;
  if (typeof data !== "object" || data === null || !("action" in data))
    return null;
  return typeof data.action === "string" && data.action !== ""
    ? data.action
    : null;
}

/** Sets the fixed menu at once; each `draw` replaces the whole menu. */
export function createNativeMenu(options: {
  platform: "mac" | "windows";
  send(message: ShellMessage): void;
}): { draw(menus: readonly NativeMenu[] | null): void } {
  const draw = (menus: readonly NativeMenu[] | null): void =>
    ApplicationMenu.setApplicationMenu(
      menuTemplate(menus, options.platform).map(toItem),
    );
  ApplicationMenu.on("application-menu-clicked", (event) => {
    const id = clicked(event);
    if (id !== null) options.send({ v: 1, t: "menu_command", id });
  });
  draw(null);
  return { draw };
}
