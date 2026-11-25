// The rundown's title bar: Back to Library, `{project} · {date}` with its menu (no Rename), status, people and Share.
import { COMMANDS, menuModel } from "@manent/commands";
import type { MenuItemModel } from "@manent/commands";
import {
  Button,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  READOUT_WORDS,
  SELECTION_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  keyLabel,
  useCommandState,
  useCommands,
} from "@manent/ui";
import { useRouter } from "@tanstack/react-router";
import { Fragment, useEffect, useId, useReducer } from "react";
import type { ReactNode } from "react";
import { MenuFace } from "../screens/document/menu-face.tsx";
import { People } from "../screens/document/people.tsx";
import { StatusButton } from "../screens/document/status-button.tsx";
import type { DocumentServices } from "../services/ports.ts";
import { ShellRegion } from "../shell/regions.tsx";

function TitleMenuEntry(props: { readonly item: MenuItemModel }): ReactNode {
  const { item } = props;
  const { service, platform } = useCommands();
  const run = (): void => {
    service.run(item.id, "menu");
  };
  const [chord] = item.keys;
  const content = (
    <>
      {item.label}
      {chord === undefined ? null : (
        <Kbd className="ml-auto">{keyLabel(chord, platform)}</Kbd>
      )}
    </>
  );
  const entry =
    item.checked === null ? (
      <DropdownMenuItem
        data-tour={item.id}
        disabled={!item.enabled}
        className={item.enabled ? "cursor-pointer" : "cursor-not-allowed"}
        onClick={run}
      >
        {content}
      </DropdownMenuItem>
    ) : (
      <DropdownMenuCheckboxItem
        data-tour={item.id}
        checked={item.checked}
        disabled={!item.enabled}
        className={item.enabled ? "cursor-pointer" : "cursor-not-allowed"}
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

/** Title dropdown menu for a rundown: omits `doc.rename` because a rundown's date changes in Details → Rundown. */
function RundownTitleMenu(props: { readonly title: string }): ReactNode {
  const { title } = props;
  const { service } = useCommands();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => service.subscribe(refresh), [service]);
  const groups = menuModel("title", COMMANDS, service)
    .groups.map((group) => group.filter((item) => item.id !== "doc.rename"))
    .filter((group) => group.length > 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <MenuFace size="default" title={title}>
          {title}
        </MenuFace>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label={DOCUMENT_WORDS.titleMenu(title)}>
        {groups.map((group, index) => (
          <Fragment key={group[0]?.id ?? index}>
            {index === 0 ? null : <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              {group.map((item) => (
                <TitleMenuEntry key={item.id} item={item} />
              ))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RundownShareButton(): ReactNode {
  const { service } = useCommands();
  const state = useCommandState("share.open");
  const reasonId = useId();
  if (!state.visible) return null;
  const reason =
    state.whyNot === null
      ? null
      : READOUT_WORDS.unavailable(SELECTION_WORDS.share, state.whyNot);
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              data-tour="share"
              className={
                reason === null
                  ? "cursor-pointer"
                  : "cursor-not-allowed opacity-50"
              }
              aria-disabled={reason === null ? undefined : true}
              aria-describedby={reason === null ? undefined : reasonId}
              onClick={() => service.run("share.open", "control")}
            />
          }
        >
          {SELECTION_WORDS.share}
        </TooltipTrigger>
        <TooltipContent>{reason ?? SELECTION_WORDS.share}</TooltipContent>
      </Tooltip>
      {reason === null ? null : (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </>
  );
}

export function RundownTitleBar(props: {
  readonly docId: string;
  readonly doc: DocumentServices;
  readonly title: string;
}): ReactNode {
  const { docId, doc, title } = props;
  const router = useRouter();
  return (
    <ShellRegion
      region="title_bar"
      className="@container flex min-h-titlebar flex-wrap items-center gap-x-2 border-b border-line bg-chrome px-2 py-1 text-ui"
    >
      <Button
        variant="ghost"
        className="cursor-pointer text-fg-muted hover:text-fg"
        onClick={() => void router.navigate({ href: "/" })}
      >
        {DOCUMENT_WORDS.back}
      </Button>
      <h1
        tabIndex={-1}
        className="grid max-w-max min-w-24 grow basis-24 grid-cols-[fit-content(40cqi)] text-title font-semibold *:min-w-0"
      >
        <RundownTitleMenu title={title} />
      </h1>
      <StatusButton doc={doc} />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <People docId={docId} people={doc.people} viewers={doc.viewers} />
        <RundownShareButton />
      </div>
    </ShellRegion>
  );
}
