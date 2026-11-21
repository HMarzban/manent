// Ready while Your desk has never synced to this server.
import type { TourPreparation } from "./index.ts";

export const YOU_FIRST_RUN: TourPreparation = {
  id: "you-first-run",
  run: async () => ({ ok: false, reason: "unknown" }),
};
