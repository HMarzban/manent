// As Dana, restores Harbour Lights' seeded project settings (including Element style).
import { HARBOUR_LIGHTS_SETTINGS } from "../../content/medium/harbour-lights-series.ts";
import { seedProject } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

export const TOGETHER_STYLE_READY: TourPreparation = {
  id: "together-style-ready",
  async run(driver) {
    if (driver.series === null)
      throw new SeedDriverError("unavailable", "the server has no series");
    const { projectId } = seedProject("medium/harbour-lights");
    await driver.series.setSettings(
      "dana",
      { projectId, workspaceId: "medium" },
      HARBOUR_LIGHTS_SETTINGS,
    );
    return READY;
  },
};
