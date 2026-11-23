// The Library's search field, in its title bar between the workspace switcher and Import….
import { Input, LIBRARY_WORDS } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
    <Input
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
      className="h-control w-popover min-w-0 shrink-4 text-ui"
    />
  );
}
