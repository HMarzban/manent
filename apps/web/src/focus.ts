import { selectors as paletteSelectors } from "./state/palette.store.ts";

/** Focuses the first h1 under `root`; false when there is none, or while the palette is open. */
export function focusHeading(root: {
  querySelector(selector: string): { focus(): void } | null;
}): boolean {
  // a screen drawn after the palette opened leaves the person typing in it; closing the palette gives focus back
  if (paletteSelectors.isOpen()) return false;
  const heading = root.querySelector("h1");
  if (!heading) return false;
  heading.focus();
  return true;
}
