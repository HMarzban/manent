// The Tour's desktop-prompter-files scenario: write run-order.txt and one CRLF text file per story into a chosen folder.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROMPTER_FILES_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import { readStatus, statusButton } from "../offline/support.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

test.describe.configure({ timeout: 180_000 });

const STORY_FILE = "01-tolle-exchange-library-council-votes-yes.txt";

tourScenario("desktop-prompter-files", async ({ page, scenario, step }) => {
  const [utf8, writing] = scenario.evidence;
  const dir = await mkdtemp(join(tmpdir(), "manent-prompter-files-"));
  try {
    // Wait until the rundown grid has loaded and synced on the headless desktop node
    await expect(
      page.locator('[role="gridcell"][data-col-id="story"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(statusButton(page)).toBeVisible();
    await expect
      .poll(() => readStatus(page), { timeout: 30_000 })
      .toBe("Saved · Synced");

    // Step 0: select step 0 before opening the Title menu (its portal backdrop intercepts clicks on the Tour panel)
    await selectTourStep(page, scenario.promise, 0);
    const titleMenuBtn = page
      .getByRole("heading", { level: 1 })
      .getByRole("button");
    await titleMenuBtn.click();
    const prompterFilesItem = page
      .locator('[data-tour="prompter.files"]')
      .filter({ visible: true })
      .first();
    await expect(prompterFilesItem).toBeVisible();
    await expect(prompterFilesItem).toHaveAttribute("data-tour-ring", "");
    await expect(prompterFilesItem).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );

    // Close the Title menu, select step 1 before opening the modal dialog, then open Prompter files… from the Title menu
    await page.keyboard.press("Escape");
    await expect(prompterFilesItem).toBeHidden();
    await selectTourStep(page, scenario.promise, 1);
    await titleMenuBtn.click();
    await page
      .getByRole("menuitem", { name: PROMPTER_FILES_WORDS.command })
      .click();

    // Step 1: verify UTF-8 is offered first and selected, highlight Write to, and enter the temp folder path
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    const radios = dialog.getByRole("radio");
    await expect(radios.first()).toHaveAttribute("aria-checked", "true");
    await expect(dialog).toContainText(PROMPTER_FILES_WORDS.utf8);
    await expectEvidence([page], { ...scenario, evidence: [utf8!] });

    const place = dialog.locator('[data-tour="prompter_files:place"]');
    await expect(place).toBeVisible();
    await expect(place).toHaveAttribute("data-tour-ring", "");
    await place.locator("input[type='text']").fill(dir);

    // Step 2: submit and verify the state bar reports writing with the path and Stop
    await dialog
      .getByRole("button", {
        name: PROMPTER_FILES_WORDS.action,
        exact: true,
      })
      .click();
    await expect(dialog).toBeHidden();

    const stateBar = await step(2);
    await expect(stateBar).toContainText(`${writing!} ${dir}`, {
      timeout: 15_000,
    });
    const stopBtn = stateBar.getByRole("button", { name: "Stop", exact: true });
    await expect(stopBtn).toBeVisible();
    await expectEvidence([page], { ...scenario, evidence: [writing!] });

    // Step 3: verify run-order.txt and story 01 on disk with CRLF line endings
    await step(3);
    const runOrderPath = join(dir, "run-order.txt");
    const storyPath = join(dir, STORY_FILE);

    await expect
      .poll(
        async () => {
          try {
            return await readFile(runOrderPath, "utf8");
          } catch {
            return "";
          }
        },
        { timeout: 15_000 },
      )
      .toContain(STORY_FILE);
    const runOrder = await readFile(runOrderPath, "utf8");
    expect(runOrder).toContain("\r\n");
    expect(runOrder).toMatch(
      new RegExp(
        `^1\\tTolle Exchange library: council votes yes\\t${STORY_FILE}\\t\\d+:\\d+\\r\\n`,
        "m",
      ),
    );

    await expect
      .poll(
        async () => {
          try {
            return await readFile(storyPath, "utf8");
          } catch {
            return "";
          }
        },
        { timeout: 15_000 },
      )
      .not.toBe("");
    const storyText = await readFile(storyPath, "utf8");
    expect(storyText).toContain("\r\n");
    expect(storyText.trim().length).toBeGreaterThan(0);

    // Stop writing from the state bar and confirm the files stay on disk
    await stopBtn.click();
    await expect(stateBar).not.toContainText(writing!, { timeout: 10_000 });
    expect(await readFile(runOrderPath, "utf8")).toBe(runOrder);
    expect(await readFile(storyPath, "utf8")).toBe(storyText);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
