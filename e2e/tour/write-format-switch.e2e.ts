import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import { tourScenario } from "../support/tour.ts";

tourScenario("write-format-switch", async ({ page, scenario, step }) => {
  const [multiCamera, screenplay] = scenario.evidence;
  const sheet = page.locator("[data-tour='page'] [contenteditable='true']");
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  const text = await sheet.textContent();
  await page
    .getByRole("button", {
      name: DOCUMENT_WORDS.titleMenu("Every Key But One"),
    })
    .click();
  await (await step(0)).click();
  const format = await step(1);
  await format.getByRole("combobox").click();
  await page.getByRole("option", { name: multiCamera, exact: true }).click();
  await expect(format.getByRole("combobox")).toContainText(multiCamera!);
  await (await step(2)).getByRole("combobox").click();
  await page.getByRole("option", { name: screenplay, exact: true }).click();
  await expect(format.getByRole("combobox")).toContainText(screenplay!);
  await expect(sheet).toHaveText(String(text));
});
