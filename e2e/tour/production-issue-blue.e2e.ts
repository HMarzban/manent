import { expect, test } from "@playwright/test";
import { tourScenario } from "../support/tour.ts";

// a fresh seed comes first
test.describe.configure({ timeout: 180_000 });

tourScenario("production-issue-blue", async ({ page, scenario, step }) => {
  const [overflow = "", header = ""] = scenario.evidence;
  await (await step(0)).click();
  await expect(await step(1)).toContainText(overflow);
  await (await step(2)).click();
  await expect(page).toHaveURL((at) => !at.pathname.endsWith("/send/issue"));
  // the header is drawn from the sheet's attribute
  await expect(
    page
      .locator(`[data-editor-host] .mn-sheet[data-rev-head^="${header}"]`)
      .first(),
  ).toBeAttached();
});
