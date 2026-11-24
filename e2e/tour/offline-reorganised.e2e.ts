// The Tour's offline-reorganised scenario: changes made offline are re-applied to a script reorganised meanwhile.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { expectEvidence, tourScenario } from "../support/tour.ts";

/** Types `text` into the first line of action of scene `n` of `window`'s script. */
async function typeInScene(
  window: Page,
  n: number,
  text: string,
): Promise<void> {
  await window
    .locator("[data-tour='page'] [data-type='scene_heading']")
    .nth(n - 1)
    .locator("xpath=following::*[@data-type='action'][1]")
    .click({ position: { x: 1, y: 1 } });
  await settled(window);
  await window.keyboard.type(text);
}

tourScenario(
  "offline-reorganised",
  async ({ page, windows, scenario, step }) => {
    const [reorganised, synced] = scenario.evidence;
    await (await step(0)).getByRole("button", { name: "Offline" }).click();
    await typeInScene(page, 15, "Gulls on the roof. ");
    await typeInScene(page, 16, "The radio hisses. ");
    const reorganise = await step(1);
    // Reorganise is offered once Priya's window has its script open
    await expect(reorganise).not.toHaveAttribute("aria-disabled", "true");
    await reorganise.click();
    // the server has reorganised the script once Priya's window says so, which takes it some seconds
    await expect(
      windows[1]!.locator("[data-tour='message_slot']"),
    ).toContainText("Manent reorganised how this script is stored.", {
      timeout: 20_000,
    });
    await (await step(2)).getByRole("button", { name: "Online" }).click();
    await expectEvidence([page], { ...scenario, evidence: [reorganised!] });
    await expectEvidence([page], { ...scenario, evidence: [synced!] });
  },
);
