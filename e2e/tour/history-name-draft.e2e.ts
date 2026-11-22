import { HISTORY_WORDS } from "@manent/ui";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("history-name-draft", async ({ page, scenario, step }) => {
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  // the name field opens in History, holding the name it offers
  const field = page.getByRole("textbox", { name: HISTORY_WORDS.nameField });
  await field.fill("Table read draft");
  await field.press("Enter");
  const list = await step(1);
  await list.getByText("Table read draft").first().scrollIntoViewIfNeeded();
  await expectEvidence([page], scenario);
});
