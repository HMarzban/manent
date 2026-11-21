// Ready while Salt's Blue pages are not issued.
import type { TourPreparation } from "./index.ts";

export const SALT_BLUE_READY: TourPreparation = {
  id: "salt-blue-ready",
  run: async () => ({ ok: false, reason: "unknown" }),
};
