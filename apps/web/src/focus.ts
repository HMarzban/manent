/** Focuses the first h1 under `root`; false when there is none. */
export function focusHeading(root: {
  querySelector(selector: string): { focus(): void } | null;
}): boolean {
  const heading = root.querySelector("h1");
  if (!heading) return false;
  heading.focus();
  return true;
}
