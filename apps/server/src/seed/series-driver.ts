// The seed driver's series: seasons and episodes in a project's index.
import type { SeedSeries } from "@manent/demo";
import type { Driving } from "./driving.ts";

/** Null for every server. */
export function createSeriesDriver(_d: Driving): SeedSeries | null {
  return null;
}
