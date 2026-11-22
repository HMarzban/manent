import { expect } from "@playwright/test";
import { tourScenario } from "../support/tour.ts";

tourScenario("write-game-script", async ({ page, scenario, step }) => {
  const [emote, camera, engine] = scenario.evidence;
  const sheet = await step(0);
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await sheet.getByText("PIKE: FLAT · CAL: STUNG").click();
  const readout = await step(1);
  await expect(readout).toHaveText(emote!);
  await sheet.locator("[data-type='camera']").first().click();
  await expect(readout).toHaveText(camera!);
  await sheet.locator("[data-type='engine']").first().click();
  await expect(readout).toHaveText(engine!);
});
