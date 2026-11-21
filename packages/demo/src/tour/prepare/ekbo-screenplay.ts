// As Sam, sets Every Key But One's format to Screenplay when it is not.
import type { TourPreparation } from "./index.ts";

export const EKBO_SCREENPLAY: TourPreparation = {
  id: "ekbo-screenplay",
  run: async () => ({ ok: false, reason: "unknown" }),
};
