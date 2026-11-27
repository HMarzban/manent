import { DOCUMENT_WORDS } from "@manent/ui";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("history-changes-prose", async ({ page, scenario, step }) => {
  // Changes since heads the History tab
  await page.getByRole("button", { name: DOCUMENT_WORDS.historyTab }).click();
  await (await step(0)).click();
  await page
    .getByRole("menuitem", { name: "First draft", exact: true })
    .click();
  const opening = await step(1);
  await opening
    .getByText("On Tuesdays the bin lorry came down Mallow Street")
    .scrollIntoViewIfNeeded();
  await expectEvidence([page], scenario);
});
