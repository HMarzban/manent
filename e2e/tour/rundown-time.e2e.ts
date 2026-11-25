// The Tour's rundown-time scenario: cutting a Mailbag letter updates live ● Dur and both Ana's and Dana's timing figures.
import { RUNDOWN_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const SIGNED_DELTA_PATTERN = /(Over|Under) (\d+):(\d{2})/;
const DURATION_PATTERN = /(\d+):(\d{2})/;

function parseSeconds(text: string): number | null {
  const match = DURATION_PATTERN.exec(text);
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseSignedDeltaSeconds(text: string): number | null {
  const match = SIGNED_DELTA_PATTERN.exec(text);
  if (match === null) return null;
  const seconds = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "Under" ? -seconds : seconds;
}

async function selectBlockText(page: Page, block: Locator): Promise<void> {
  await block.scrollIntoViewIfNeeded();
  await block.click();
  await settled(page);
  await block.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await settled(page);
}

async function rowTimingCells(
  page: Page,
  rowId: string,
): Promise<{ dur: string; cume: string; start: string; back: string }> {
  const cellText = async (col: string): Promise<string> =>
    (
      await page
        .locator(
          `[role="gridcell"][data-row-id="${rowId}"][data-col-id="${col}"]`,
        )
        .innerText()
    ).trim();
  const [dur, cume, start, back] = await Promise.all([
    cellText("dur"),
    cellText("cume"),
    cellText("start"),
    cellText("back"),
  ]);
  return { dur, cume, start, back };
}

async function selectMailbagRow(
  page: Page,
): Promise<{ rowId: string; cell: Locator }> {
  const cell = page
    .locator('[role="gridcell"][data-col-id="segment"]')
    .filter({ hasText: "Benny's Mailbag" })
    .first();
  await expect(cell).toBeVisible();
  const rowId = await cell.getAttribute("data-row-id");
  expect(rowId).not.toBeNull();
  await cell.click();
  return { rowId: rowId!, cell };
}

tourScenario("rundown-time", async ({ windows, scenario, step }) => {
  const [ana, dana] = windows as [Page, Page];
  const [target, over] = scenario.evidence;

  const anaBar = await step(0);
  await expect(anaBar).toContainText(target!);
  await expect(anaBar).toContainText(over!);

  const danaBar = dana.locator("[data-tour='state_bar']").first();
  await expect(danaBar).toContainText(target!);
  await expect(danaBar).toContainText(over!);

  const initialOverSec = parseSignedDeltaSeconds(await anaBar.innerText());
  expect(initialOverSec).not.toBeNull();
  expect(initialOverSec!).toBeGreaterThan(0);

  const { rowId } = await selectMailbagRow(ana);
  await expectEvidence([ana], scenario);

  const anaBefore = await rowTimingCells(ana, rowId);
  const danaBefore = await rowTimingCells(dana, rowId);
  const initialDurSec = parseSeconds(anaBefore.dur);
  expect(initialDurSec).not.toBeNull();
  expect(initialDurSec!).toBeGreaterThan(0);
  const danaBeforeDurSec = parseSeconds(danaBefore.dur);
  expect(danaBeforeDurSec).not.toBeNull();
  expect(danaBeforeDurSec!).toBeGreaterThan(0);

  await selectTourStep(ana, scenario.promise, 1);
  await ana
    .getByRole("button", { name: RUNDOWN_WORDS.rowHandle("Benny's Mailbag") })
    .click();
  await (await step(1)).click();

  const beside = ana.locator("[data-tour='beside']");
  await expect(beside).toBeVisible();

  await step(2);
  const letter = beside
    .locator("[data-type='dialogue']")
    .filter({ hasText: "Dear Benny" })
    .first();
  await expect(letter).toBeVisible();
  await selectBlockText(ana, letter);
  await ana.keyboard.press("Backspace");
  await settled(ana);

  const anaDurCell = ana.locator(
    `[role="gridcell"][data-row-id="${rowId}"][data-col-id="dur"]`,
  );
  await expect
    .poll(async () => {
      const current = parseSeconds(await anaDurCell.innerText());
      return current !== null && current >= 0 && current < initialDurSec!;
    })
    .toBe(true);
  const anaAfterDurSec = parseSeconds(await anaDurCell.innerText());
  expect(anaAfterDurSec).not.toBeNull();
  expect(anaAfterDurSec!).toBeGreaterThanOrEqual(0);
  expect(anaAfterDurSec!).toBeLessThan(initialDurSec!);

  const danaStepBar = await step(3);
  await expect
    .poll(async () => {
      const current = parseSignedDeltaSeconds(await danaStepBar.innerText());
      return current !== null && current < initialOverSec!;
    })
    .toBe(true);
  const danaAfterOverSec = parseSignedDeltaSeconds(
    await danaStepBar.innerText(),
  );
  expect(danaAfterOverSec).not.toBeNull();
  expect(danaAfterOverSec!).toBeGreaterThanOrEqual(0);
  expect(danaAfterOverSec!).toBeLessThan(initialOverSec!);

  await expect
    .poll(async () => {
      const current = parseSignedDeltaSeconds(await anaBar.innerText());
      return current !== null && current < initialOverSec!;
    })
    .toBe(true);
  const anaAfterOverSec = parseSignedDeltaSeconds(await anaBar.innerText());
  expect(anaAfterOverSec).not.toBeNull();
  expect(anaAfterOverSec!).toBeGreaterThanOrEqual(0);
  expect(anaAfterOverSec!).toBeLessThan(initialOverSec!);

  const danaAfter = await rowTimingCells(dana, rowId);
  const danaAfterDurSec = parseSeconds(danaAfter.dur);
  expect(danaAfterDurSec).not.toBeNull();
  expect(danaAfterDurSec!).toBeGreaterThanOrEqual(0);
  expect(danaAfterDurSec!).toBeLessThan(danaBeforeDurSec!);
  expect(danaAfter.cume).not.toBe(danaBefore.cume);
  expect(danaAfter.back).not.toBe(danaBefore.back);
});
