// The size past which a script is longer than this release handles comfortably: one figure for every device, as measured.

/** Pages: the smallest script measured against the typing budget on the reference machine; not even this size was found within it. */
export const COMFORT_LIMIT_PAGES = 120;

/** Null (a script without pages) is never past it. */
export function pastComfortLimit(pageCount: number | null): boolean {
  return pageCount !== null && pageCount > COMFORT_LIMIT_PAGES;
}
