// An offline writer's edit that merges inside the air window marks the row Changed and never alters the prompter text.
import { docPath, seedDoc } from "@manent/demo";
import {
  PROMPTER_WINDOW_WORDS,
  PROMPTER_WORDS,
  RUNDOWN_WORDS,
} from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { readStatus, setConnection } from "../offline/support.ts";
import { ensureNewsAirWindow } from "../support/rundown.ts";
import { committedOnDevice, signedInAs } from "../support/tour.ts";

const NEWS_RUNDOWN_KEY = "medium/lannick-one-news/rundowns/day";
const STORY_KEY = "medium/lannick-one-news/stories/02";
const STORY_TITLE = "Library: what happens to Mercer Street";

/** Places the caret at the end of `block` and types `text`. */
async function appendToBlock(
  page: Page,
  block: Locator,
  text: string,
): Promise<void> {
  await block.scrollIntoViewIfNeeded();
  const end = await block.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const last = [...range.getClientRects()].at(-1);
    if (last === undefined) {
      const box = node.getBoundingClientRect();
      return { x: box.right - 2, y: box.top + box.height / 2 };
    }
    return { x: last.right - 1, y: last.top + last.height / 2 };
  });
  await page.mouse.click(end.x, end.y);
  await settled(page);
  await page.keyboard.type(text);
  await settled(page);
}

test("an offline edit merging inside the air window marks the row changed without altering the prompter text", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  await ensureNewsAirWindow(request);

  const rundownDocId = seedDoc(NEWS_RUNDOWN_KEY).docId;
  const amendment = ` Mercer Street desk confirms the late shift ${crypto.randomUUID().slice(0, 8)}.`;

  const producerContext = await browser.newContext();
  const writerContext = await browser.newContext();
  try {
    const rundownPage = await producerContext.newPage();
    await signedInAs(
      rundownPage,
      "ana",
      `${docPath(NEWS_RUNDOWN_KEY)}?panels=closed`,
    );

    const stateBar = rundownPage.locator("[data-tour='state_bar']").first();
    await expect(stateBar).toContainText(RUNDOWN_WORDS.airWindow);

    const storyCell = rundownPage
      .locator('[role="gridcell"][data-col-id="story"]')
      .filter({ hasText: STORY_TITLE })
      .first();
    await expect(storyCell).toBeVisible();
    const rowId = await storyCell.getAttribute("data-row-id");
    expect(rowId).not.toBeNull();

    const prompterCell = rundownPage.locator(
      `[role="gridcell"][data-row-id="${rowId!}"][data-col-id="prompter"]`,
    );
    await expect(prompterCell).toBeVisible();
    if (!(await prompterCell.innerText()).includes(PROMPTER_WORDS.onPrompter)) {
      await prompterCell
        .getByRole("button", { name: PROMPTER_WORDS.sendRowLabel(STORY_TITLE) })
        .click();
    }
    await expect(prompterCell).toContainText(PROMPTER_WORDS.onPrompter);

    const prompterPage = await producerContext.newPage();
    await signedInAs(prompterPage, "ana", `/s/${rundownDocId}/prompter`);
    const feedStatus = prompterPage.locator("[data-tour='prompter:feed']");
    await expect(feedStatus).toContainText(PROMPTER_WINDOW_WORDS.live);

    const reading = prompterPage.getByRole("main", {
      name: PROMPTER_WINDOW_WORDS.readingAreaLabel,
    });
    const prompterStory = reading.locator(`[data-prompter-story="${rowId!}"]`);
    await expect(prompterStory).toBeVisible();
    const sentStoryText = await prompterStory.innerText();
    const sentReadingText = await reading.innerText();
    expect(sentStoryText.trim().length).toBeGreaterThan(0);
    expect(sentStoryText).not.toContain(amendment.trim());

    const writerPage = await writerContext.newPage();
    await signedInAs(writerPage, "sam", `${docPath(STORY_KEY)}?panels=closed`);
    const editable = writerPage.locator("[data-editor-host] .ProseMirror");
    await expect(editable).toBeVisible();
    await expect.poll(() => readStatus(writerPage)).toBe("Saved · Synced");

    await setConnection(writerPage, "offline");
    await expect.poll(() => readStatus(writerPage)).toBe("Saved · Offline");

    const dialogue = writerPage
      .locator("[data-editor-host] [data-type='dialogue']")
      .first();
    await expect(dialogue).toBeVisible();
    await appendToBlock(writerPage, dialogue, amendment);
    await expect(dialogue).toContainText(amendment.trim());
    await expect
      .poll(() => readStatus(writerPage))
      .toBe("Saved · Offline, 1 waiting");
    await committedOnDevice(writerPage, "sam");

    await setConnection(writerPage, "online");
    await expect.poll(() => readStatus(writerPage)).toBe("Saved · Synced");

    await expect(prompterCell).toContainText(PROMPTER_WORDS.changed);
    await expect(
      prompterCell.getByRole("button", {
        name: PROMPTER_WORDS.sendRowLabel(STORY_TITLE),
      }),
    ).toBeVisible();

    // confirm the offline edit actually merged onto the server and reached Ana's view of the story
    const verifyStoryPage = await producerContext.newPage();
    await signedInAs(
      verifyStoryPage,
      "ana",
      `${docPath(STORY_KEY)}?panels=closed`,
    );
    await expect(
      verifyStoryPage.locator("[data-editor-host] .ProseMirror"),
    ).toContainText(amendment.trim());

    await expect(feedStatus).toContainText(PROMPTER_WINDOW_WORDS.live);
    expect(await prompterStory.innerText()).toBe(sentStoryText);
    expect(await prompterStory.innerText()).not.toContain(amendment.trim());
    expect(await reading.innerText()).toBe(sentReadingText);
  } finally {
    await writerContext.close();
    await producerContext.close();
  }
});
