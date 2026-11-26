// The Tour's rundown-remote-prompter scenario: take control from the rundown, Play, jump to story 02, Free scroll/Follow, and clean pause on feed loss.
import { PROMPTER_CONTROL_WORDS, PROMPTER_WINDOW_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

tourScenario("rundown-remote-prompter", async ({ windows, scenario, step }) => {
  const [page, prompter] = windows as [Page, Page];
  const [freeScroll, follow, feedLost, scrollingPaused] = scenario.evidence;

  const feed = prompter.locator("[data-tour='prompter:feed']");
  await expect(feed).toContainText(PROMPTER_WINDOW_WORDS.live);
  const reading = prompter.getByRole("main", {
    name: PROMPTER_WINDOW_WORDS.readingAreaLabel,
  });
  await expect(reading.locator("[data-prompter-block]").first()).toBeVisible();

  let serverStopped = false;
  let tookControl = false;

  try {
    // Step 0: Take control in the state bar -> docked control strip appears above the grid.
    await (await step(0)).click();
    tookControl = true;
    const toolbar = page.getByRole("toolbar", {
      name: PROMPTER_CONTROL_WORDS.controlPrompter,
    });
    await expect(toolbar).toBeVisible();

    // Step 1: Play, adjust speed, select story 02 and Jump prompter here.
    const playBtn = await step(1);
    await playBtn.click();
    await expect(playBtn).toContainText(PROMPTER_CONTROL_WORDS.pause);

    await toolbar
      .getByRole("button", { name: PROMPTER_CONTROL_WORDS.fast, exact: true })
      .first()
      .click();

    const story02Cell = page
      .locator('[role="gridcell"][data-col-id="story"]')
      .filter({ hasText: "Library: what happens to Mercer Street" })
      .first();
    await expect(story02Cell).toBeVisible();
    await story02Cell.click();

    const jumpBtn = toolbar.getByRole("button", {
      name: PROMPTER_CONTROL_WORDS.jumpHere,
    });
    await expect(jumpBtn).toBeEnabled();
    await jumpBtn.click();

    // Step 2: In the prompter window, manual scroll switches to Free scroll; clicking Follow rejoins.
    await selectTourStep(page, scenario.promise, 2);
    const followSwitch = prompter.locator(
      "[data-tour='prompter:follow_switch']",
    );
    await expect(followSwitch).toBeVisible();
    await reading.evaluate((el) => {
      el.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 160,
          bubbles: true,
          cancelable: true,
        }),
      );
      el.scrollTop = Math.max(el.scrollTop + 120, 120);
    });
    const freeBtn = followSwitch.getByRole("button", { name: freeScroll! });
    const followBtn = followSwitch.getByRole("button", { name: follow! });
    await expect(freeBtn).toHaveAttribute("aria-pressed", "true");
    await expectEvidence([prompter], {
      ...scenario,
      evidence: [freeScroll!, follow!],
    });
    await followBtn.click();
    await expect(followBtn).toHaveAttribute("aria-pressed", "true");

    // Step 3: Stop the server -> prompter pauses cleanly with Feed lost + scrolling paused and keeps text.
    const keptText = (
      await reading.locator("[data-prompter-block]").first().innerText()
    ).trim();
    expect(keptText.length).toBeGreaterThan(0);

    const stopBtn = (await step(3)).getByRole("button", {
      name: "Stop the server",
    });
    await stopBtn.click();
    serverStopped = true;

    await expect(feed).toContainText(feedLost!);
    await expect(feed).toContainText(scrollingPaused!);
    await expectEvidence([prompter], {
      ...scenario,
      evidence: [feedLost!, scrollingPaused!],
    });
    await expect(reading).toContainText(keptText);

    const startBtn = page
      .locator("[data-tour='demo:server']")
      .getByRole("button", { name: "Start the server" });
    await startBtn.click();
    serverStopped = false;
    await expect(feed).toContainText(PROMPTER_WINDOW_WORDS.live);
  } finally {
    if (serverStopped) {
      const startBtn = page
        .locator("[data-tour='demo:server']")
        .getByRole("button", { name: "Start the server" });
      if (await startBtn.isVisible()) await startBtn.click();
    }
    if (tookControl) {
      const stopCtrl = page.getByRole("button", {
        name: PROMPTER_CONTROL_WORDS.stopControlling,
      });
      if (await stopCtrl.isVisible()) await stopCtrl.click();
    }
  }
});
