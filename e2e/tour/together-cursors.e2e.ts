import { expect } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("together-cursors", async ({ page, windows, scenario, step }) => {
  const sams = await step(0);
  await expect(windows[1]!.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  // Ida's first speech after scene 10's heading
  const speechId = await sams.evaluate((root) => {
    const heading = root.querySelectorAll("[data-type='scene_heading']")[9];
    for (let at = heading?.nextElementSibling; at; at = at.nextElementSibling) {
      if (at.getAttribute("data-type") === "scene_heading") break;
      if (
        at.getAttribute("data-type") === "character" &&
        at.textContent?.startsWith("IDA") === true
      )
        return at.nextElementSibling?.getAttribute("data-id") ?? null;
    }
    return null;
  });
  await sams.locator(`[data-id="${speechId}"]`).click();
  const danas = await step(1);
  // Sam's tab shows his name while he moves, then his initials, on the speech he clicked into
  await expect(
    danas.locator(`[data-id="${speechId}"] .mn-cursor-tab`),
  ).toHaveText("SO", { timeout: 6000 });
  await expectEvidence([page], scenario);
});
