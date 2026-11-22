// As Priya, issues Salt's Blue pages when they are not issued; used once a correction of Blue has gone out.
import { seedDoc } from "../../seed/catalogue.ts";
import type { TourPreparation } from "./index.ts";
import { READY, USED, issuedSet, productionOf, stateOf } from "./seeded-doc.ts";

const SALT = "medium/harbour-lights/202";

export const SALT_BLUE_ISSUED: TourPreparation = {
  id: "salt-blue-issued",
  async run(driver) {
    const state = await stateOf(driver, "priya", SALT);
    const blue = issuedSet(state, "blue");
    if (blue === null) {
      await productionOf(driver).issue("priya", seedDoc(SALT).docId, "");
      return READY;
    }
    const corrected = state.issues.some(
      (i) => i.kind === "correction" && i.setId === blue.setId,
    );
    return corrected ? USED : READY;
  },
};
