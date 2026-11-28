import { DOCUMENT_WORDS, PREFERENCES_WORDS, SEND_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import { pressKeyOf } from "../support/interface.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

const TITLE = "The Lamp Room";

tourScenario("together-settings", async ({ page, windows, scenario, step }) => {
  const samsOther = windows[1]!;
  const danas = windows[2]!;
  await expect(danas.locator("[data-tour='status:page']")).toContainText(
    "of 12",
  );
  await pressKeyOf(page, "app.preferences");
  await expect(
    page.getByRole("heading", { level: 1, name: PREFERENCES_WORDS.title }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: PREFERENCES_WORDS.appearance, exact: true })
    .click();
  await (await step(0)).getByRole("radio", { name: "Dark" }).click();
  await expect(samsOther.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(danas.locator("html")).not.toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: SEND_WORDS.back(TITLE) }).click();
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.titleMenu(TITLE) })
    .click();
  await page.getByRole("menuitem", { name: "Script settings" }).click();
  const paperRow = await step(1);
  const paperCombo = paperRow.getByRole("combobox");
  if ((await paperCombo.count()) > 0) {
    await paperCombo.click();
    await page.getByRole("option", { name: "A4", exact: true }).click();
  } else {
    await paperRow.getByRole("radio", { name: "A4" }).click();
  }
  await expectEvidence([danas], scenario);
  for (const win of windows)
    await expect(win.locator("[data-tour='status:page']")).toContainText(
      "of 11",
    );
});
