// The command palette: the way to every command, setting and place, and the menu when it is empty.
import { Autocomplete } from "@base-ui/react/autocomplete";
import { COMMANDS, menuModel } from "@manent/commands";
import type { CommandService } from "@manent/commands";
import { markEnd, markStart, mark } from "@manent/perf";
import { MENU_IDS } from "@manent/settings";
import type { MenuId } from "@manent/settings";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SearchIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useCommands } from "../commands-react/commands-context.tsx";
import { Kbd } from "../components/stock/kbd.tsx";
import { READOUT_WORDS } from "../words/document.ts";
import { MENU_LABELS } from "./menu-labels.ts";
import { matchedRuns, rankRows } from "./palette-rank.ts";
import type { PaletteRow, PaletteSource } from "./palette-sources.ts";

const RECENT_LIMIT = 5;
const VIRTUAL_ABOVE = 100;
// the row token at Interface size 100 %, until a row is measured
const ROW_PX = 28;

const sizeOf = (element: Element): number =>
  element.getBoundingClientRect().height || ROW_PX;

type Entry =
  | { type: "menu"; menu: MenuId; label: string }
  | { type: "row"; row: PaletteRow };

interface PaletteProps {
  open: boolean;
  filter: "all" | "places";
  sources: readonly PaletteSource[];
  onRun(row: PaletteRow): void;
  onClose(): void;
  /** Ids of the commands run last, most recent first. */
  recent: readonly string[];
}

const keyOf = (entry: Entry): string =>
  entry.type === "menu" ? `menu:${entry.menu}` : entry.row.id;

const textOf = (entry: Entry): string =>
  entry.type === "menu" ? entry.label : entry.row.label;

/** The menus that hold a command available now, each under its menu word. */
function menuEntries(service: CommandService): Entry[] {
  return MENU_IDS.flatMap((menu): Entry[] => {
    const label = MENU_LABELS[menu];
    const held = menuModel(menu, COMMANDS, service).groups.some((group) =>
      group.some((item) => item.enabled),
    );
    return label !== null && held ? [{ type: "menu", menu, label }] : [];
  });
}

/** `rows` in the order shown before for the same query, with rows that arrived since drawn below them. */
function keepShownOrder(
  shown: { query: string; ids: readonly string[] },
  query: string,
  rows: readonly PaletteRow[],
): readonly PaletteRow[] {
  if (shown.query !== query) return rows;
  const place = new Map(shown.ids.map((id, index) => [id, index]));
  const before = rows
    .filter((row) => place.has(row.id))
    .toSorted((a, b) => (place.get(a.id) ?? 0) - (place.get(b.id) ?? 0));
  return [...before, ...rows.filter((row) => !place.has(row.id))];
}

function RowContent(props: { row: PaletteRow; query: string }): ReactNode {
  const { row, query } = props;
  const label =
    row.enabled || row.whyNot === null
      ? row.label
      : READOUT_WORDS.unavailable(row.label, row.whyNot);
  return (
    <>
      <span className="min-w-0 flex-1 truncate">
        {matchedRuns(query, label).map((run, index) =>
          run.matched ? (
            <span key={index} className="font-semibold">
              {run.text}
            </span>
          ) : (
            run.text
          ),
        )}
        {row.value === null ? null : `: ${row.value}`}
        {row.scopeWord === null ? null : ` · ${row.scopeWord}`}
      </span>
      {row.home === null ? null : (
        <span className="text-meta text-fg-muted">{row.home}</span>
      )}
      {row.keys === null ? null : <Kbd>{row.keys}</Kbd>}
    </>
  );
}

function EntryItem(props: {
  entry: Entry;
  query: string;
  index: number;
  activate(entry: Entry): void;
}): ReactNode {
  const { entry, query, index, activate } = props;
  return (
    <Autocomplete.Item
      value={entry}
      index={index}
      disabled={entry.type === "row" && !entry.row.enabled}
      onClick={() => activate(entry)}
      className="mn-row flex min-h-row items-center gap-2 px-2 text-ui"
    >
      {entry.type === "menu" ? (
        entry.label
      ) : (
        <RowContent row={entry.row} query={query} />
      )}
    </Autocomplete.Item>
  );
}

function VirtualEntries(props: {
  entries: readonly Entry[];
  query: string;
  activate(entry: Entry): void;
  /** The list that scrolls; the window is drawn for its height and offset. */
  scroller: RefObject<HTMLDivElement | null>;
}): ReactNode {
  const { entries, query, activate, scroller } = props;
  const virtual = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_PX,
    measureElement: sizeOf,
  });
  return (
    <div className="relative" style={{ height: virtual.getTotalSize() }}>
      {virtual.getVirtualItems().map((item) => {
        const entry = entries[item.index];
        return entry === undefined ? null : (
          <div
            key={keyOf(entry)}
            ref={virtual.measureElement}
            data-index={item.index}
            className="absolute inset-x-0"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <EntryItem
              entry={entry}
              query={query}
              index={item.index}
              activate={activate}
            />
          </div>
        );
      })}
    </div>
  );
}

/** The one scrolling list of entries: plain rows up to 100, a window of rows above. */
function EntryList(props: {
  entries: readonly Entry[];
  query: string;
  activate(entry: Entry): void;
}): ReactNode {
  const { entries, query, activate } = props;
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <Autocomplete.List ref={scroller} className="overflow-auto p-1">
      {entries.length > VIRTUAL_ABOVE ? (
        <VirtualEntries
          entries={entries}
          query={query}
          activate={activate}
          scroller={scroller}
        />
      ) : (
        entries.map((entry, index) => (
          <EntryItem
            key={keyOf(entry)}
            entry={entry}
            query={query}
            index={index}
            activate={activate}
          />
        ))
      )}
    </Autocomplete.List>
  );
}

/** What the palette lists: a menu's commands, the menus and recent commands while empty, or the rows for a query. */
function usePaletteEntries(options: {
  filter: PaletteProps["filter"];
  sources: readonly PaletteSource[];
  recent: readonly string[];
  query: string;
  menu: MenuId | null;
}): readonly Entry[] {
  const { filter, sources, recent, query, menu } = options;
  const { service } = useCommands();
  const shown = useRef<{ query: string; ids: readonly string[] }>({
    query: "",
    ids: [],
  });
  const active =
    filter === "places" ? sources.filter((s) => s.kind === "place") : sources;
  const rowsIn = (ids: readonly string[]): Entry[] => {
    const byId = new Map(
      active.flatMap((s) => s.rows("")).map((row) => [row.id, row]),
    );
    return ids.flatMap((id): Entry[] => {
      const row = byId.get(id);
      return row === undefined ? [] : [{ type: "row", row }];
    });
  };

  if (query === "" && filter === "all" && menu !== null)
    return rowsIn(
      menuModel(menu, COMMANDS, service)
        .groups.flat()
        .map((item) => item.id),
    );
  if (query === "" && filter === "all")
    return [...menuEntries(service), ...rowsIn(recent.slice(0, RECENT_LIMIT))];
  const rows = mark("ui.search.palette", () =>
    keepShownOrder(
      shown.current,
      query,
      rankRows(
        query,
        active.flatMap((s) => s.rows(query)),
      ),
    ),
  );
  shown.current = { query, ids: rows.map((row) => row.id) };
  return rows.map((row): Entry => ({ type: "row", row }));
}

function OpenPalette(props: Omit<PaletteProps, "open">): ReactNode {
  const { filter, sources, onRun, onClose, recent } = props;
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [openedAt] = useState(markStart);
  useLayoutEffect(() => markEnd("ui.open.palette", openedAt), [openedAt]);
  const entries = usePaletteEntries({ filter, sources, recent, query, menu });

  const activate = (entry: Entry): void => {
    if (entry.type === "menu") {
      setMenu(entry.menu);
      return;
    }
    if (!entry.row.enabled) return;
    // a setting changes in place, so the person sees the result and can choose again
    if (entry.row.kind === "setting") {
      onRun(entry.row);
      return;
    }
    // closing first gives focus back, so the command runs from where the person was
    onClose();
    onRun(entry.row);
  };

  return (
    <Autocomplete.Root
      inline
      open
      mode="none"
      items={entries}
      value={query}
      onValueChange={(value, details) => {
        // pressing an item writes its text into the field; the query stays what was typed
        if (details.reason === "item-press") return;
        setQuery(value);
        setMenu(null);
      }}
      itemToStringValue={textOf}
      autoHighlight="always"
      virtualized={entries.length > VIRTUAL_ABOVE}
    >
      <div
        className="fixed inset-x-0 mx-auto flex flex-col overflow-hidden rounded-surface border border-line bg-overlay shadow-dialog"
        style={{
          top: "12vh",
          width: "var(--palette-w)",
          maxHeight: "var(--palette-max-h)",
        }}
      >
        <div className="flex h-findbar shrink-0 items-center gap-2 border-b border-line px-4">
          <SearchIcon
            aria-hidden="true"
            className="size-icon-lg text-fg-muted"
          />
          <Autocomplete.Input
            autoFocus
            onKeyDown={(event) => {
              // while an input method composes, Enter, Escape and the arrows are its own
              if (event.nativeEvent.isComposing || event.keyCode === 229)
                event.preventBaseUIHandler();
            }}
            aria-label={READOUT_WORDS.commandsHint}
            className="mn-palette-field h-full min-w-0 flex-1 bg-transparent text-ui outline-none"
          />
        </div>
        <EntryList entries={entries} query={query} activate={activate} />
      </div>
    </Autocomplete.Root>
  );
}

/**
 * The palette, drawn while `open`, with focus in its field from the first frame. Sources are asked in the
 * order given (commands, settings, places, scripts, people, help); `filter: "places"` asks only places.
 * A row closes the palette through `onClose`, then runs through `onRun`; a setting row runs and changes in place.
 */
export function CommandPalette(props: PaletteProps): ReactNode {
  const { open, onClose, ...rest } = props;
  // each close starts the next opening afresh, even one made by the command run from the palette
  const [closes, setCloses] = useState(0);
  const close = (): void => {
    setCloses((count) => count + 1);
    onClose();
  };
  return open ? <OpenPalette key={closes} {...rest} onClose={close} /> : null;
}
