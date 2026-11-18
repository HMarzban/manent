// Focus as the surface catalogue says: where each way of opening a surface puts it, where closing gives it back, Escape and F6.
import { COMMANDS } from "@manent/commands";
import type { CommandId, SurfaceId } from "@manent/commands";
import { DOCUMENT_WORDS, REGIONS, SURFACES } from "@manent/ui";
import type { SurfaceEntry } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  focusedDescription,
  openSurface,
  platformOf,
  pressKeyOf,
  runs,
} from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const DOC = "/s/6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
// a popover is drawn at the end of the page; only one is open at a time
const POPUP = "[role='dialog'][data-open]";
const PALETTE = "div:has(> [role='combobox'][aria-label='Commands'])";
const RENAME = "[data-region='title_bar'] input[aria-label='Rename']";
const WAYS = ["key", "palette", "control"] as const;

/**
 * Where a surface a command opens is shown, the element it is drawn in, the part whose first control takes focus when
 * a command opens it to use it (a panel's shown tab), its close control and the name it is announced by.
 */
interface Place {
  at: string;
  drawn: string;
  first: string;
  close: string | null;
  name: string | null;
}

const PLACES: Partial<Record<SurfaceId, Place>> = {
  left_panel: {
    at: DOC,
    drawn: "[data-region='left_panel']",
    first: "[data-region='left_panel'] [role='tabpanel']",
    close: DOCUMENT_WORDS.closeLeftPanel,
    name: DOCUMENT_WORDS.leftPanel,
  },
  side_panel: {
    at: DOC,
    drawn: "[data-region='side_panel']",
    first: "[data-region='side_panel'] [role='tabpanel']",
    close: DOCUMENT_WORDS.closeSidePanel,
    name: DOCUMENT_WORDS.sidePanel,
  },
  palette: {
    at: DOC,
    drawn: PALETTE,
    first: PALETTE,
    close: null,
    name: null,
  },
  sync_centre: { at: DOC, drawn: POPUP, first: POPUP, close: null, name: null },
  new_project: { at: "/", drawn: POPUP, first: POPUP, close: null, name: null },
  inline_rename: {
    at: DOC,
    drawn: RENAME,
    first: RENAME,
    close: null,
    name: null,
  },
};

const placeOf = (id: SurfaceId): Place => {
  const place = PLACES[id];
  if (place === undefined)
    throw new RangeError(`the focus tests do not know where ${id} is shown`);
  return place;
};

const labelOf = (id: CommandId): string => {
  const label = COMMANDS.find((c) => c.id === id)?.label;
  if (typeof label !== "string")
    throw new RangeError(`${id} has no plain label`);
  return label;
};

/**
 * Opens `place.at` as You and waits for the screen's heading to hold focus, as it does on arrival, and on a script for
 * its page to say it is opening, so the page reads the same before and after a surface is used.
 */
async function arrive(page: Page, at: string): Promise<void> {
  await signedInAs(page, "you", at);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  if (at === DOC)
    await expect(page.locator("[data-region='page']")).toHaveText(
      DOCUMENT_WORDS.opening,
    );
}

/** Whether the palette lists `id` here: a command whose `visible` is false in this context is absent from it. */
async function isListed(page: Page, id: CommandId): Promise<boolean> {
  await pressKeyOf(page, "app.palette");
  const field = page.getByRole("combobox", { name: "Commands" });
  await field.fill(labelOf(id));
  const listed = await page
    .getByRole("option", { name: new RegExp(`^${labelOf(id)}`) })
    .count();
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  return listed > 0;
}

/** Where focus is against `place`: on the first control of its `first` part, elsewhere inside it, or outside it; and whether it is a field. */
const focusIn = (
  page: Page,
  place: Place,
): Promise<{ in: "first" | "inside" | "outside"; field: boolean }> =>
  page.evaluate(
    ({ drawn, part }) => {
      const active = document.activeElement;
      const surface = document.querySelector(drawn);
      const holder = document.querySelector(part);
      const first = holder?.matches("input")
        ? holder
        : holder?.querySelector(
            "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1']), [contenteditable='true']",
          );
      return {
        in:
          active !== null && active === first
            ? "first"
            : active !== null && surface?.contains(active)
              ? "inside"
              : "outside",
        field: active instanceof HTMLInputElement,
      };
    },
    { drawn: place.drawn, part: place.first },
  );

const regionOfFocus = (page: Page): Promise<string | null> =>
  page.evaluate(
    () =>
      document.activeElement
        ?.closest("[data-region]")
        ?.getAttribute("data-region") ?? null,
  );

const politeText = (page: Page): Promise<string> =>
  page.locator("[data-announcer] [aria-live='polite']").innerText();

/** Waits until focus is where the catalogue asks once a surface is open, given what held it before the way ran. */
async function expectOpenFocus(
  page: Page,
  intent: SurfaceEntry["focusOnOpen"],
  place: Place,
  before: string,
): Promise<void> {
  const where = () => focusIn(page, place);
  const described = () => focusedDescription(page);
  switch (intent) {
    case "stay":
      await expect.poll(described).toBe(before);
      return;
    case "first":
      await expect.poll(where).toMatchObject({ in: "first" });
      return;
    case "item":
      await expect.poll(async () => (await where()).in).not.toBe("outside");
      return;
    case "search":
      await expect
        .poll(async () => {
          const at = await where();
          return at.in !== "outside" && at.field;
        })
        .toBe(true);
      return;
    case "heading":
      await expect.poll(described).toMatch(/ h1 /);
      return;
    case "cancel":
      await expect.poll(described).toMatch(/ button "Cancel"$/);
      return;
    default:
      intent satisfies never;
  }
}

for (const entry of SURFACES)
  for (const opener of entry.openedBy)
    for (const by of WAYS) {
      test(`${entry.id} opened by ${opener} through ${by} puts focus where the catalogue says, and gives it back`, async ({
        page,
      }) => {
        test.fixme(
          entry.id === "side_panel" &&
            opener === "demo.tour" &&
            by === "palette",
          "the Tour command does not yet name the side panel aloud when it shows it with focus in the page",
        );
        const place = placeOf(entry.id);
        const command = COMMANDS.find((c) => c.id === opener);
        const platform = await platformOf(page);
        test.skip(
          by === "key" && command?.keys[platform].length === 0,
          `${opener} has no key on ${platform}`,
        );
        await arrive(page, place.at);
        const control = page.locator(`[data-tour="${opener}"]:visible`);
        test.skip(
          by === "control" && (await control.count()) === 0,
          `${opener} has no control here`,
        );
        test.skip(
          !(await isListed(page, opener)),
          `${opener} is absent on this document`,
        );
        // the caret is where Escape sends focus from the frame; the Library covers the page, so it has none
        if (place.at === DOC) await page.keyboard.press("Escape");
        const caret = await focusedDescription(page);
        if (by === "control") await control.first().focus();
        const before = await focusedDescription(page);
        const scrollY = await page.evaluate(() => window.scrollY);
        const intent = command?.opens?.focus ?? entry.focusOnOpen;

        const ran = (await runs(page)).length;
        await openSurface(page, entry, opener, by);
        await expect(page.locator(place.drawn)).toHaveCount(1);
        expect((await runs(page)).slice(ran)).toEqual(
          by === "palette" ? ["app.palette", opener] : [opener],
        );
        await expectOpenFocus(page, intent, place, before);
        const expectGivenBack = async (): Promise<void> => {
          const described = await focusedDescription(page);
          expect(described).not.toBe("body");
          expect(described).toBe(
            entry.focusOnClose === "caret" ? caret : before,
          );
          expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
        };

        if (intent === "stay" && place.name !== null && before === caret)
          expect(await politeText(page)).toBe(place.name);
        await page.keyboard.press("Escape");
        // Escape never closes a panel: it returns focus to the page
        await expect(page.locator(place.drawn)).toHaveCount(
          entry.kind === "panel" ? 1 : 0,
        );
        await expectGivenBack();
        if (place.close === null) return;
        const close = page.getByRole("button", { name: place.close });
        await close.focus();
        await close.press("Enter");
        await expect(page.locator(place.drawn)).toHaveCount(0);
        await expectGivenBack();
      });
    }

test("a dialog opened from the palette gives focus back to what had it before the palette", async ({
  page,
}) => {
  await arrive(page, DOC);
  const back = page.getByRole("button", { name: DOCUMENT_WORDS.back });
  await back.focus();
  await pressKeyOf(page, "app.palette");
  await page.keyboard.type(labelOf("app.syncCentre"));
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(back).toBeFocused();
});

test("each row of the Escape order does one thing per press and never leaves a screen", async ({
  page,
}) => {
  await arrive(page, DOC);
  const path = (): string => new URL(page.url()).pathname;
  const back = page.getByRole("button", { name: DOCUMENT_WORDS.back });
  const palette = page.getByRole("combobox", { name: "Commands" });
  const side = page.locator("[data-region='side_panel']");
  const run = async (id: CommandId): Promise<void> => {
    await pressKeyOf(page, "app.palette");
    await page.keyboard.type(labelOf(id));
    await page.keyboard.press("Enter");
  };

  // a popover is open, with text typed in it: the popover closes, and focus goes back
  await back.focus();
  await pressKeyOf(page, "app.palette");
  await page.keyboard.type("Side");
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  await expect(back).toBeFocused();
  expect(path()).toBe(DOC);

  // a rename is open: it closes, and the title keeps its name
  await run("doc.rename");
  const rename = page.getByRole("textbox", { name: "Rename" });
  await rename.fill("Harbour Lights");
  await page.keyboard.press("Escape");
  await expect(rename).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Untitled script/,
  );
  expect(path()).toBe(DOC);

  // focus is elsewhere in the frame: it returns to the page, and the side panel stays open
  await run("doc.scriptSettings");
  await expect.poll(() => regionOfFocus(page)).toBe("side_panel");
  await back.focus();
  await page.keyboard.press("Escape");
  expect(await regionOfFocus(page)).toBe("page");
  await expect(side).toHaveCount(1);
  expect(path()).toBe(DOC);

  // focus is in the page: nothing changes
  const described = await focusedDescription(page);
  await page.keyboard.press("Escape");
  expect(await focusedDescription(page)).toBe(described);
  await expect(side).toHaveCount(1);
  expect(path()).toBe(DOC);

  // a search field holds text: it is cleared, and Preferences stays, however often Escape is pressed
  await pressKeyOf(page, "app.preferences");
  const search = page.getByRole("searchbox", { name: "Search…" });
  await expect(search).toBeFocused();
  const preferences = path();
  await search.fill("theme");
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).toBeFocused();
  expect(path()).toBe(preferences);
});

test("F6 and Shift+F6 visit the regions in order and skip the ones that are not there", async ({
  page,
}) => {
  await arrive(page, DOC);
  await page.keyboard.press("Escape");
  await pressKeyOf(page, "app.palette");
  await page.keyboard.type(labelOf("view.sidePanel"));
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-region='side_panel']")).toHaveCount(1);
  // the demo bar, the title bar, the page, the side panel and the status bar are drawn; no state, no left panel
  const there = REGIONS.filter(
    (region) => region !== "state_bar" && region !== "left_panel",
  );
  const start = there.indexOf("page");
  const forward = [...there.slice(start + 1), ...there.slice(0, start + 1)];
  const visit = async (key: string): Promise<(string | null)[]> => {
    const visited: (string | null)[] = [];
    for (const _ of there) {
      await page.keyboard.press(key);
      visited.push(await regionOfFocus(page));
    }
    return visited;
  };
  expect(await regionOfFocus(page)).toBe("page");
  expect(await visit("F6")).toEqual(forward);
  expect(await visit("Shift+F6")).toEqual([
    ...forward.toReversed().slice(1),
    "page",
  ]);
});
