// The window's menus as the shell draws them natively, and the sender that keeps the shell's copy current.
import type { MenuItemModel, MenuModel } from "@manent/commands";
import type { Clock } from "@manent/sync-client";
import { NATIVE_MENU_IDS } from "@manent/sync-protocol";
import type {
  NativeMenu,
  NativeMenuId,
  NativeMenuItem,
} from "@manent/sync-protocol";
import { MENU_WORDS } from "@manent/ui";
import type { DesktopHost } from "./host.ts";

/** Where the shell draws an application menu; elsewhere the palette is the menu. */
export const NATIVE_MENU_PLATFORMS: readonly ("mac" | "windows" | "linux")[] =
  Object.freeze(["mac", "windows"]);

/** A menu model is sent at most this often. */
const MENU_THROTTLE_MS = 250;

// the shell refuses a menu with more groups, or a group with more items, whole
const MENU_LIMIT = 64;
const ACCELERATOR = new RegExp("^Mod\\+([A-Z0-9,/[\\]])$");

/** The key Command (macOS) or Control (Windows) completes, from the first chord that is that modifier and one key. */
function acceleratorOf(keys: readonly string[]): string | null {
  for (const chord of keys) {
    const key = ACCELERATOR.exec(chord)?.[1];
    if (key !== undefined) return key.toLowerCase();
  }
  return null;
}

function nativeItem(item: MenuItemModel): NativeMenuItem {
  return {
    id: item.id,
    label: item.label,
    enabled: item.enabled,
    checked: item.checked,
    accelerator: acceleratorOf(item.keys),
    role: item.nativeRole,
    submenu: item.submenu,
  };
}

/**
 * One native menu per shell menu whose model has items, in the shell's order, labelled as the window's menus are.
 * On macOS an item the Manent menu holds is left out of File; Windows has no Manent menu.
 */
export function nativeMenus(
  models: readonly MenuModel[],
  platform: "mac" | "windows",
): NativeMenu[] {
  const inApp = new Set(
    models
      .filter((model) => model.menu === "app")
      .flatMap((model) => model.groups.flat().map((item) => item.id)),
  );
  const kept = (menu: NativeMenuId, item: MenuItemModel): boolean =>
    !(platform === "mac" && menu === "file" && inApp.has(item.id));
  const menus: NativeMenu[] = [];
  for (const menu of NATIVE_MENU_IDS) {
    if (platform === "windows" && menu === "app") continue;
    const model = models.find((each) => each.menu === menu);
    const groups = (model?.groups ?? [])
      .map((group) => group.filter((item) => kept(menu, item)))
      .filter((group) => group.length > 0)
      .slice(0, MENU_LIMIT)
      .map((group) => group.slice(0, MENU_LIMIT).map(nativeItem));
    if (groups.length > 0)
      menus.push({ menu, label: MENU_WORDS[menu], groups });
  }
  return menus;
}

/**
 * Sends the shell `models()` as native menus `MENU_THROTTLE_MS` after the first `changed()` since the last send, and only
 * when they differ from what was sent last. Started only on the platforms of `NATIVE_MENU_PLATFORMS`.
 */
export function createMenuSender(options: {
  host: DesktopHost;
  models: () => readonly MenuModel[];
  clock: Clock;
}): { changed(): void; stop(): void } {
  const { host, models, clock } = options;
  const platform = host.platform === "mac" ? "mac" : "windows";
  let last: string | null = null;
  let cancel: (() => void) | null = null;
  const flush = (): void => {
    cancel = null;
    const menus = nativeMenus(models(), platform);
    const json = JSON.stringify(menus);
    if (json === last) return;
    last = json;
    host.send({ v: 1, t: "menus", menus });
  };
  return {
    changed() {
      cancel ??= clock.schedule(flush, MENU_THROTTLE_MS);
    },
    stop() {
      cancel?.();
      cancel = null;
    },
  };
}
