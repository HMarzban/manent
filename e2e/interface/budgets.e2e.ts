// The interface's hard-fail times, in Chromium: opening each kind of surface, the first frame, and switching person.
import { DEMO_PEOPLE } from "@manent/demo";
import { DEMO_WORDS, DOCUMENT_WORDS, LIBRARY_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  labelOf,
  longestMark,
  markDurations,
  pressKeyOf,
  runFromPalette,
} from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const DOC_ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
// the hard-fail figures, in milliseconds
const POPOVER_MS = 100;
const PANEL_MS = 200;
const SCREEN_MS = 300;

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "the budgets are timed in Chromium",
);

/** A control found by its selector and, when given, its accessible name or its text. */
interface Control {
  selector: string;
  name: string | null;
}

/**
 * Milliseconds from a press on `opener`, dispatched inside the page, to the first frame in which an element matching
 * `surface` is visible.
 */
function openingMs(
  page: Page,
  opener: Control,
  surface: string,
): Promise<number> {
  return page.evaluate(
    ({ opener: control, surface: shown }) =>
      new Promise<number>((resolve, reject) => {
        const target = [...document.querySelectorAll(control.selector)].find(
          (element) =>
            control.name === null ||
            element.getAttribute("aria-label") === control.name ||
            element.textContent?.trim().startsWith(control.name) === true,
        );
        if (!(target instanceof HTMLElement)) {
          reject(new Error(`no control ${control.selector} ${control.name}`));
          return;
        }
        const startedAt = performance.now();
        const at = { bubbles: true, cancelable: true, composed: true };
        target.dispatchEvent(
          new PointerEvent("pointerdown", { ...at, pointerType: "mouse" }),
        );
        target.dispatchEvent(new MouseEvent("mousedown", at));
        target.dispatchEvent(
          new PointerEvent("pointerup", { ...at, pointerType: "mouse" }),
        );
        target.dispatchEvent(new MouseEvent("mouseup", at));
        target.click();
        const check = (): void => {
          const element = document.querySelector(shown);
          if (element !== null && element.checkVisibility())
            resolve(performance.now() - startedAt);
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
    { opener, surface },
  );
}

/** The surfaces whose time is not under `limitMs`, with their times. */
const over = (times: Record<string, number>, limitMs: number) =>
  Object.entries(times).filter(([, ms]) => !(ms < limitMs));

const TRIGGER = "[data-slot='dropdown-menu-trigger']";
const MENU = "[role='menu']";
const POPOVER = "[data-slot='popover-content']";

test("menus, popovers and the palette open within 100 ms, panels and dialogs within 200, screens and Preferences within 300", async ({
  page,
}) => {
  const popovers: Record<string, number> = {};
  const panels: Record<string, number> = {};
  await signedInAs(page, "you");
  const libraryTriggers = page.locator(`[data-region='title_bar'] ${TRIGGER}`);
  await expect(libraryTriggers).toHaveCount(2);
  popovers.workspace_switcher = await openingMs(
    page,
    {
      selector: `[data-region='title_bar'] ${TRIGGER}`,
      name: LIBRARY_WORDS.yourDesk,
    },
    MENU,
  );
  await page.keyboard.press("Escape");
  popovers.new_project = await openingMs(
    page,
    { selector: "[data-tour='library.newProject']", name: null },
    POPOVER,
  );
  await page.keyboard.press("Escape");
  await signedInAs(page, "you", `/s/${DOC_ID}`);
  await expect(
    page.locator("[data-region='page'] .mn-page-view"),
  ).toBeFocused();
  popovers.title_menu = await openingMs(
    page,
    {
      selector: TRIGGER,
      name: DOCUMENT_WORDS.titleMenu(LIBRARY_WORDS.untitledScript),
    },
    MENU,
  );
  await page.keyboard.press("Escape");
  popovers.sync_centre = await openingMs(
    page,
    {
      selector: "[data-region='title_bar'] [data-slot='popover-trigger']",
      name: null,
    },
    POPOVER,
  );
  await page.keyboard.press("Escape");
  for (const [id, region] of [
    ["view.leftPanel", "left_panel"],
    ["view.sidePanel", "side_panel"],
  ] as const) {
    popovers.view_menu = await openingMs(
      page,
      { selector: TRIGGER, name: DOCUMENT_WORDS.viewMenu },
      MENU,
    );
    panels[region] = await openingMs(
      page,
      {
        selector: "[role='menuitem'], [role='menuitemcheckbox']",
        name: labelOf(id),
      },
      `[data-region='${region}']`,
    );
  }
  await pressKeyOf(page, "app.palette");
  await expect(page.getByRole("combobox")).toBeFocused();
  popovers.palette = await longestMark(page, "ui.open.palette");
  await page.keyboard.press("Escape");
  const screens: Record<string, number> = {};
  await signedInAs(page, "you", `/s/${DOC_ID}/send/send_draft`);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  screens.send = await longestMark(page, "ui.open.screen");
  await signedInAs(page, "you", "/preferences/writing");
  await expect(page.getByRole("searchbox")).toBeFocused();
  screens.preferences = await longestMark(page, "ui.open.preferences");
  expect({
    popovers: over(popovers, POPOVER_MS),
    panels: over(panels, PANEL_MS),
    screens: over(screens, SCREEN_MS),
  }).toEqual({ popovers: [], panels: [], screens: [] });
  expect(
    Object.keys({ ...popovers, ...panels, ...screens }).toSorted(),
  ).toEqual([
    "left_panel",
    "new_project",
    "palette",
    "preferences",
    "send",
    "side_panel",
    "sync_centre",
    "title_menu",
    "view_menu",
    "workspace_switcher",
  ]);
});

test("the real frame replaces the static one within 300 ms", async ({
  page,
}) => {
  await signedInAs(page, "you");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  const frames = await markDurations(page, "app.frame");
  expect(frames.length).toBe(1);
  expect(frames.filter((ms) => !(ms < SCREEN_MS))).toEqual([]);
});

const DARK = labelOf("setting.appearance.theme.dark");

const nameOf = (userId: string): string =>
  DEMO_PEOPLE.find((person) => person.userId === userId)?.name ?? "";

test("switching person takes less than one second, with no frame in the other person's theme", async ({
  page,
}) => {
  await signedInAs(page, "sam");
  await expect(
    page.getByRole("heading", { name: LIBRARY_WORDS.title }),
  ).toBeFocused();
  await runFromPalette(page, DARK);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: DEMO_WORDS.person(nameOf("sam")) })
    .click();
  // each frame: the person the demo bar names, and the theme on the root
  await page.evaluate((prefix) => {
    const frames: [string, string | null][] = [];
    Reflect.set(window, "__frames", frames);
    const record = (): void => {
      const person = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.startsWith(prefix),
      );
      frames.push([
        person?.textContent ?? "",
        document.documentElement.getAttribute("data-theme"),
      ]);
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  }, DEMO_WORDS.person(""));
  await page
    .getByRole("button", { name: new RegExp(`^${nameOf("leo")}`) })
    .click();
  await expect(
    page.getByRole("button", { name: DEMO_WORDS.person(nameOf("leo")) }),
  ).toBeVisible();
  // two more frames, so the ones after the switch are recorded
  const frames: [string, string | null][] = await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(Reflect.get(window, "__frames"))),
        ),
      ),
  );
  // Leo has set no theme, so every frame that names him has none on the root
  const asLeo = frames.filter(
    ([person]) => person === DEMO_WORDS.person(nameOf("leo")),
  );
  expect(
    asLeo.length,
    JSON.stringify([...new Set(frames.map(([p]) => p))]),
  ).toBeGreaterThan(0);
  expect([...new Set(asLeo.map(([, theme]) => theme))]).toEqual([null]);
  const switches = await markDurations(page, "ui.switch.person");
  expect(switches.at(-1) ?? Infinity).toBeLessThan(1000);
});
