// Sam moves a scene with Alt+Up, by dragging in List and in Cards, and two tabs moving the same scene leave one copy.
import { SCENE_MOVE_WORDS } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { blocks, settled, typeLine } from "../editor/support.ts";
import {
  asPerson,
  docIdOf,
  newDevice,
  personIn,
  readStatus,
  setConnection,
  test,
} from "../offline/support.ts";
import { pressKeyOf } from "../support/interface.ts";

const TIMEOUT_MS = 120_000;

const SCENES = [
  "INT. PIER - DAWN",
  "INT. OFFICE - DAY",
  "EXT. HARBOUR - NIGHT",
] as const;

const ACTIONS = [
  "Rain hits the timber.",
  "A kettle whistles.",
  "The ferry horn sounds.",
] as const;

/** Creates a synced 3-scene script for Sam and returns its doc id. */
async function createThreeSceneScript(page: Page): Promise<string> {
  await page
    .locator('[data-region="title_bar"]')
    .getByRole("button", { name: "New script", exact: true })
    .click();
  await expect(page).toHaveURL(/\/s\//);
  await expect(
    page.locator("[data-region='page'] [contenteditable='true']"),
  ).toBeFocused();
  for (let i = 0; i < SCENES.length; i += 1) {
    await typeLine(page, SCENES[i]!);
    await settled(page);
    await page.keyboard.press("Enter");
    await typeLine(page, ACTIONS[i]!);
    await settled(page);
    if (i < SCENES.length - 1) await page.keyboard.press("Enter");
  }
  await expect.poll(() => readStatus(page)).toBe("Saved · Synced");
  return docIdOf(page);
}

/** Scene headings currently in the editor, in document order. */
async function sceneHeadings(page: Page): Promise<string[]> {
  return (await blocks(page))
    .filter((block) => block.type === "scene_heading")
    .map((block) => block.text);
}

/** The scene headings shown in `panel`, in visual order (top-to-bottom, left-to-right). */
async function panelOrder(panel: Locator): Promise<string[]> {
  return panel.locator("[data-sortable-id]").evaluateAll((elements) =>
    elements
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          text: el.textContent ?? "",
        };
      })
      .toSorted((a, b) => a.top - b.top || a.left - b.left)
      .map((item) => item.text),
  );
}

/** Waits until both the editor blocks and the Scenes panel visually match `expected` headings in order. */
async function expectSceneOrder(
  page: Page,
  panel: Locator,
  expected: readonly string[],
): Promise<void> {
  await expect.poll(() => sceneHeadings(page)).toEqual([...expected]);
  await expect
    .poll(async () => {
      const shown = await panelOrder(panel);
      return (
        shown.length === expected.length &&
        expected.every((heading, i) => shown[i]?.includes(heading) === true)
      );
    })
    .toBe(true);
}

/** The sortable item in `panel` for the scene whose heading is `heading`. */
const sceneItem = (panel: Locator, heading: string): Locator =>
  panel.locator("[data-sortable-id]", { hasText: heading }).first();

/** Drags `source` onto `target` using stepped pointer events for dnd-kit across all engines. */
async function dragOnto(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (from === null || to === null)
    throw new Error("sortable item has no layout box");
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + to.height / 2;
  const dx = endX - startX;
  const dy = endY - startY;
  const dist = Math.hypot(dx, dy) || 1;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + (dx / dist) * 10, startY + (dy / dist) * 10, {
    steps: 4,
  });
  await expect(page.locator("[data-dragging='pointer']")).toBeVisible();
  await page.mouse.move(endX, endY, { steps: 14 });
  await settled(page);
  await page.mouse.up();
}

/** Ensures the left panel is open on the Scenes tab. */
async function openScenesPanel(page: Page): Promise<Locator> {
  const panel = page.locator("[data-region='left_panel']");
  if (!(await panel.isVisible())) await pressKeyOf(page, "view.leftPanel");
  await expect(panel).toBeVisible();
  const scenesTab = panel.getByRole("tab", { name: "Scenes", exact: true });
  if ((await scenesTab.getAttribute("aria-selected")) !== "true")
    await scenesTab.click();
  return panel;
}

test("Sam moves a scene with Alt+Up and by dragging in List and in Cards", async ({
  browser,
}) => {
  test.setTimeout(TIMEOUT_MS);
  const sam = await asPerson(browser, "sam");
  await createThreeSceneScript(sam);
  const panel = await openScenesPanel(sam);
  const listSwitch = panel.getByRole("button", {
    name: SCENE_MOVE_WORDS.list,
    exact: true,
  });
  const cardsSwitch = panel.getByRole("button", {
    name: SCENE_MOVE_WORDS.cards,
    exact: true,
  });

  try {
    await listSwitch.click();
    const listItems = panel.locator("[data-sortable-id]");
    await expect(listItems).toHaveCount(3);

    // Move scene 2 (OFFICE) up with Alt+Up -> [OFFICE, PIER, HARBOUR]
    await sceneItem(panel, SCENES[1]).locator("[tabindex]").first().focus();
    await sam.keyboard.press("Alt+ArrowUp");
    await expectSceneOrder(sam, panel, [SCENES[1], SCENES[0], SCENES[2]]);

    // Drag PIER (now second) onto OFFICE (now first) in List view -> [PIER, OFFICE, HARBOUR]
    await dragOnto(
      sam,
      sceneItem(panel, SCENES[0]).locator("[tabindex]").first(),
      sceneItem(panel, SCENES[1]),
    );
    await expectSceneOrder(sam, panel, [SCENES[0], SCENES[1], SCENES[2]]);

    // Switch to Cards and drag OFFICE (second) onto PIER (first) -> [OFFICE, PIER, HARBOUR]
    await cardsSwitch.click();
    await expect(panel.locator("[data-sortable-id]")).toHaveCount(3);
    await dragOnto(
      sam,
      sceneItem(panel, SCENES[1]).locator("[tabindex]").first(),
      sceneItem(panel, SCENES[0]),
    );
    await expectSceneOrder(sam, panel, [SCENES[1], SCENES[0], SCENES[2]]);
  } finally {
    if (await listSwitch.isVisible().catch(() => false))
      await listSwitch.click();
  }
});

test("two tabs moving the same scene converge to one copy with nothing under To review", async ({
  browser,
}) => {
  test.setTimeout(TIMEOUT_MS);
  const samOne = await asPerson(browser, "sam");
  const docId = await createThreeSceneScript(samOne);
  const samTwo = await personIn(await newDevice(browser), "sam", `/s/${docId}`);
  await expect.poll(() => readStatus(samTwo)).toBe("Saved · Synced");
  await expect.poll(() => sceneHeadings(samTwo)).toEqual([...SCENES]);

  const panelOne = await openScenesPanel(samOne);
  const panelTwo = await openScenesPanel(samTwo);
  await panelOne
    .getByRole("button", { name: SCENE_MOVE_WORDS.list, exact: true })
    .click();
  await panelTwo
    .getByRole("button", { name: SCENE_MOVE_WORDS.list, exact: true })
    .click();

  // Tab 1 goes offline and moves scene 3 (HARBOUR) to the top; Tab 2 moves scene 3 up one place online
  await setConnection(samOne, "offline");
  await expect.poll(() => readStatus(samOne)).toBe("Saved · Offline");

  await sceneItem(panelOne, SCENES[2]).locator("[tabindex]").first().focus();
  await samOne.keyboard.press("Alt+ArrowUp");
  await expectSceneOrder(samOne, panelOne, [SCENES[0], SCENES[2], SCENES[1]]);
  await sceneItem(panelOne, SCENES[2]).locator("[tabindex]").first().focus();
  await samOne.keyboard.press("Alt+ArrowUp");
  await expectSceneOrder(samOne, panelOne, [SCENES[2], SCENES[0], SCENES[1]]);

  await sceneItem(panelTwo, SCENES[2]).locator("[tabindex]").first().focus();
  await samTwo.keyboard.press("Alt+ArrowUp");
  await expectSceneOrder(samTwo, panelTwo, [SCENES[0], SCENES[2], SCENES[1]]);
  await expect.poll(() => readStatus(samTwo)).toBe("Saved · Synced");

  // Reconnect Tab 1: both tabs converge to one copy of every scene and nothing under To review
  await setConnection(samOne, "online");
  await expect
    .poll(() => readStatus(samOne), { timeout: 20_000 })
    .toBe("Saved · Synced");
  await expect
    .poll(() => readStatus(samTwo), { timeout: 20_000 })
    .toBe("Saved · Synced");

  await expect
    .poll(async () => {
      const a = await sceneHeadings(samOne);
      const b = await sceneHeadings(samTwo);
      return a.length === 3 && b.length === 3 && a.join("|") === b.join("|");
    })
    .toBe(true);

  const finalHeadings = await sceneHeadings(samOne);
  expect(finalHeadings.toSorted()).toEqual([...SCENES].toSorted());
  expect(finalHeadings.filter((h) => h === SCENES[2])).toHaveLength(1);
});
