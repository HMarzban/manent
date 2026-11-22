// Ready while The Long Night's Pink pages are not issued.
import type { TourPreparation } from "./index.ts";

export const LONG_NIGHT_PINK_READY: TourPreparation = {
  id: "long-night-pink-ready",
  run: async () => ({ ok: false, reason: "unknown" }),
};
