import { DEMO_PEOPLE } from "@manent/demo";
import { DEMO_WORDS, stateBarLines } from "@manent/ui";
import { expect } from "@playwright/test";
import { expectEvidence, tourScenario } from "../support/tour.ts";

const SAM = DEMO_PEOPLE.find((p) => p.userId === "sam")!;
// the state bar's line for one who may only comment, as Leo may and Sam may not
const VIEW_ONLY = stateBarLines([{ kind: "role_comment" }]).left!.sentence;

tourScenario("together-roles", async ({ page, scenario, step }) => {
  const sheet = page.locator("[data-tour='page'] [contenteditable]").first();
  await sheet.click();
  await page.keyboard.type("Leo was here.");
  await step(0);
  await expectEvidence([page], scenario);
  await (await step(1)).click();
  await page.getByRole("button", { name: SAM.name }).click();
  const stateBar = page.locator("[data-tour='state_bar']");
  // only a tab that is Sam names him in the demo bar; his Synced then says the server has given him his role
  await expect(
    page.getByRole("button", { name: DEMO_WORDS.person(SAM.name) }),
  ).toBeVisible();
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await expect(stateBar).not.toContainText(VIEW_ONLY);
  await expect(stateBar.getByText("Issue Pink…")).toHaveCount(0);
});
