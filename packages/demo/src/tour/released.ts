import type { TourFeature } from "./features.ts";

/**
 * Features of `TOUR_FEATURES` that have shipped, one per line at the end: a scenario waiting for one is refused, so
 * its scenarios carry `waitsFor: null`.
 */
export const TOUR_RELEASED: readonly TourFeature[] = Object.freeze([]);
