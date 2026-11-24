// As Sam, returns his writing position on 205 Slack Water to Privately (keeping his private changes).
import { seedDoc } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

export const TOGETHER_SUGGEST_READY: TourPreparation = {
  id: "together-suggest-ready",
  async run(driver) {
    if (driver.privateCopies === null)
      throw new SeedDriverError(
        "unavailable",
        "the server has no private copies",
      );
    const { docId } = seedDoc("medium/harbour-lights/205");
    await driver.privateCopies.setPosition("sam", docId, "private");
    return READY;
  },
};
