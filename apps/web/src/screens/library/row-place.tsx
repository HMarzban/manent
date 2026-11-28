// Where a Library row's document is, drawn as the row's last cell: an icon of its shape and the place word; and the
// handle of a row's menu, which goes before it.
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  LIBRARY_WORDS,
} from "@manent/ui";
import {
  CloudCheckIcon,
  CloudIcon,
  CloudUploadIcon,
  EllipsisIcon,
  MonitorDotIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode, SyntheticEvent } from "react";
import type { RowPlace } from "../../services/ports.ts";

/**
 * Row draws a row's place (`[data-trailing]`), or the word saying it is not on this device (`[data-unavailable]`),
 * before any trailing row-menu spacer; a list of rows gives that status cell one shared column width so every row's
 * status starts on one vertical rail.
 */
export const PLACE_COLUMN =
  "[&_.mn-row>[data-trailing]]:w-col-kind [&_.mn-row>[data-trailing]]:shrink-0 @3xl:[&_.mn-row>[data-trailing]]:w-col-edited [&_.mn-row>[data-unavailable]]:w-col-kind [&_.mn-row>[data-unavailable]]:shrink-0 @3xl:[&_.mn-row>[data-unavailable]]:w-col-edited";

/** Reserves the trailing `w-6` + `gap-2` row-menu slot on unavailable rows in tables whose sibling rows carry menus. */
export const PLACE_MENU_OFFSET = "[&_.mn-row>[data-unavailable]]:me-8";

/** The head's cell over the status column. */
export const PLACE_HEAD = "w-col-kind shrink-0 truncate @3xl:w-col-edited";

/** A row's place in words with its icon; null when it has no word of its own. */
function placeOf(
  place: RowPlace,
  shell: "web" | "desktop",
): { word: string; Icon: LucideIcon } | null {
  switch (place.kind) {
    case "synced":
      return { word: LIBRARY_WORDS.synced, Icon: CloudCheckIcon };
    case "waiting":
      return {
        word: LIBRARY_WORDS.waiting(place.count),
        Icon: CloudUploadIcon,
      };
    case "never_synced":
      return {
        word: LIBRARY_WORDS.neverSynced(shell === "desktop"),
        Icon: MonitorDotIcon,
      };
    case "on_server":
      return { word: LIBRARY_WORDS.onServer, Icon: CloudIcon };
    case "not_on_device":
    case "fetching":
      return null;
  }
}

/** Whether a row's document is on this device, for each place. */
export const ON_DEVICE: Readonly<Record<RowPlace["kind"], boolean>> =
  Object.freeze({
    synced: true,
    waiting: true,
    never_synced: true,
    not_on_device: false,
    fetching: false,
    on_server: false,
  });

/**
 * A row's place, drawn at its end: the place word; the unavailable word that keeps the row from opening; or, for a
 * document being fetched, an empty cell, muted and busy.
 */
export function placeProps(
  place: RowPlace,
  shell: "web" | "desktop",
): { trailing: readonly ReactNode[]; unavailable?: string; busy?: boolean } {
  if (place.kind === "not_on_device")
    return { trailing: [], unavailable: LIBRARY_WORDS.notOnDevice };
  const shown = placeOf(place, shell);
  // the empty cell keeps the status column
  if (shown === null)
    return { trailing: [null], busy: place.kind === "fetching" };
  const { word, Icon } = shown;
  return {
    trailing: [
      <span className="flex min-w-0 items-center gap-1 tabular-nums">
        <Icon aria-hidden="true" className="size-icon shrink-0" />
        <span className="truncate">{word}</span>
      </span>,
    ],
  };
}

const keepFromRow = (event: SyntheticEvent): void => event.stopPropagation();

/** The handle of the menu of the row titled `title`, holding `children`; its own click and keys open the menu, never the row. */
export function RowMenu(props: {
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <span onClick={keepFromRow} onKeyDown={keepFromRow}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={DOCUMENT_WORDS.rowMenuName(props.title)}
              className="[[data-row-menu]_&]:[@media(hover:hover)]:opacity-0 [[data-row-menu]:hover_&]:opacity-100 [[data-row-menu]:focus-within_&]:opacity-100 hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 data-popup-open:opacity-100"
            />
          }
        >
          <EllipsisIcon aria-hidden="true" className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{props.children}</DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

/** Wraps a row with a right-click context menu showing the same entries as its `RowMenu` handle. */
export function RowContextMenu(props: {
  entries: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{props.children}</ContextMenuTrigger>
      <ContextMenuContent>{props.entries}</ContextMenuContent>
    </ContextMenu>
  );
}

/** Renders `children(menu)` with both a `RowMenu` handle and a matching right-click `RowContextMenu` when `entries` is non-null. */
export function WithRowMenu(props: {
  title: string;
  entries: ReactNode;
  children(menu: ReactNode): ReactNode;
}): ReactNode {
  const { title, entries, children } = props;
  if (entries === null) return children(undefined);
  return (
    <RowContextMenu entries={entries}>
      {children(<RowMenu title={title}>{entries}</RowMenu>)}
    </RowContextMenu>
  );
}
