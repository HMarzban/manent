import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("history-every-version", async ({ page, scenario, step }) => {
  // History is opened from the title menu
  await page.getByRole("heading", { level: 1 }).getByRole("button").click();
  await (await step(0)).click();
  const list = await step(1);
  // the oldest draft is at the foot of the list
  await list.getByText("First draft").first().scrollIntoViewIfNeeded();
  await expectEvidence([page], scenario);
});
