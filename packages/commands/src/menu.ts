// The model an in-window menu draws and the desktop shell receives: plain, serialisable data.
import type { MenuId } from "@manent/settings";
import type { Keys } from "./chord.ts";
import type { CommandDefinition, MenuPlacement } from "./define.ts";
import type { CommandService, CommandState } from "./service.ts";

export interface MenuItemModel {
  id: string;
  /** Evaluated, as the command's state; under a submenu, without its leading "{submenu}: ". */
  label: string;
  enabled: boolean;
  checked: boolean | null;
  keys: Keys;
  nativeRole: "cut" | "copy" | "paste" | "selectAll" | null;
  submenu: string | null;
}

export interface MenuModel {
  menu: MenuId;
  groups: readonly (readonly MenuItemModel[])[];
}

interface Placed {
  id: string;
  at: MenuPlacement;
  state: CommandState;
}

// in placement order, each submenu's items moved together to the place of its first
function ordered(placed: readonly Placed[]): readonly Placed[] {
  const slots: Placed[][] = [];
  const runs = new Map<string, Placed[]>();
  for (const item of placed.toSorted((a, b) => a.at.order - b.at.order)) {
    const { submenu } = item.at;
    const run = submenu === null ? undefined : runs.get(submenu);
    if (run !== undefined) {
      run.push(item);
      continue;
    }
    const slot = [item];
    if (submenu !== null) runs.set(submenu, slot);
    slots.push(slot);
  }
  return slots.flat();
}

function itemOf({ id, at, state }: Placed): MenuItemModel {
  const prefix = at.submenu === null ? null : `${at.submenu}: `;
  return {
    id,
    label:
      prefix !== null && state.label.startsWith(prefix)
        ? state.label.slice(prefix.length)
        : state.label,
    enabled: state.enabled,
    checked: state.checked,
    keys: state.keys,
    nativeRole: null,
    submenu: at.submenu,
  };
}

/**
 * The visible commands placed in `menu`. Groups come in the order their first command appears in `commands`; within a group, items
 * follow their placement order, and the items of one submenu are contiguous, at the place of its first item.
 */
export function menuModel(
  menu: MenuId,
  commands: readonly CommandDefinition[],
  service: CommandService,
): MenuModel {
  const groups = new Map<string, Placed[]>();
  for (const def of commands) {
    const placements = def.menus.filter((at) => at.menu === menu);
    if (placements.length === 0) continue;
    const state = service.state(def.id);
    if (!state.visible) continue;
    for (const at of placements) {
      const group = groups.get(at.group) ?? [];
      group.push({ id: def.id, at, state });
      groups.set(at.group, group);
    }
  }
  return {
    menu,
    groups: [...groups.values()].map((group) => ordered(group).map(itemOf)),
  };
}
