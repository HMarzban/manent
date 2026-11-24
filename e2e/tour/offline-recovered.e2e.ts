// The Tour's offline-recovered scenario: words typed offline into a scene someone else deleted are kept in Recovered
// text.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

/** Scene `n`'s heading in `window`'s script, counting from 1. */
const heading = (window: Page, n: number) =>
  window.locator("[data-tour='page'] [data-type='scene_heading']").nth(n - 1);

tourScenario("offline-recovered", async ({ windows, scenario, step }) => {
  const [dana, priya] = windows as [Page, Page];
  await (await step(0)).getByRole("button", { name: "Offline" }).click();
  await heading(dana, 16)
    .locator("xpath=following::*[@data-type='action'][1]")
    .click({ position: { x: 1, y: 1 } });
  await settled(dana);
  await dana.keyboard.type("The kettle starts to sing. ");
  await (await step(1)).click();
  // from the start of scene 16's heading to the start of scene 17's: the whole scene
  await heading(priya, 16).click({ position: { x: 1, y: 1 } });
  await settled(priya);
  await heading(priya, 17).click({
    position: { x: 1, y: 1 },
    modifiers: ["Shift"],
  });
  await settled(priya);
  await priya.keyboard.press("Backspace");
  // the deletion has reached the server once her status has gone from Syncing… back to Synced
  const priyaServer = priya.locator("[data-tour='status:server']");
  await expect(priyaServer).toHaveText("Syncing…");
  await expect(priyaServer).toHaveText(/^Synced/);
  await (await step(2)).getByRole("button", { name: "Online" }).click();
  await expectEvidence([dana], scenario);
});
