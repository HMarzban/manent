import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

/** Types `text` at the end of the window's first line of action, once its script has had its first sync. */
async function typeLine(window: Page, text: string): Promise<void> {
  await expect(window.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  const line = window
    .locator("[data-tour='page'] [data-type='action']")
    .first();
  const box = await line.boundingBox();
  if (box === null) throw new Error("the line is not drawn");
  await line.click({ position: { x: box.width - 2, y: box.height - 3 } });
  await settled(window);
  await window.keyboard.type(text);
}

tourScenario("together-two-tabs", async ({ page, windows, scenario, step }) => {
  const second = windows[1]!;
  await step(0);
  await typeLine(page, " The kettle ticks as it cools.");
  await typeLine(second, " Somewhere below, a door bangs.");
  await step(1);
  await page.close();
  await expectEvidence([second], scenario);
});
