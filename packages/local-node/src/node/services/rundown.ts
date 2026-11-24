// Rundown authority on the node: computed story durations and air windows for authority rooms.
import { createAirWindows, createRundownDurations } from "@manent/server-core";
import type { NodeService } from "../services.ts";

/** Default spoken reading rate in characters per second until project settings supply per-home rates. */
const DEFAULT_READ_RATE = 11.25;

export const rundownService: NodeService = {
  create({ clock, storage, sync }) {
    const durations = createRundownDurations({
      clock,
      storage,
      sync,
      readRateOf: () => DEFAULT_READ_RATE,
    });
    const airWindows = createAirWindows({ clock, storage });
    return {
      hooks: [durations, airWindows.hooks],
      config: {},
      airWindow: airWindows.isInside,
      airWindowOf: airWindows.windowOf,
    };
  },
};
