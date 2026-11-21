// Ready while Undertow's page numbers are not locked.
import type { TourPreparation } from "./index.ts";

export const UNDERTOW_UNLOCKED: TourPreparation = {
  id: "undertow-unlocked",
  run: async () => ({ ok: false, reason: "unknown" }),
};
