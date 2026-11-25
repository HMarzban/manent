import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("write-ruler", async ({ page, scenario, step }) => {
  const sheet = page.locator("[data-tour='page']");
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.viewMenu, exact: true })
    .click();
  await (await step(0)).click();
  await page.keyboard.press("Escape");
  // a speech below the top of the page, where the Ruler's bar is drawn
  const speech = sheet.locator("[data-type='dialogue']").nth(2);
  const readout = page.locator("[data-tour='readout:element']");
  // the Ruler's bar arrives with the caret and moves the page down by its height, which a click may land in
  await expect(async () => {
    await speech.click();
    await expect(readout).toHaveText("Dialogue", { timeout: 1000 });
  }).toPass();
  const ruler = await step(1);
  const marker = ruler.locator("[data-marker='indent']");
  const box = await marker.boundingBox();
  if (box === null) throw new Error("the ruler draws no indent marker");
  const indent = (): Promise<string> =>
    speech.evaluate((b) => getComputedStyle(b).getPropertyValue("--el-indent"));
  const before = await indent();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect.poll(indent).not.toBe(before);
  await (await step(2)).click();
  await expectEvidence([page], scenario);
  // the seeded script is shared by the Tour's other scenarios
  await speech.click();
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(indent, { timeout: 500 }).toBe(before);
  }).toPass();
  // the undo reaches the server before the window closes
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
});
