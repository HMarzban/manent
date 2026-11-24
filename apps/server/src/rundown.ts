// Rundown authority: computed story durations and air windows for rundowns and their linked stories.
import { DEFAULT_READ_RATE } from "@manent/pagination";
import { createAirWindows, createRundownDurations } from "@manent/server-core";
import type { ServerService } from "./services.ts";

export const rundownService: ServerService = {
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
