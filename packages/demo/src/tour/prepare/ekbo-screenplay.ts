// As Sam, sets Every Key But One's format to Screenplay when it is not.
import type { TourPreparation } from "./index.ts";
import { settleSetting } from "./seeded-doc.ts";

export const EKBO_SCREENPLAY: TourPreparation = {
  id: "ekbo-screenplay",
  run: (driver) =>
    settleSetting(driver, "sam", {
      key: "small/every-key-but-one/script",
      setting: "script.format",
      value: "screenplay",
    }),
};
