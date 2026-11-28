// The application menu the shell sets, from the page's model of its menus.
import { NATIVE_MENU_IDS, NATIVE_ROLES } from "@manent/sync-protocol";
import type { NativeMenu, NativeMenuItem } from "@manent/sync-protocol";

/** The SDK's menu item: an `action` or a `role`, never both; a role's label is the system's when none is given. */
export interface MenuEntry {
  label?: string;
  action?: string;
  role?: string;
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  submenu?: MenuEntry[];
  type?: "separator";
}

const SEPARATOR: MenuEntry = Object.freeze({ type: "separator" });
const role = (name: string): MenuEntry => ({ role: name });

// the menus the shell draws before the page has sent its model, labelled as the page labels them
const APP_LABEL = "Manent";
const ABOUT_LABEL = "About Manent";
const EDIT_LABEL = "Edit";
const WINDOW_LABEL = "Window";
const WINDOW_ROLES = ["minimize", "zoom"] as const;

/** Menu action id intercepted by the desktop shell to open the bespoke About Manent window. */
export const ABOUT_ACTION = "shell.about";

function entryOf(item: NativeMenuItem): MenuEntry {
  if (item.role !== null) return { label: item.label, role: item.role };
  return {
    label: item.label,
    action: item.id,
    ...(item.accelerator === null ? {} : { accelerator: item.accelerator }),
    enabled: item.enabled,
    ...(item.checked === null ? {} : { checked: item.checked }),
  };
}

/** One group's entries, each run of items of one submenu folded into one entry where its first item stood. */
function groupEntries(group: readonly NativeMenuItem[]): MenuEntry[] {
  const entries: MenuEntry[] = [];
  let previous: string | null = null;
  for (const item of group) {
    const entry = entryOf(item);
    const run = item.submenu === previous ? entries.at(-1)?.submenu : undefined;
    if (item.submenu === null) entries.push(entry);
    else if (run !== undefined) run.push(entry);
    else entries.push({ label: item.submenu, submenu: [entry] });
    previous = item.submenu;
  }
  return entries;
}

/** The groups' entries, a separator between two groups. */
function joined(groups: readonly MenuEntry[][]): MenuEntry[] {
  return groups
    .filter((entries) => entries.length > 0)
    .flatMap((entries, n) => (n === 0 ? entries : [SEPARATOR, ...entries]));
}

const itemsOf = (menu: NativeMenu | undefined): MenuEntry[][] =>
  (menu?.groups ?? []).map(groupEntries);

/** The model's Edit menu, with every editing role it leaves out added as a last group. */
function editEntry(menu: NativeMenu | undefined): MenuEntry {
  const held = new Set(menu?.groups.flat().map((item) => item.role));
  const missing = NATIVE_ROLES.filter((name) => !held.has(name)).map(role);
  return {
    label: menu?.label ?? EDIT_LABEL,
    submenu: joined([...itemsOf(menu), missing]),
  };
}

/** On macOS: About Manent (custom window), the model's own items of the app menu, then a separator and Quit. */
function appEntry(menu: NativeMenu | undefined): MenuEntry {
  return {
    label: APP_LABEL,
    submenu: [
      { label: ABOUT_LABEL, action: ABOUT_ACTION, enabled: true },
      ...joined(itemsOf(menu)),
      SEPARATOR,
      role("quit"),
    ],
  };
}

/**
 * The whole application menu. Null (before the page's first model) is the fixed minimum: on macOS
 * Manent (About, Quit), Edit and Window; on Windows Edit and Window. With a model, each of its menus
 * in the shell's order, and an Edit menu that always holds the editing roles.
 */
export function menuTemplate(
  menus: readonly NativeMenu[] | null,
  platform: "mac" | "windows",
): MenuEntry[] {
  const byId = new Map((menus ?? []).map((menu) => [menu.menu, menu]));
  const entries = platform === "mac" ? [appEntry(byId.get("app"))] : [];
  for (const id of NATIVE_MENU_IDS) {
    const menu = byId.get(id);
    if (id === "edit") entries.push(editEntry(menu));
    else if (id !== "app" && menu !== undefined)
      entries.push({ label: menu.label, submenu: joined(itemsOf(menu)) });
  }
  if (menus === null)
    entries.push({ label: WINDOW_LABEL, submenu: WINDOW_ROLES.map(role) });
  return entries;
}
