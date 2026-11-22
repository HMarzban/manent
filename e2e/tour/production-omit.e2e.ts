import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("production-omit", async ({ page, scenario, step }) => {
  await step(0);
  const heading = page.locator('[data-editor-host] [data-scene="25"]');
  await heading.scrollIntoViewIfNeeded();
  await heading.click();
  await page
    .locator('[data-region="status_bar"]')
    .getByRole("button", { name: "View", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Revision marks" }).hover();
  await (await step(1)).click();
  await expectEvidence([page], scenario);
});
