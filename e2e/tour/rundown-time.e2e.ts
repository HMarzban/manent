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

const OVER_PATTERN = /Over (\d+):(\d{2})/;
const DURATION_PATTERN = /(\d+):(\d{2})/;

function parseSeconds(text: string, pattern: RegExp): number {
  const match = pattern.exec(text);
  if (match === null) return -1;
  return Number(match[1]) * 60 + Number(match[2]);
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

  const initialOverSec = parseSeconds(await anaBar.innerText(), OVER_PATTERN);
  expect(initialOverSec).toBeGreaterThan(0);

  const { rowId } = await selectMailbagRow(ana);
  await expectEvidence([ana], scenario);

  const anaBefore = await rowTimingCells(ana, rowId);
  const danaBefore = await rowTimingCells(dana, rowId);
  const initialDurSec = parseSeconds(anaBefore.dur, DURATION_PATTERN);
  expect(initialDurSec).toBeGreaterThan(0);

  await selectTourStep(ana, scenario.promise, 1);
  await ana
    .getByRole("button", { name: RUNDOWN_WORDS.rowHandle("Benny's Mailbag") })
    .click();
  await (await step(1)).click();

  const beside = ana.locator("[data-tour='beside']");
  await expect(beside).toBeVisible();

  await step(2);
  const dialogue = beside.locator("[data-type='dialogue']").first();
  await expect(dialogue).toBeVisible();
  await dialogue.click();
  await settled(ana);
  await ana.keyboard.press("Meta+a");
  await ana.keyboard.press("Backspace");
  await settled(ana);

  await expect
    .poll(async () => {
      const text = await ana
        .locator(`[role="gridcell"][data-row-id="${rowId}"][data-col-id="dur"]`)
        .innerText();
      return parseSeconds(text, DURATION_PATTERN);
    })
    .toBeLessThan(initialDurSec);

  const danaStepBar = await step(3);
  await expect
    .poll(async () => parseSeconds(await danaStepBar.innerText(), OVER_PATTERN))
    .toBeLessThan(initialOverSec);
  await expect
    .poll(async () => parseSeconds(await anaBar.innerText(), OVER_PATTERN))
    .toBeLessThan(initialOverSec);

  const danaAfter = await rowTimingCells(dana, rowId);
  expect(parseSeconds(danaAfter.dur, DURATION_PATTERN)).toBeLessThan(
    parseSeconds(danaBefore.dur, DURATION_PATTERN),
  );
  expect(danaAfter.cume).not.toBe(danaBefore.cume);
  expect(danaAfter.back).not.toBe(danaBefore.back);
});
