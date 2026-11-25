import type { TourFeature } from "./features.ts";

/**
 * Features of `TOUR_FEATURES` that have shipped, one per line at the end: a scenario waiting for one is refused, so
 * its scenarios carry `waitsFor: null`.
 */
export const TOUR_RELEASED: readonly TourFeature[] = Object.freeze([
  "names_and_facts",
  "outline_to_script",
  "alternates_and_cuts",
  "start_from",
  "follow",
  "comments",
  "reader_drafts",
  "suggesting",
  "present",
  "private_writing",
  "rounds",
  "send_draft",
  "copy_script",
  "game_lines",
  "ink_player",
]);
