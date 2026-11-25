// The Library's search field, in its title bar between the workspace switcher and Import….
import { Button, Input, SEARCH_WORDS } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { registerSearchFieldFocus } from "../../search/search-focus.ts";
import { useEnvironment } from "../../services/context.tsx";
import { libraryHref, useLibraryAddress } from "./library-address.ts";

const DEBOUNCE_MS = 150;

/**
 * Searches the workspace the address shows with a 150 ms debounce, keeping the address's view to go back to once the
 * field is cleared; Esc clears it, and ArrowDown moves focus into the first result row.
 */
export function SearchField(): ReactNode {
  const navigate = useNavigate();
  const { schedule } = useEnvironment();
  const address = useLibraryAddress();
  const { q } = address;
  const [value, setValue] = useState(q ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelTimer = useRef<(() => void) | null>(null);
  const addressRef = useRef(address);
  addressRef.current = address;

  // Keep the field in sync when the address changes externally (e.g. Filter ▾, sidebar navigation, Back).
  useEffect(() => {
    cancelTimer.current?.();
    cancelTimer.current = null;
    setValue(q ?? "");
  }, [q]);

  useEffect(
    () =>
      registerSearchFieldFocus(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }),
    [],
  );

  useEffect(
    () => () => {
      cancelTimer.current?.();
      cancelTimer.current = null;
    },
    [],
  );

  const commitQuery = (next: string): void => {
    cancelTimer.current?.();
    cancelTimer.current = null;
    void navigate({
      href: libraryHref({ ...addressRef.current, q: next }),
      replace: true,
    });
  };

  const scheduleQuery = (next: string): void => {
    setValue(next);
    cancelTimer.current?.();
    if (next.trim() === "") {
      commitQuery("");
      return;
    }
    cancelTimer.current = schedule(() => {
      cancelTimer.current = null;
      commitQuery(next);
    }, DEBOUNCE_MS);
  };

  return (
    <div className="relative flex w-popover min-w-0 shrink-4 items-center">
      <Input
        ref={inputRef}
        type="search"
        data-search-field="library"
        aria-label={SEARCH_WORDS.fieldLabel}
        placeholder={SEARCH_WORDS.placeholder}
        value={value}
        onChange={(event) => scheduleQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value !== "") {
            event.preventDefault();
            setValue("");
            commitQuery("");
            return;
          }
          if (event.key === "ArrowDown") {
            const firstRow = document.querySelector<HTMLElement>(
              '[data-search-results] [role="listitem"] [role="button"], [data-search-results] [role="listitem"] button',
            );
            if (firstRow !== null) {
              event.preventDefault();
              firstRow.focus();
            }
          }
        }}
        className="h-control w-full min-w-0 pe-7 text-ui [&::-webkit-search-cancel-button]:hidden"
      />
      {value === "" ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={SEARCH_WORDS.clearSearch}
          onClick={() => {
            setValue("");
            commitQuery("");
            inputRef.current?.focus();
          }}
          className="absolute end-1 cursor-pointer text-fg-muted hover:text-fg"
        >
          <XIcon aria-hidden="true" className="size-icon" />
        </Button>
      )}
    </div>
  );
}
