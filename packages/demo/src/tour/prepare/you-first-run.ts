// Ready while Your desk has never synced to this server.
import { indexDocId } from "@manent/sync-protocol";
import { SeedDriverError } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY, USED } from "./seeded-doc.ts";

export const YOU_FIRST_RUN: TourPreparation = {
  id: "you-first-run",
  async run(driver) {
    // the version list of Your desk's index answers only once its first sync placed it here
    try {
      await driver.versions("you", indexDocId("workspace", "you"));
      return USED;
    } catch (error) {
      if (error instanceof SeedDriverError && error.code === "refused")
        return READY;
      throw error;
    }
  },
};
