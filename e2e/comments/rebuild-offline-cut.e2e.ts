// An offline cut survives a server Reorganise with no Recovered text and stays in Cuts for everyone.
import { MATERIAL_WORDS, SELECTION_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import { settled } from "../editor/support.ts";
import { reorganise } from "../offline/scenarios.ts";
import {
  SECOND_SCENE_ACTION,
  asPerson,
  lineId,
  message,
  pageText,
  readStatus,
  setConnection,
  sharedScript,
  test,
} from "../offline/support.ts";
import { pressKeyOf } from "../support/interface.ts";

const TIMEOUT_MS = 120_000;
const CUT_TEXT = "Gulls wheel over the water.";

test("an offline cut survives Reorganise with no Recovered text", async ({
  browser,
}) => {
  test.setTimeout(TIMEOUT_MS);
  const [dana, sam] = [
    await asPerson(browser, "dana"),
    await asPerson(browser, "sam"),
  ];
  await sharedScript(dana, sam);

  // Sam goes offline and moves the second scene's action to Cuts
  await setConnection(sam, "offline");
  await expect.poll(() => readStatus(sam)).toBe("Saved · Offline");

  const blockId = await lineId(sam, SECOND_SCENE_ACTION);
  const blockEl = sam.locator(`[data-editor-host] [data-id="${blockId}"]`);
  await blockEl.scrollIntoViewIfNeeded();
  const box = await blockEl.evaluate((el) => {
    const range = el.ownerDocument.createRange();
    if (el.firstChild !== null) range.selectNodeContents(el.firstChild);
    else range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    return rect.width > 0
      ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      : null;
  });
  if (box === null) throw new Error("cut target line has no layout box");
  await sam.mouse.dblclick(
    box.x + Math.min(20, box.width / 2),
    box.y + box.height / 2,
  );
  await settled(sam);

  const toolbar = sam.getByRole("toolbar", { name: SELECTION_WORDS.toolbar });
  await expect(toolbar).toBeVisible();
  await toolbar
    .getByRole("button", { name: SELECTION_WORDS.more, exact: true })
    .click();
  await sam
    .getByRole("menuitem", { name: MATERIAL_WORDS.moveToCuts, exact: true })
    .click();
  await expect(message(sam, MATERIAL_WORDS.movedToCuts(1))).toBeVisible();
  await expect.poll(() => pageText(sam)).not.toContain(CUT_TEXT);
  await expect.poll(() => readStatus(sam)).toBe("Saved · Offline, 1 waiting");

  // Dana triggers a server compaction via /api/demo/rebuild while Sam is still offline
  await expect.poll(() => readStatus(dana)).toBe("Saved · Synced");
  await reorganise(dana);

  // Sam reconnects: the cut replays cleanly with no Recovered text
  await setConnection(sam, "online");
  await expect
    .poll(() => readStatus(sam), { timeout: 20_000 })
    .toBe("Saved · Synced");
  await expect(sam.getByText(/Recovered text/)).toHaveCount(0);

  // Both Sam and Dana have the cut in Cuts and without the cut line in the script body
  await expect.poll(() => pageText(sam)).not.toContain(CUT_TEXT);
  await expect.poll(() => pageText(dana)).not.toContain(CUT_TEXT);
  expect(await pageText(sam)).toBe(await pageText(dana));

  const restoreName = MATERIAL_WORDS.restoreName(CUT_TEXT);
  for (const person of [sam, dana]) {
    const panel = person.locator("[data-region='left_panel']");
    if (!(await panel.isVisible())) await pressKeyOf(person, "view.leftPanel");
    await expect(panel).toBeVisible();
    await panel
      .getByRole("tab", { name: MATERIAL_WORDS.cuts, exact: true })
      .click();
    await expect(panel).toContainText(CUT_TEXT);
    await expect(
      panel.getByRole("button", { name: restoreName }),
    ).toBeVisible();
  }
});
