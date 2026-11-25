// The Tour's write-podcast-timing scenario: live running time, selection time in Details, unread Cue time check, and Exclude from timing.
import { DOCUMENT_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import {
  expectEvidence,
  selectTourStep,
  tourScenario,
} from "../support/tour.ts";

const DURATION_PATTERN = /(\d+):(\d{2})/;

function parseSeconds(text: string): number | null {
  const match = DURATION_PATTERN.exec(text);
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

async function selectBlockText(page: Page, block: Locator): Promise<void> {
  await block.scrollIntoViewIfNeeded();
  await block.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await settled(page);
}

async function dragSelectBlock(page: Page, block: Locator): Promise<void> {
  await block.scrollIntoViewIfNeeded();
  const box = await block.boundingBox();
  expect(box).not.toBeNull();
  const y = box!.y + Math.min(10, box!.height / 2);
  await page.mouse.move(box!.x + 4, y);
  await page.mouse.down();
  await page.mouse.move(box!.x + Math.max(40, box!.width - 8), y, {
    steps: 5,
  });
  await page.mouse.up();
  await settled(page);
}

async function placeCaretAtEnd(page: Page, block: Locator): Promise<void> {
  await block.scrollIntoViewIfNeeded();
  await block.click();
  await block.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await settled(page);
}

tourScenario("write-podcast-timing", async ({ page, scenario, step }) => {
  const [initialTime, timeLabel, unreadCheck] = scenario.evidence;
  const side = page.locator("[data-region='side_panel']");

  const readout = await step(0);
  await expect(readout).toContainText(initialTime!);
  const startSeconds = parseSeconds(await readout.innerText());
  expect(startSeconds).not.toBeNull();
  expect(startSeconds!).toBeGreaterThan(0);

  const sheet = page.locator("[data-tour='page']");
  const doreenSpeechId = await sheet.evaluate((root) => {
    const characters = root.querySelectorAll("[data-type='character']");
    for (const character of characters) {
      if (character.textContent?.trim().toUpperCase().startsWith("DOREEN")) {
        const next = character.nextElementSibling;
        if (next?.getAttribute("data-type") === "dialogue")
          return next.getAttribute("data-id");
      }
    }
    return null;
  });
  expect(doreenSpeechId).not.toBeNull();
  const doreenSpeech = sheet.locator(`[data-id="${doreenSpeechId!}"]`);
  await expect(doreenSpeech).toBeVisible();

  await selectBlockText(page, doreenSpeech);
  await (await step(1)).click();
  const selectionScope = page.locator("[data-scope='selection']");
  await expect(selectionScope).toContainText(timeLabel!);
  await expectEvidence([page], {
    ...scenario,
    evidence: [initialTime!, timeLabel!],
  });

  await side.getByRole("tab", { name: DOCUMENT_WORDS.tourTab }).click();
  const pageTarget = await step(2);
  await placeCaretAtEnd(page, doreenSpeech);
  await page.keyboard.press("Enter");
  await page.keyboard.type("[THEME T=2:7]");
  await settled(page);

  await expect(pageTarget.locator("[title*='T=2:7']")).toBeVisible();
  await side.getByRole("tab", { name: DOCUMENT_WORDS.detailsTab }).click();
  await side.getByRole("button", { name: /^Checks/ }).click();
  await expectEvidence([page], { ...scenario, evidence: [unreadCheck!] });

  await side.getByRole("tab", { name: DOCUMENT_WORDS.tourTab }).click();
  await selectTourStep(page, scenario.promise, 3);
  await dragSelectBlock(page, doreenSpeech);
  await (await step(3)).click();
  await settled(page);

  await expect
    .poll(async () => {
      const current = parseSeconds(await readout.innerText());
      return current !== null && current >= 0 && current < startSeconds!;
    })
    .toBe(true);
  const afterSeconds = parseSeconds(await readout.innerText());
  expect(afterSeconds).not.toBeNull();
  expect(afterSeconds!).toBeGreaterThanOrEqual(0);
  expect(afterSeconds!).toBeLessThan(startSeconds!);
});
