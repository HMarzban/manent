import { DOCUMENT_WORDS } from "@manent/ui";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("history-changes-since", async ({ page, scenario, step }) => {
  // Changes since heads the History tab
  await page.getByRole("tab", { name: DOCUMENT_WORDS.historyTab }).click();
  await (await step(0)).click();
  await page
    .getByRole("menuitem", { name: "Studio draft", exact: true })
    .click();
  const scene = await step(1);
  await scene
    .getByText("The pencil marks stop at Thursday.")
    .scrollIntoViewIfNeeded();
  await expectEvidence([page], scenario);
});
