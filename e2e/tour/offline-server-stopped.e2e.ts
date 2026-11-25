// The Tour's offline-server-stopped scenario: with the server stopped a line waits on this device, and syncs once the
// server is back.
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

tourScenario("offline-server-stopped", async ({ page, scenario, step }) => {
  const [unreachable, synced] = scenario.evidence;
  const stop = (await step(0)).getByRole("button", { name: "Stop the server" });
  await stop.click();
  const action = (await step(1)).locator("[data-type='action']").first();
  await action.click({ position: { x: 1, y: 1 } });
  await settled(page);
  await page.keyboard.type("The engine coughs twice. ");
  await expectEvidence([page], { ...scenario, evidence: [unreachable!] });
  const start = (await step(2)).getByRole("button", {
    name: "Start the server",
  });
  await start.click();
  await expectEvidence([page], { ...scenario, evidence: [synced!] });
});
