// The Library's search field, in its title bar between the workspace switcher and Import….
import { Button, Input, LIBRARY_WORDS, cn } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { libraryHref, useLibraryAddress } from "./library-address.ts";

/**
 * Searches the workspace the address shows as the person types, keeping the address's view to go back to once the
 * field is cleared; Esc clears it.
 */
export function SearchField(): ReactNode {
  const navigate = useNavigate();
  const address = useLibraryAddress();
  const { q } = address;
  const [value, setValue] = useState(q ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  // the address's search also changes without the field, as when the side list shows a view or the person goes back
  useEffect(() => setValue(q ?? ""), [q]);
  const searchFor = (next: string): void => {
    setValue(next);
    void navigate({
      href: libraryHref({ ...address, q: next }),
      replace: true,
    });
  };
  return (
    <div className="relative flex w-popover min-w-0 shrink-4 items-center">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute start-2.5 size-icon text-fg-muted"
      />
      <Input
        ref={inputRef}
        type="search"
        aria-label={LIBRARY_WORDS.search}
        placeholder={LIBRARY_WORDS.searchPlaceholder}
        value={value}
        onChange={(event) => searchFor(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || value === "") return;
          event.preventDefault();
          searchFor("");
        }}
        className={cn(
          "h-control w-full ps-8 text-ui [&::-webkit-search-cancel-button]:hidden",
          value === "" ? undefined : "pe-7",
        )}
      />
      {value === "" ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={LIBRARY_WORDS.clearSearch}
          onClick={() => {
            searchFor("");
            inputRef.current?.focus();
          }}
          className="absolute end-1"
        >
          <XIcon
            aria-hidden="true"
            className="size-3.5 text-fg-muted group-hover/button:text-fg"
          />
        </Button>
      )}
    </div>
  );
}
