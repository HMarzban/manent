// An in-window menu, drawn from the menu model: groups, submenus, marks, keys and the reason a choice is unavailable.
import { COMMANDS, menuModel } from "@manent/commands";
import type { CommandService, MenuItemModel } from "@manent/commands";
import type { MenuId, Platform } from "@manent/settings";
import { Fragment, useEffect, useReducer } from "react";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../components/stock/dropdown-menu.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/stock/tooltip.tsx";
import { READOUT_WORDS } from "../words/document.ts";
import { useCommands } from "./commands-context.tsx";
import { keyLabel } from "./key-labels.ts";

interface Run {
  submenu: string | null;
  items: readonly MenuItemModel[];
}

/** The group's items cut into runs: each submenu's items together, every other item a run of its own. */
function runsOf(group: readonly MenuItemModel[]): readonly Run[] {
  const runs: Run[] = [];
  for (const item of group) {
    const last = runs.at(-1);
    if (item.submenu !== null && last?.submenu === item.submenu)
      runs[runs.length - 1] = { ...last, items: [...last.items, item] };
    else runs.push({ submenu: item.submenu, items: [item] });
  }
  return runs;
}

function MenuItem(props: {
  item: MenuItemModel;
  service: CommandService;
  platform: Platform;
}): ReactNode {
  const { item, service, platform } = props;
  const run = (): void => {
    service.run(item.id, "menu");
  };
  const [chord] = item.keys;
  const content = (
    <>
      {item.label}
      {chord === undefined ? null : (
        <DropdownMenuShortcut className="text-micro text-fg-muted">
          {keyLabel(chord, platform)}
        </DropdownMenuShortcut>
      )}
    </>
  );
  const entry =
    item.checked === null ? (
      <DropdownMenuItem disabled={!item.enabled} onClick={run}>
        {content}
      </DropdownMenuItem>
    ) : (
      <DropdownMenuCheckboxItem
        checked={item.checked}
        disabled={!item.enabled}
        onCheckedChange={run}
      >
        {content}
      </DropdownMenuCheckboxItem>
    );
  if (item.enabled) return entry;
  const { label, whyNot } = service.state(item.id);
  return (
    <Tooltip>
      <TooltipTrigger render={entry} />
      <TooltipContent>
        {READOUT_WORDS.unavailable(label, whyNot ?? "")}
      </TooltipContent>
    </Tooltip>
  );
}

/** Draws `menuModel(menu, …)` as a stock dropdown menu named `label`, read again when the service notifies. */
export function CommandMenu(props: {
  menu: MenuId;
  trigger: ReactNode;
  label: string;
}): ReactNode {
  const { menu, trigger, label } = props;
  const { service, platform } = useCommands();
  const [, changed] = useReducer((n: number) => n + 1, 0);
  useEffect(() => service.subscribe(changed), [service]);
  const model = menuModel(menu, COMMANDS, service);
  const itemOf = (item: MenuItemModel): ReactNode => (
    <MenuItem key={item.id} item={item} service={service} platform={platform} />
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent aria-label={label}>
        {model.groups.map((group, index) => (
          <Fragment key={group[0]?.id ?? index}>
            {index === 0 ? null : <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              {runsOf(group).map((run) =>
                run.submenu === null ? (
                  run.items.map(itemOf)
                ) : (
                  <DropdownMenuSub key={run.submenu}>
                    <DropdownMenuSubTrigger>
                      {run.submenu}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {run.items.map(itemOf)}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ),
              )}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
