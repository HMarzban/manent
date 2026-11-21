// What the demo bar's controls do on the live server: writers, the Tour's preparations and Reorganise.
import type { SeedTime } from "@manent/demo";
import type { DemoControls } from "@manent/sync-protocol";
import type { LiveTarget } from "../seed/driver.ts";

export function createDemoServices(_options: {
  live: LiveTarget;
  time: () => SeedTime;
  random: () => number;
}): DemoControls & { startPresence(): Promise<void>; close(): Promise<void> } {
  return {
    writers: async (_userId, request) => ({
      asked: request.count,
      count: 0,
      names: [],
      endsAt: null,
    }),
    prepare: async () => ({ ok: false, reason: "unknown" }),
    rebuild: async () => {},
    startPresence: async () => {},
    close: async () => {},
  };
}
