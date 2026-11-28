// Windows custom-titlebar application menu: surfaces the full command menu tree when Win32 native chrome is hidden.
import { COMMANDS, menuModel } from "@manent/commands";
import type { CommandService, MenuItemModel } from "@manent/commands";
import type { MenuId } from "@manent/settings";
import {
  CommandMenuIcon,
  DESKTOP_WORDS,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Kbd,
  MENU_WORDS,
  isDestructiveCommand,
  keyLabel,
  submenuIconFor,
} from "@manent/ui";
import { MenuIcon } from "lucide-react";
import { Fragment, useEffect, useReducer, useState } from "react";
import type { ReactNode } from "react";
import { useOptionalServices } from "../services/context.tsx";

const WINDOWS_MENUS = [
  "file",
  "edit",
  "view",
  "format",
  "script",
  "production",
  "window",
  "help",
] as const satisfies readonly MenuId[];

const PALETTE_COMMAND_ID = "app.palette";

interface ItemRun {
  readonly submenu: string | null;
  readonly items: readonly MenuItemModel[];
}

function runsOf(group: readonly MenuItemModel[]): readonly ItemRun[] {
  const runs: ItemRun[] = [];
  for (const item of group) {
    const last = runs.at(-1);
    if (item.submenu !== null && last?.submenu === item.submenu) {
      runs[runs.length - 1] = { ...last, items: [...last.items, item] };
    } else {
      runs.push({ submenu: item.submenu, items: [item] });
    }
  }
  return runs;
}

function paletteShortcut(service: CommandService): string | null {
  try {
    const [chord] = service.state(PALETTE_COMMAND_ID).keys;
    return chord === undefined ? null : keyLabel(chord, "windows");
  } catch {
    return null;
  }
}

function WindowsMenuEntry(props: {
  readonly item: MenuItemModel;
  readonly service: CommandService;
}): ReactNode {
  const { item, service } = props;
  const run = (): void => {
    service.run(item.id, "native_menu");
  };
  const [chord] = item.keys;
  const content = (
    <>
      <CommandMenuIcon id={item.id} />
      <span className="truncate">{item.label}</span>
      {chord === undefined ? null : (
        <Kbd className="ml-auto">{keyLabel(chord, "windows")}</Kbd>
      )}
    </>
  );

  if (item.checked !== null) {
    return (
      <DropdownMenuCheckboxItem
        checked={item.checked}
        disabled={!item.enabled}
        onCheckedChange={run}
      >
        {content}
      </DropdownMenuCheckboxItem>
    );
  }

  return (
    <DropdownMenuItem
      variant={isDestructiveCommand(item.id) ? "destructive" : "default"}
      disabled={!item.enabled}
      onClick={run}
    >
      {content}
    </DropdownMenuItem>
  );
}

function WindowsAppMenuItems(props: {
  readonly service: CommandService;
}): ReactNode {
  const { service } = props;
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  useEffect(() => service.subscribe(refresh), [service]);

  const paletteKey = paletteShortcut(service);
  const sections = WINDOWS_MENUS.map((id) => ({
    id,
    label: MENU_WORDS[id],
    model: menuModel(id, COMMANDS, service),
  })).filter(({ model }) => model.groups.some((group) => group.length > 0));

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuItem
          onClick={() => service.run(PALETTE_COMMAND_ID, "native_menu")}
        >
          <CommandMenuIcon id={PALETTE_COMMAND_ID} />
          <span className="truncate">{DESKTOP_WORDS.commandPalette}</span>
          {paletteKey === null ? null : (
            <Kbd className="ml-auto">{paletteKey}</Kbd>
          )}
        </DropdownMenuItem>
      </DropdownMenuGroup>
      {sections.length === 0 ? null : (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {sections.map(({ id, label, model }) => (
              <DropdownMenuSub key={id}>
                <DropdownMenuSubTrigger>
                  <span className="truncate">{label}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-52">
                  {model.groups.map((group, index) => (
                    <Fragment key={group[0]?.id ?? index}>
                      {index === 0 ? null : <DropdownMenuSeparator />}
                      <DropdownMenuGroup>
                        {runsOf(group).map((run) =>
                          run.submenu === null ? (
                            run.items.map((item) => (
                              <WindowsMenuEntry
                                key={item.id}
                                item={item}
                                service={service}
                              />
                            ))
                          ) : (
                            <DropdownMenuSub key={run.submenu}>
                              <DropdownMenuSubTrigger>
                                {(() => {
                                  const SubIcon = submenuIconFor(run.submenu);
                                  return SubIcon === null ? null : (
                                    <SubIcon
                                      aria-hidden="true"
                                      className="size-icon shrink-0"
                                    />
                                  );
                                })()}
                                <span className="truncate">{run.submenu}</span>
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="min-w-48">
                                {run.items.map((item) => (
                                  <WindowsMenuEntry
                                    key={item.id}
                                    item={item}
                                    service={service}
                                  />
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          ),
                        )}
                      </DropdownMenuGroup>
                    </Fragment>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuGroup>
        </>
      )}
    </>
  );
}

/**
 * Compact Windows application menu trigger for the custom desktop titlebar.
 * Returns null outside a signed-in/chosen person's ServicesProvider (e.g. on Choose).
 */
export function WindowsAppMenu(): ReactNode {
  const services = useOptionalServices();
  const [open, setOpen] = useState(false);

  if (services === null) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        data-slot="windows-app-menu"
        className="mn-windowbar-menu-btn mn-windowbar-no-drag"
        aria-label={DESKTOP_WORDS.appMenu}
        title={DESKTOP_WORDS.appMenu}
      >
        <MenuIcon aria-hidden="true" className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        aria-label={DESKTOP_WORDS.appMenu}
        align="start"
        className="w-auto min-w-48"
      >
        {open ? <WindowsAppMenuItems service={services.commands} /> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
