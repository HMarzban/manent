// The regions of the window, in the order F6 visits them.

export const REGIONS = [
  "demo_bar",
  "title_bar",
  "state_bar",
  "left_panel",
  "page",
  "side_panel",
  "status_bar",
] as const;

type Region = (typeof REGIONS)[number];

/** The region after `current` (1) or before it (-1), wrapping round; the caller skips a region that is absent. */
export function nextRegion(current: Region, direction: 1 | -1): Region {
  // the index is reduced modulo the length, so it is always inside the list
  return REGIONS[
    (REGIONS.indexOf(current) + direction + REGIONS.length) % REGIONS.length
  ]!;
}
