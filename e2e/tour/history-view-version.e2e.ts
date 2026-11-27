import { DOCUMENT_WORDS } from "@manent/ui";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("history-view-version", async ({ page, scenario, step }) => {
  await page.getByRole("button", { name: DOCUMENT_WORDS.historyTab }).click();
  // a click selects the draft, and Enter opens it as it was
  const draft = (await step(0))
    .getByRole("listitem")
    .filter({ hasText: "Table read draft" })
    .first();
  await draft.click();
  await page.keyboard.press("Enter");
  const back = await step(1);
  // what the check reads is shown while the draft is open
  await expectEvidence([page], scenario);
  await back.click();
});
