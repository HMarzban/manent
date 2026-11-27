// The palette's search field, clear control, scope filter strip and quiet context caption.
import { Autocomplete } from "@base-ui/react/autocomplete";
import { SearchIcon, XIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "../components/stock/button.tsx";
import { READOUT_WORDS } from "../words/document.ts";
import { PALETTE_WORDS } from "../words/palette.ts";
import type { PaletteScope } from "./palette-sources.ts";

export type PaletteInputKeyDown = NonNullable<
  ComponentProps<typeof Autocomplete.Input>["onKeyDown"]
>;

/** Leading single-character shortcuts that jump straight to a scope pill from an empty query. */
export const PREFIX_SCOPE: Readonly<Record<string, PaletteScope>> =
  Object.freeze({
    ">": "commands",
    ",": "settings",
    "#": "places",
    "/": "documents",
  });

/** The search row: direct child of the palette surface so `div:has(> div > [role="combobox"])` stays intact. */
export function PaletteField(props: {
  readonly query: string;
  readonly menuLabel: string | null;
  readonly scope: PaletteScope;
  readonly placeholder?: string;
  readonly onKeyDown: PaletteInputKeyDown;
  readonly onClear: () => void;
  readonly leaveMenu: () => void;
}): ReactNode {
  const {
    query,
    menuLabel,
    scope,
    placeholder,
    onKeyDown,
    onClear,
    leaveMenu,
  } = props;
  const fieldPlaceholder =
    menuLabel !== null
      ? PALETTE_WORDS.placeholderIn(menuLabel)
      : scope !== "all"
        ? PALETTE_WORDS.placeholderScope(PALETTE_WORDS.scopes[scope])
        : placeholder;
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
        onKeyDown={onKeyDown}
        aria-label={READOUT_WORDS.commandsHint}
        placeholder={fieldPlaceholder}
        className="mn-palette-field h-full min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-muted"
      />
      {query === "" ? null : (
        <button
          type="button"
          tabIndex={-1}
          aria-label={PALETTE_WORDS.clearSearch}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
          className="mn-palette-clear inline-flex size-6 shrink-0 items-center justify-center rounded-control text-fg-muted hover:bg-subtle hover:text-fg"
        >
          <XIcon aria-hidden="true" className="size-icon" />
        </button>
      )}
    </div>
  );
}

/** Calm sibling strip below the field: scope filter pills on the start, quiet context caption on the end. */
export function PaletteScopeStrip(props: {
  readonly scopes: readonly PaletteScope[];
  readonly active: PaletteScope;
  readonly context: string | null;
  readonly onSelect: (scope: PaletteScope) => void;
}): ReactNode {
  const { scopes, active, context, onSelect } = props;
  if (scopes.length <= 1 && context === null) return null;
  return (
    <div className="flex min-h-8 shrink-0 items-center justify-between gap-2 border-b border-line bg-chrome px-3 py-1">
      <div
        role="group"
        aria-label={PALETTE_WORDS.scopeListLabel}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {scopes.map((scope) => {
          const pressed = scope === active;
          return (
            <button
              key={scope}
              type="button"
              tabIndex={-1}
              aria-pressed={pressed}
              data-palette-scope={scope}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(scope)}
              className="mn-palette-scope inline-flex h-6 shrink-0 items-center rounded-control px-2 text-meta font-medium"
            >
              {PALETTE_WORDS.scopes[scope]}
            </button>
          );
        })}
      </div>
      {context === null ? null : (
        <span
          data-palette-context=""
          className="max-w-48 shrink-0 truncate text-meta text-fg-muted @max-[34rem]:hidden"
        >
          {context}
        </span>
      )}
    </div>
  );
}
