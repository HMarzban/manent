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
  await expect(danas.locator(".mn-cursor")).toBeAttached();
  await expectEvidence([page], scenario);
});
