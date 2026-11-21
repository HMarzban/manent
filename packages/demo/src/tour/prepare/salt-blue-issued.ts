// As Priya, issues Salt's Blue pages when they are not issued; used once a correction of Blue has gone out.
import type { TourPreparation } from "./index.ts";

export const SALT_BLUE_ISSUED: TourPreparation = {
  id: "salt-blue-issued",
  run: async () => ({ ok: false, reason: "unknown" }),
};
