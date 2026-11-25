// Focus registration for the Library search field so `library.search` can move focus into it.

let focuser: (() => void) | null = null;

export function registerSearchFieldFocus(fn: () => void): () => void {
  focuser = fn;
  return () => {
    if (focuser === fn) focuser = null;
  };
}

export function focusSearchField(): void {
  if (focuser !== null) {
    focuser();
    return;
  }
  if (typeof document === "undefined") return;
  const input = document.querySelector<HTMLInputElement>(
    '[data-search-field="library"]',
  );
  input?.focus();
  input?.select();
}
