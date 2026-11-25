// The Tour's rundown-prompter scenario: sending Monologue to the prompter and adjusting Text size, Dark and Mirror.
import {
  DOCUMENT_WORDS,
  PROMPTER_WINDOW_WORDS,
  RUNDOWN_WORDS,
} from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("rundown-prompter", async ({ page, scenario, step }) => {
  const [sentMessage, speechLine, live] = scenario.evidence;

  const monologueCell = page
    .locator('[role="gridcell"][data-col-id="segment"]')
    .filter({ hasText: "Monologue" })
    .first();
  await expect(monologueCell).toBeVisible();
  await monologueCell.click();

  await selectTourStep(page, scenario.promise, 0);
  await page
    .getByRole("button", { name: RUNDOWN_WORDS.rowHandle("Monologue") })
    .click();
  await (await step(0)).click();

  const beside = page.locator("[data-tour='beside']");
  await expect(beside).toBeVisible();

  await (await step(1)).click();
  await expectEvidence([page], { ...scenario, evidence: [sentMessage!] });

  await selectTourStep(page, scenario.promise, 2);
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.viewMenu, exact: true })
    .click();
  const prompterPopup = page.waitForEvent("popup");
  await (await step(2)).click();
  const prompter = await prompterPopup;

  try {
    await selectTourStep(page, scenario.promise, 3);
    const prompterWindow = prompter.locator("[data-tour='prompter:window']");
    await expect(prompterWindow).toBeVisible();

    await expectEvidence([prompter], {
      ...scenario,
      evidence: [speechLine!, live!],
    });

    const reading = prompter.getByRole("main", {
      name: PROMPTER_WINDOW_WORDS.readingAreaLabel,
    });
    const blockKinds = await reading
      .locator("[data-prompter-block]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-block-kind")),
      );
    expect(blockKinds.length).toBeGreaterThan(0);
    for (const kind of blockKinds)
      expect(["character", "parenthetical", "dialogue"]).toContain(kind);

    const larger = prompter.getByRole("button", {
      name: PROMPTER_WINDOW_WORDS.largerText,
    });
    const sizeBefore = await prompter
      .locator("header")
      .getByText(/^\d+ px$/)
      .innerText();
    await larger.click();
    await expect(
      prompter.locator("header").getByText(/^\d+ px$/),
    ).not.toHaveText(sizeBefore);

    const darkSwitch = prompter.getByRole("switch", {
      name: PROMPTER_WINDOW_WORDS.dark,
    });
    await darkSwitch.click();
    await expect(prompterWindow).toHaveAttribute("data-theme", "light");

    const mirrorSwitch = prompter.getByRole("switch", {
      name: PROMPTER_WINDOW_WORDS.mirror,
    });
    await mirrorSwitch.click();
    await expect(prompter.locator("[data-prompter-mirror]")).toHaveAttribute(
      "data-prompter-mirror",
      "on",
    );
  } finally {
    await prompter.close();
  }
});
