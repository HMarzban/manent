// The command palette: the way to every command, setting and place, and the menu when it is empty.
import { Autocomplete } from "@base-ui/react/autocomplete";
import { markEnd, markStart } from "@manent/perf";
import type { MenuId } from "@manent/settings";
import { SearchIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Button } from "../components/stock/button.tsx";
import { READOUT_WORDS } from "../words/document.ts";
import { PALETTE_WORDS } from "../words/palette.ts";
import { MENU_LABELS } from "./menu-labels.ts";
import {
  entriesOf,
  keyOf,
  textOf,
  usePaletteSections,
} from "./palette-entries.ts";
import type { Entry, Section } from "./palette-entries.ts";
import { PaletteFooter } from "./palette-footer.tsx";
import { EntryList, VIRTUAL_ABOVE } from "./palette-list.tsx";
import type {
  PaletteFilter,
  PaletteRow,
  PaletteSource,
} from "./palette-sources.ts";

interface PaletteProps {
  open: boolean;
  filter: PaletteFilter;
  sources: readonly PaletteSource[];
  /** The field's placeholder outside a menu; none when not given. */
  placeholder?: string;
  onRun(row: PaletteRow): void;
  onClose(): void;
  /** Ids of the commands run last, most recent first. */
  recent: readonly string[];
}

/** The sentence said in place of the list when `query` finds nothing. */
function noMatch(
  filter: PaletteFilter,
  menu: string | null,
  query: string,
): string {
  if (filter === "places") return PALETTE_WORDS.noPlace(query);
  return menu === null
    ? PALETTE_WORDS.noMatch(query)
    : PALETTE_WORDS.noMatchIn(menu, query);
}

// the control of the palette's own command closes the palette when pressed, so a press on it is left to that command
const OPENER = '[data-tour="app.palette"]';

/** Calls `close` on a press outside `surface`, as on any popover, but not on the palette's own control. */
function useOutsidePress(
  surface: { current: HTMLElement | null },
  close: () => void,
): void {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest(OPENER) !== null) return;
      if (target instanceof Node && surface.current?.contains(target)) return;
      latest.current();
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, [surface]);
}

/** The search row: the field, with the way back while a menu is open. */
function PaletteField(props: {
  query: string;
  /** The open menu's name; null at the top level. */
  menuLabel: string | null;
  placeholder?: string;
  leaveMenu(): void;
}): ReactNode {
  const { query, menuLabel, placeholder, leaveMenu } = props;
  return (
    <div className="flex h-findbar shrink-0 items-center gap-2 border-b border-line px-3">
      <SearchIcon
        aria-hidden="true"
        className="size-icon-lg shrink-0 text-fg-muted"
      />
      {menuLabel === null ? null : (
        <Button
          variant="ghost"
          size="sm"
          className="text-fg-muted hover:text-fg"
          onClick={leaveMenu}
        >
          {PALETTE_WORDS.back}
        </Button>
      )}
      <Autocomplete.Input
        autoFocus
        onKeyDown={(event) => {
          // while an input method composes, Enter, Escape and the arrows are its own
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            event.preventBaseUIHandler();
            return;
          }
          if (event.key === "Backspace" && query === "" && menuLabel !== null) {
            event.preventBaseUIHandler();
            leaveMenu();
          }
        }}
        aria-label={READOUT_WORDS.commandsHint}
        placeholder={
          menuLabel === null
            ? placeholder
            : PALETTE_WORDS.placeholderIn(menuLabel)
        }
        className="mn-palette-field h-full min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-fg-muted"
      />
    </div>
  );
}

/** The palette's box: the search field over the list of entries, the footer below. */
function PaletteFrame(props: {
  surface: RefObject<HTMLDivElement | null>;
  filter: PaletteFilter;
  sections: readonly Section[];
  entries: readonly Entry[];
  query: string;
  menu: MenuId | null;
  placeholder?: string;
  /** The entry the keys are on; null when none is. */
  keyed: Entry | null;
  activate(entry: Entry): void;
  leaveMenu(): void;
}): ReactNode {
  const { surface, filter, sections, entries, query, menu, keyed } = props;
  const { placeholder, activate, leaveMenu } = props;
  const menuLabel = menu === null ? null : MENU_LABELS[menu];
  return (
    <div
      ref={surface}
      className="@container fixed inset-x-0 mx-auto flex flex-col overflow-hidden rounded-surface border border-line bg-overlay shadow-dialog"
      style={{
        zIndex: "var(--z-overlay)",
        top: "12vh",
        width: "min(var(--palette-w), 100% - 2rem)",
        maxHeight: "min(var(--palette-max-h), 100dvh - 12vh - 1rem)",
      }}
    >
      <PaletteField
        query={query}
        menuLabel={menuLabel}
        placeholder={placeholder}
        leaveMenu={leaveMenu}
      />
      <Autocomplete.Empty className="px-3 py-3 text-ui text-fg-muted empty:p-0">
        {entries.length === 0 && query !== ""
          ? noMatch(filter, menuLabel, query)
          : null}
      </Autocomplete.Empty>
      <EntryList
        sections={sections}
        label={menuLabel ?? READOUT_WORDS.commandsHint}
        drawing={{ query, home: menu === null, activate }}
      />
      <PaletteFooter keyed={keyed} inMenu={menu !== null} />
    </div>
  );
}

/**
 * What choosing an entry does: a menu opens, a setting changes in place, an unavailable row runs with the palette
 * open, so that it is refused and says why, and any other row closes the palette and runs.
 */
function useActivate(options: {
  onRun(row: PaletteRow): void;
  onClose(): void;
  toMenu(menu: MenuId): void;
}): (entry: Entry) => void {
  const { onRun, onClose, toMenu } = options;
  // a setting's rows read the store when drawn, so a change made here is drawn again at once
  const [, setChanges] = useState(0);
  return (entry) => {
    if (entry.type === "menu") {
      toMenu(entry.menu);
      return;
    }
    // an unavailable row keeps the palette open, and its refused run says why in the message slot
    if (!entry.row.enabled) {
      onRun(entry.row);
      return;
    }
    // a setting changes in place, so the person sees the result and can choose again
    if (entry.row.kind === "setting") {
      onRun(entry.row);
      setChanges((count) => count + 1);
      return;
    }
    // closing first gives focus back, so the command runs from where the person was
    onClose();
    onRun(entry.row);
  };
}

function OpenPalette(props: Omit<PaletteProps, "open">): ReactNode {
  const { filter, sources, onRun, onClose, recent, placeholder } = props;
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<MenuId | null>(null);
  // by key: the entries are made afresh on each render, and the same entry must not set the state again
  const [keyed, setKeyed] = useState<string | null>(null);
  const [openedAt] = useState(markStart);
  useLayoutEffect(() => markEnd("ui.open.palette", openedAt), [openedAt]);
  const surface = useRef<HTMLDivElement>(null);
  useOutsidePress(surface, onClose);
  const sections = usePaletteSections({ filter, sources, recent, query, menu });
  const entries = entriesOf(sections);

  const toMenu = (next: MenuId | null): void => {
    setMenu(next);
    setQuery("");
  };
  const activate = useActivate({ onRun, onClose, toMenu });

  return (
    <Autocomplete.Root
      // a new list starts with the keys on its first row, and the field focused
      key={menu ?? ""}
      inline
      open
      mode="none"
      items={entries}
      value={query}
      onValueChange={(value, details) => {
        // pressing an item writes its text into the field; the query stays what was typed
        if (details.reason === "item-press") return;
        setQuery(value);
      }}
      onItemHighlighted={(value: Entry | undefined) =>
        setKeyed(value === undefined ? null : keyOf(value))
      }
      itemToStringValue={textOf}
      autoHighlight="always"
      // the pointer never moves what Enter runs; a row under it takes the hover fill
      highlightItemOnHover={false}
      virtualized={entries.length > VIRTUAL_ABOVE}
    >
      <PaletteFrame
        surface={surface}
        filter={filter}
        sections={sections}
        entries={entries}
        query={query}
        menu={menu}
        placeholder={placeholder}
        keyed={entries.find((entry) => keyOf(entry) === keyed) ?? null}
        activate={activate}
        leaveMenu={() => toMenu(null)}
      />
    </Autocomplete.Root>
  );
}

/**
 * The palette, drawn while `open`, with focus in its field from the first frame. Sources are asked in the
 * order given (commands, settings, places, scripts, people, help); `filter: "places"` asks only places, and
 * `filter: "beside"` lists the rows of the sources given, which are then Beside's alone, with no menus.
 * A row closes the palette through `onClose`, then runs through `onRun`; a setting row runs and changes in place, and
 * an unavailable row runs with the palette open, for the command service to say why it cannot.
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
