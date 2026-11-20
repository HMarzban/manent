// Typing reaches the page and nothing else: no change outside the editor, no interface store written, no animation.
import type { CommandId, SurfaceId } from "@manent/commands";
import { DOCUMENT_WORDS, SURFACES } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openSurface } from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const EDITABLE = "[data-region='page'] [contenteditable='true']";
// 40 characters, typed inside one line
const LINE = " and the tide was out, the boats were in";

/** Opens `surface` by running `opener` from the palette, and waits until its region is drawn. */
async function openPanel(
  page: Page,
  surface: SurfaceId,
  opener: CommandId,
  region: string,
): Promise<void> {
  const entry = SURFACES.find((s) => s.id === surface);
  if (entry === undefined) throw new RangeError(`no surface ${surface}`);
  await openSurface(page, entry, opener, "palette");
  await expect(page.locator(`[data-region='${region}']`)).toHaveCount(1);
}

/** The stand-in as Sam with both panels open, and the caret at the end of a line of text. */
async function writing(page: Page): Promise<void> {
  await signedInAs(page, "sam", "/__stand-in");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await openPanel(page, "left_panel", "view.leftPanel", "left_panel");
  await openPanel(page, "side_panel", "view.sidePanel", "side_panel");
  // the Script settings load apart: drawn before the typing, they cannot land among what it changes
  await expect(
    page.getByRole("button", {
      name: DOCUMENT_WORDS.scriptSettingsHeading,
      exact: true,
    }),
  ).toBeVisible();
  await page.locator(EDITABLE).click();
  await page.keyboard.type("The lamp is lit");
}

test("typing in the stand-in changes nothing outside it and writes no interface store", async ({
  page,
}) => {
  await writing(page);
  await page.evaluate(() => {
    const editable = document.querySelector(
      "[data-region='page'] [contenteditable='true']",
    );
    Reflect.set(window, "__mutations", 0);
    new MutationObserver((records) => {
      const outside = records.filter(
        (record) => editable === null || !editable.contains(record.target),
      );
      Reflect.set(
        window,
        "__mutations",
        Number(Reflect.get(window, "__mutations")) + outside.length,
      );
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  await page.keyboard.type(LINE);
  // whatever a keystroke scheduled has had two frames to happen
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(
    await page.evaluate(() => {
      const hook: unknown = Reflect.get(window, "__manent");
      const guard: unknown =
        typeof hook === "object" && hook !== null
          ? Reflect.get(hook, "guard")
          : null;
      const violations: unknown =
        typeof guard === "object" && guard !== null
          ? Reflect.apply(Reflect.get(guard, "violations"), guard, [])
          : null;
      return [Reflect.get(window, "__mutations"), violations];
    }),
  ).toEqual([0, 0]);
});

test("nothing animates on a keystroke", async ({ page }) => {
  await writing(page);
  await page.evaluate(() => {
    const started: string[] = [];
    Reflect.set(window, "__started", started);
    for (const type of ["transitionrun", "animationstart"])
      document.addEventListener(
        type,
        (event) =>
          started.push(
            `${type} ${event.target instanceof Element ? event.target.tagName : ""}`,
          ),
        { capture: true },
      );
  });
  await page.keyboard.type(LINE.repeat(5));
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(await page.evaluate(() => Reflect.get(window, "__started"))).toEqual(
    [],
  );
});
