// The Tour's rundown-feed-lost scenario: stopping the server keeps prompter text and shows Feed lost; starting restores Live without reload.
import { DOCUMENT_WORDS, PROMPTER_WINDOW_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("rundown-feed-lost", async ({ page, scenario, step }) => {
  const [feedLost, showingLast, live] = scenario.evidence;

  await expect(page.locator("[data-tour='rundown:grid']")).toBeVisible();

  await selectTourStep(page, scenario.promise, 0);
  await page
    .getByRole("button", { name: DOCUMENT_WORDS.viewMenu, exact: true })
    .click();
  const prompterPopup = page.waitForEvent("popup");
  await (await step(0)).click();
  const prompter = await prompterPopup;

  let serverStopped = false;
  try {
    const feed = prompter.locator("[data-tour='prompter:feed']");
    await expect(feed).toContainText(live!);

    const reading = prompter.getByRole("main", {
      name: PROMPTER_WINDOW_WORDS.readingAreaLabel,
    });
    const firstBlock = reading.locator("[data-prompter-block]").first();
    await expect(firstBlock).toBeVisible();
    const keptText = (await firstBlock.innerText()).trim();
    expect(keptText.length).toBeGreaterThan(0);

    const stop = (await step(1)).getByRole("button", {
      name: "Stop the server",
    });
    await stop.click();
    serverStopped = true;

    await selectTourStep(page, scenario.promise, 2);
    await expect(feed).toContainText(feedLost!);
    await expect(feed).toContainText(showingLast!);
    await expectEvidence([prompter], {
      ...scenario,
      evidence: [feedLost!, showingLast!],
    });
    await expect(reading).toContainText(keptText);

    const start = (await step(3)).getByRole("button", {
      name: "Start the server",
    });
    await start.click();
    serverStopped = false;

    await expect(feed).toContainText(live!);
    await expectEvidence([prompter], { ...scenario, evidence: [live!] });
  } finally {
    if (serverStopped) {
      const start = page
        .locator("[data-tour='demo:server']")
        .getByRole("button", { name: "Start the server" });
      if (await start.isVisible()) await start.click();
    }
    await prompter.close();
  }
});
