// As Dana, ensures Leo has Can view directly on 205 Slack Water.
import { seedDoc } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

export const TOGETHER_SHARE_READY: TourPreparation = {
  id: "together-share-ready",
  async run(driver) {
    if (driver.sharing === null)
      throw new SeedDriverError("unavailable", "the server has no sharing");
    const { docId } = seedDoc("medium/harbour-lights/205");
    await driver.sharing.grant("dana", docId, "leo", "view");
    return READY;
  },
};
