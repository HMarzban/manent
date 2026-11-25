import { DOCUMENT_WORDS, PREFERENCES_WORDS, SEND_WORDS } from "@manent/ui";
import { pressKeyOf } from "../support/interface.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

const TITLE = "The Lamp Room";

tourScenario("together-settings", async ({ page, windows, scenario, step }) => {
  const danas = windows[2]!;
  await pressKeyOf(page, "app.preferences");
  await page
    .getByRole("button", { name: PREFERENCES_WORDS.appearance, exact: true })
    .click();
  await (await step(0)).getByRole("radio", { name: "Dark" }).click();
  await page.getByRole("button", { name: SEND_WORDS.back(TITLE) }).click();
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.titleMenu(TITLE) })
    .click();
  await page.getByRole("menuitem", { name: "Script settings" }).click();
  await (await step(1)).getByRole("radio", { name: "A4" }).click();
  await expectEvidence([danas], scenario);
});
