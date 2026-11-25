import type { TourScenario, TourWindow } from "../format.ts";

/** A scenario's set-up in any shell: its first window, then `extraWindows`, after the preparation `prepare` when it is set. */
export const setupOf = (
  first: TourWindow,
  extraWindows: readonly TourWindow[] = [],
  prepare: string | null = null,
): TourScenario["setup"] => ({ ...first, extraWindows, prepare, shell: "any" });
