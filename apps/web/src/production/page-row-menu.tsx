// A page's row menu in the Pages tab, from its handle, a right-click, the context-menu key or Shift+F10: the page
// operations on the chosen pages, each said as its command says it.
import type { CommandId } from "@manent/commands";
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  READOUT_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useCommands,
} from "@manent/ui";
import type { ReactNode } from "react";

const PAGE_OPERATIONS: readonly CommandId[] = Object.freeze([
  "production.lockPages",
  "production.lockAPages",
  "production.renumber",
]);

/** An entry drawn as `Item`; one that cannot run says why in its tooltip. */
function Entry(props: {
  id: CommandId;
  Item: typeof DropdownMenuItem | typeof ContextMenuItem;
}): ReactNode {
  const { id, Item } = props;
  const { service } = useCommands();
  const state = service.state(id);
  if (!state.visible) return null;
  const item = (
    <Item disabled={!state.enabled} onClick={() => service.run(id, "menu")}>
      {state.label}
    </Item>
  );
  if (state.whyNot === null) return item;
  return (
    <Tooltip>
      <TooltipTrigger render={item} />
      <TooltipContent>
        {READOUT_WORDS.unavailable(state.label, state.whyNot)}
      </TooltipContent>
    </Tooltip>
  );
}

/** `children` draws the row with the menu's handle in it; `onOpen` chooses the row first when it is not chosen. */
export function PageRowMenu(props: {
  /** The row's page label, which names its handle. */
  label: string;
  onOpen(): void;
  children(handle: ReactNode): ReactNode;
}): ReactNode {
  const opened = (open: boolean): void => {
    if (open) props.onOpen();
  };
  const handle = (
    // the handle's own click opens the menu, never the row
    <span key="menu" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu onOpenChange={opened}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={DOCUMENT_WORDS.rowMenuName(props.label)}
            />
          }
        >
          <span aria-hidden="true">⋯</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {PAGE_OPERATIONS.map((id) => (
            <Entry key={id} id={id} Item={DropdownMenuItem} />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
  return (
    <ContextMenu onOpenChange={opened}>
      <ContextMenuTrigger>{props.children(handle)}</ContextMenuTrigger>
      <ContextMenuContent>
        {PAGE_OPERATIONS.map((id) => (
          <Entry key={id} id={id} Item={ContextMenuItem} />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
