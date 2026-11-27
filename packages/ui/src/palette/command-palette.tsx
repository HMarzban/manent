// The command palette: the way to every command, setting and place, with contextual Smart Home and scope filtering.
import { Autocomplete } from "@base-ui/react/autocomplete";
import { markEnd, markStart } from "@manent/perf";
import type { MenuId } from "@manent/settings";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { READOUT_WORDS } from "../words/document.ts";
import { PALETTE_WORDS } from "../words/palette.ts";
import { MENU_LABELS } from "./menu-labels.ts";
import { PaletteAskView, useOutsidePress } from "./palette-ask.tsx";
import type { PaletteAsk } from "./palette-ask.tsx";
import {
  availableScopes,
  entriesOf,
  keyOf,
  textOf,
  usePaletteSections,
} from "./palette-entries.ts";
import type { Entry, Section } from "./palette-entries.ts";
import { PaletteFooter } from "./palette-footer.tsx";
import {
  PREFIX_SCOPE,
  PaletteField,
  PaletteScopeStrip,
} from "./palette-header.tsx";
import type { PaletteInputKeyDown } from "./palette-header.tsx";
import { EntryList, VIRTUAL_ABOVE } from "./palette-list.tsx";
import type {
  PaletteFilter,
  PaletteRow,
  PaletteScope,
  PaletteSource,
} from "./palette-sources.ts";

interface PaletteProps {
  open: boolean;
  filter: PaletteFilter;
  sources: readonly PaletteSource[];
  /** The field's placeholder outside a menu; none when not given. */
  placeholder?: string;
  /** When set, switches the open palette to the interactive ask step. */
  ask?: PaletteAsk | null;
  onRun(row: PaletteRow, query?: string): void;
  onClose(): void;
  /** Ids of the commands run last, most recent first. */
  recent: readonly string[];
  /** Calm context caption describing where the palette was opened (e.g. "Screenplay · Scene 4"). */
  context?: string | null;
  /** Runnable contextual command ids for Smart Home's "Suggested here" section. */
  suggested?: readonly string[];
  /** Contextual quick-jump row ids (scripts, next character line, collaborators) for "Jump to". */
  jumpTo?: readonly string[];
  /** Runnable real setting ids for Smart Home's "Settings here" section. */
  quickSettings?: readonly string[];
  /** Optional contextual + frecency boost used inside query ranking. */
  boost?: (row: PaletteRow) => number;
  /** When true, renders the scope filter strip and enables Tab and prefix shortcuts. */
  enableScopes?: boolean;
}

/** The sentence said in place of the list when `query` finds nothing. */
function noMatch(
  filter: PaletteFilter,
  scope: PaletteScope,
  menu: string | null,
  query: string,
): string {
  if (filter === "places" || scope === "places")
    return PALETTE_WORDS.noPlace(query);
  return menu === null
    ? PALETTE_WORDS.noMatch(query)
    : PALETTE_WORDS.noMatchIn(menu, query);
}

/** The palette's box: the search field, optional scope strip, the list of entries, and the footer. */
function PaletteFrame(props: {
  surface: RefObject<HTMLDivElement | null>;
  filter: PaletteFilter;
  scope: PaletteScope;
  scopes: readonly PaletteScope[];
  enableScopes: boolean;
  context: string | null;
  sections: readonly Section[];
  entries: readonly Entry[];
  query: string;
  menu: MenuId | null;
  placeholder?: string;
  keyed: Entry | null;
  announcement: string;
  onKeyDown: PaletteInputKeyDown;
  onClear: () => void;
  onSelectScope: (scope: PaletteScope) => void;
  activate(entry: Entry): void;
  leaveMenu(): void;
}): ReactNode {
  const {
    surface,
    filter,
    scope,
    scopes,
    enableScopes,
    context,
    sections,
    entries,
    query,
    menu,
    placeholder,
    keyed,
    announcement,
    onKeyDown,
    onClear,
    onSelectScope,
    activate,
    leaveMenu,
  } = props;
  const menuLabel = menu === null ? null : MENU_LABELS[menu];
  const showStrip = enableScopes && filter === "all" && menu === null;
  return (
    <div
      ref={surface}
      className="@container fixed inset-x-0 mx-auto flex flex-col overflow-hidden rounded-surface border border-line bg-overlay shadow-dialog"
      style={{
        zIndex: "var(--z-overlay)",
        top: "10vh",
        width: "min(var(--palette-w), 100% - 2rem)",
        maxHeight: "min(var(--palette-max-h), 100dvh - 10vh - 1rem)",
      }}
    >
      <PaletteField
        query={query}
        menuLabel={menuLabel}
        scope={scope}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        onClear={onClear}
        leaveMenu={leaveMenu}
      />
      {showStrip ? (
        <PaletteScopeStrip
          scopes={scopes}
          active={scope}
          context={context}
          onSelect={onSelectScope}
        />
      ) : null}
      <Autocomplete.Empty className="px-3 py-3 text-ui text-fg-muted empty:p-0">
        {entries.length === 0 && query !== ""
          ? noMatch(filter, scope, menuLabel, query)
          : null}
      </Autocomplete.Empty>
      <EntryList
        sections={sections}
        label={menuLabel ?? READOUT_WORDS.commandsHint}
        drawing={{ query, home: menu === null, activate }}
      />
      <PaletteFooter
        keyed={keyed}
        inMenu={menu !== null}
        showScopeHint={showStrip && scopes.length > 1}
      />
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}

/**
 * What choosing an entry does: a menu opens, a setting changes in place, an unavailable row runs with the palette
 * open, so that it is refused and says why, and any other row closes the palette and runs.
 */
function useActivate(options: {
  onRun(row: PaletteRow, query?: string): void;
  onClose(): void;
  toMenu(menu: MenuId): void;
  announce(text: string): void;
  query: string;
}): (entry: Entry) => void {
  const { onRun, onClose, toMenu, announce, query } = options;
  const [, setChanges] = useState(0);
  return (entry) => {
    if (entry.type === "menu") {
      toMenu(entry.menu);
      return;
    }
    if (!entry.row.enabled) {
      onRun(entry.row, query);
      return;
    }
    if (entry.row.kind === "setting") {
      onRun(entry.row, query);
      setChanges((count) => count + 1);
      const nextValue =
        entry.row.value === null
          ? PALETTE_WORDS.keys.change
          : entry.row.value === READOUT_WORDS.valueOn
            ? READOUT_WORDS.valueOff
            : READOUT_WORDS.valueOn;
      announce(PALETTE_WORDS.settingChanged(entry.row.label, nextValue));
      return;
    }
    onClose();
    onRun(entry.row, query);
  };
}

function OpenPalette(props: Omit<PaletteProps, "open">): ReactNode {
  const {
    filter,
    sources,
    onRun,
    onClose,
    recent,
    placeholder,
    context = null,
    suggested,
    jumpTo,
    quickSettings,
    boost,
    enableScopes = false,
  } = props;
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [scope, setScope] = useState<PaletteScope>("all");
  const [keyed, setKeyed] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [openedAt] = useState(markStart);
  useLayoutEffect(() => markEnd("ui.open.palette", openedAt), [openedAt]);
  const surface = useRef<HTMLDivElement>(null);
  useOutsidePress(surface, onClose);

  const scopes = availableScopes(sources);
  const effectiveScope: PaletteScope = scopes.includes(scope) ? scope : "all";
  const sections = usePaletteSections({
    filter,
    scope: effectiveScope,
    sources,
    recent,
    suggested,
    jumpTo,
    quickSettings,
    boost,
    query,
    menu,
  });
  const entries = entriesOf(sections);
  const keyedEntry = entries.find((entry) => keyOf(entry) === keyed) ?? null;

  const toMenu = (next: MenuId | null): void => {
    setMenu(next);
    setQuery("");
  };
  const activate = useActivate({
    onRun,
    onClose,
    toMenu,
    announce: setAnnouncement,
    query,
  });

  const handleKeyDown: PaletteInputKeyDown = (event) => {
    // while an input method composes, Enter, Escape and the arrows are its own
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      event.preventBaseUIHandler();
      return;
    }
    if (
      event.key === "Tab" &&
      enableScopes &&
      filter === "all" &&
      menu === null &&
      scopes.length > 1
    ) {
      event.preventDefault();
      event.preventBaseUIHandler();
      const index = scopes.indexOf(effectiveScope);
      const step = event.shiftKey ? -1 : 1;
      const next = scopes[(index + step + scopes.length) % scopes.length]!;
      setScope(next);
      return;
    }
    if (event.key === "Backspace" && query === "") {
      if (menu !== null) {
        event.preventBaseUIHandler();
        toMenu(null);
        return;
      }
      if (effectiveScope !== "all") {
        event.preventBaseUIHandler();
        setScope("all");
        return;
      }
    }
    if (event.key === "ArrowLeft" && query === "" && menu !== null) {
      event.preventDefault();
      event.preventBaseUIHandler();
      toMenu(null);
      return;
    }
    if (
      event.key === "ArrowRight" &&
      menu === null &&
      keyedEntry?.type === "menu" &&
      event.currentTarget.selectionStart === query.length &&
      event.currentTarget.selectionEnd === query.length
    ) {
      event.preventDefault();
      event.preventBaseUIHandler();
      toMenu(keyedEntry.menu);
    }
  };

  return (
    <Autocomplete.Root
      // a new list starts with the keys on its first row, and the field focused
      key={`${menu ?? ""}\0${effectiveScope}`}
      inline
      open
      mode="none"
      items={entries}
      value={query}
      onValueChange={(value, details) => {
        // pressing an item writes its text into the field; the query stays what was typed
        if (details.reason === "item-press") return;
        if (
          enableScopes &&
          filter === "all" &&
          menu === null &&
          effectiveScope === "all" &&
          query === "" &&
          value.length === 1
        ) {
          const prefixed = PREFIX_SCOPE[value];
          if (prefixed !== undefined && scopes.includes(prefixed)) {
            setScope(prefixed);
            setQuery("");
            return;
          }
        }
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
        scope={effectiveScope}
        scopes={scopes}
        enableScopes={enableScopes}
        context={context}
        sections={sections}
        entries={entries}
        query={query}
        menu={menu}
        placeholder={placeholder}
        keyed={keyedEntry}
        announcement={announcement}
        onKeyDown={handleKeyDown}
        onClear={() => setQuery("")}
        onSelectScope={setScope}
        activate={activate}
        leaveMenu={() => toMenu(null)}
      />
    </Autocomplete.Root>
  );
}

/**
 * The palette, drawn while `open`, with focus in its field from the first frame.
 * Sources are queried in order; `filter: "places"` queries places alone and `filter: "beside"` lists Beside rows.
 */
export function CommandPalette(props: PaletteProps): ReactNode {
  const { open, onClose, ask = null, ...rest } = props;
  const [closes, setCloses] = useState(0);
  const close = (): void => {
    setCloses((count) => count + 1);
    onClose();
  };
  if (!open) return null;
  if (ask !== null)
    return (
      <PaletteAskView
        key={`${closes}\0${ask.prompt}\0${ask.initial}`}
        ask={ask}
        onClose={close}
      />
    );
  return <OpenPalette key={closes} {...rest} onClose={close} />;
}
