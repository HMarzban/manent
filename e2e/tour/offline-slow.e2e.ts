// The Tour's offline-slow scenario: on a slow connection a line is saved at once and synced when it arrives.
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("offline-slow", async ({ page, scenario, step }) => {
  const [syncing, synced] = scenario.evidence;
  await (await step(0)).getByRole("button", { name: "Slow" }).click();
  const action = (await step(1)).locator("[data-type='action']").first();
  await action.click({ position: { x: 1, y: 1 } });
  await settled(page);
  await page.keyboard.type("The engine coughs twice. ");
  await expectEvidence([page], { ...scenario, evidence: [syncing!] });
  await (await step(2)).getByRole("button", { name: "Online" }).click();
  await expectEvidence([page], { ...scenario, evidence: [synced!] });
});
