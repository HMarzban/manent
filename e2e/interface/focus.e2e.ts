// Focus as the surface catalogue says: where each way of opening a surface puts it, where closing gives it back, Escape and F6.
import { COMMANDS } from "@manent/commands";
import type { CommandContext, CommandId, SurfaceId } from "@manent/commands";
import { docPath } from "@manent/demo";
import type { Platform } from "@manent/settings";
import {
  DOCUMENT_WORDS,
  MATERIAL_WORDS,
  PROJECT_WORDS,
  REGIONS,
  SEND_WORDS,
  SURFACES,
  WORKSPACE_WORDS,
} from "@manent/ui";
import type { SurfaceEntry } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  commandOf,
  focusedDescription,
  labelOf,
  ON_A_SCRIPT,
  openSurface,
  platformOf,
  pressKeyOf,
  runs,
} from "../support/interface.ts";
import { makeScript } from "../support/made-script.ts";
import { closeFirstTour, signedInAs } from "../support/tour.ts";

const DOC_ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const DOC = `/s/${DOC_ID}`;
// the script Open beside lists: another of the person's, by the title a new one has
const OTHER_ID = "7a2e3d4c-5b6f-4a71-9b8c-0d1e2f3a4b5c";
const OTHER_TITLE = "Untitled script";
// a popover is drawn at the end of the page; only one is open at a time
const POPUP = "[role='dialog'][data-open]";
const PALETTE = "div:has(> [role='combobox'][aria-label='Commands'])";
const RENAME = "[data-region='title_bar'] input[aria-label='Rename']";
const SEND = `section[aria-label='${SEND_WORDS.pagesRegion}']`;
const CONSEQUENCE = "[role='alertdialog']";
const BESIDE = "[data-beside='script']";
// the list the page's editor draws at the caret
const CARET_LIST = "#mn-complete";
const WAYS = ["key", "palette", "control"] as const;

/**
 * Where a surface a command opens is shown, the element it is drawn in, the part whose first control takes focus when
 * a command opens it to use it (a panel's shown tab, the body of what is beside the page), its close control and the
 * name it is announced by. `ready` makes what the surface needs on the script once it is open, and leaves the caret
 * where its openers act; `seen` is what the commands then see besides; `choose` makes the choice its opener asks for
 * before it is drawn.
 */
interface Place {
  at: string;
  drawn: string;
  first: string;
  close: string | null;
  name: string | null;
  ready?: (page: Page) => Promise<(() => Promise<void>) | void>;
  seen?: Partial<CommandContext>;
  choose?: (page: Page) => Promise<void>;
}

const editorOf = (page: Page): Locator =>
  page.locator("[data-region='page'] .mn-page-view");

/** Runs `id` by typing its label in the palette. */
async function runFromPalette(page: Page, id: CommandId): Promise<void> {
  await pressKeyOf(page, "app.palette");
  await page.keyboard.type(labelOf(id));
  await page.keyboard.press("Enter");
}

/** Writes a speech on the empty script of `page`, with the caret left on its last word. */
async function writeSpeech(page: Page): Promise<void> {
  await pressKeyOf(page, "element.dialogue");
  await page.keyboard.type("The tide turns");
  await expect(editorOf(page)).toContainText("The tide turns");
}

/** Writes a speech, then swaps in another way to say it, so that the speech keeps one alternate. */
async function writeAlternate(page: Page): Promise<void> {
  await writeSpeech(page);
  await runFromPalette(page, "alternate.add");
  await page
    .getByRole("textbox", { name: MATERIAL_WORDS.anotherWayName })
    .fill("The tide is turning");
  await page.keyboard.press("Enter");
  await expect(page.locator(POPUP)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: MATERIAL_WORDS.markerName(1) }),
  ).toHaveCount(1);
}

/** Makes the other script and opens it, which puts it among those the person continues, then comes back to the first. */
async function openOther(page: Page): Promise<void> {
  await makeScript(page, OTHER_ID);
  for (const docId of [OTHER_ID, DOC_ID]) {
    await page.goto(`/s/${docId}`);
    await expect(editorOf(page)).toBeFocused();
  }
}

/** Chooses the other script in Open beside's list, which holds nothing else. */
async function chooseOther(page: Page): Promise<void> {
  await expect(page.getByRole("option")).toHaveText([OTHER_TITLE]);
  await page.keyboard.press("Enter");
}

/** Opens a new script from the Library and types a line so its project stays when navigating to Project settings. */
async function openProjectScript(page: Page): Promise<void> {
  await page.goto("/");
  await page
    .locator("[data-region='title_bar']")
    .getByRole("button", { name: "New script", exact: true })
    .click();
  await expect(editorOf(page)).toBeFocused();
  await expect(
    page
      .locator("[data-region='title_bar']")
      .getByRole("heading", { level: 1 }),
  ).toHaveText(OTHER_TITLE);
  await page.keyboard.type("The tide turns.");
  await expect(editorOf(page)).toContainText("The tide turns.");
}

/** Writes a scene heading and an action line, selecting the last word so selection, scene, script and note openers all apply. */
async function writeSceneWithSelection(page: Page): Promise<void> {
  await page.keyboard.type("INT. HARBOUR - NIGHT");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The tide turns.");
  await expect(editorOf(page)).toContainText("The tide turns.");
  for (let step = 0; step < 6; step++)
    await page.keyboard.press("Shift+ArrowLeft");
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""))
    .toBe("turns.");
  // let ProseMirror observe the selectionchange before isListed opens the palette
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** Signs in as Dana on the Library so workspace settings is available in the palette. */
async function signInForWorkspace(page: Page): Promise<void> {
  await signedInAs(page, "dana", "/");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
}

/** Opens a News script as Dana so `template.save` (`Save template…`) is visible in the palette. */
async function openNewsScriptForTemplate(page: Page): Promise<void> {
  await signedInAs(
    page,
    "dana",
    `${docPath("medium/lannick-one-news/stories/01")}?panels=closed`,
  );
  await expect(editorOf(page)).toBeVisible();
  // wait for the workspace index to settle so projectKind ("news") makes template.save visible in the palette
  await expect(page.locator("[data-tour='status:server']")).toHaveText(
    "Synced",
  );
  await expect(
    page
      .locator("[data-region='title_bar']")
      .getByRole("heading", { level: 1 }),
  ).not.toHaveText("Untitled script");
  await page.keyboard.press("Escape");
  await expect(editorOf(page)).toBeFocused();
}

/** Has Dana present 204 on a speech while Sam opens 204 so Pitch… opens pitch_field. */
async function openPitchRoom(page: Page): Promise<() => Promise<void>> {
  const browser = page.context().browser();
  if (browser === null) throw new Error("browser is unavailable");
  const origin = new URL(page.url()).origin;
  const doc = docPath("medium/harbour-lights/204");
  const path = `${doc}?panels=closed`;
  const danaContext = await browser.newContext({ baseURL: origin });
  const cleanup = async (): Promise<void> => {
    await danaContext.close().catch(() => undefined);
  };
  try {
    const dana = await danaContext.newPage();
    await signedInAs(dana, "dana", path);
    await expect(dana.locator("[data-tour='status:server']")).toHaveText(
      "Synced",
    );
    const present = await danaContext.newPage();
    await signedInAs(present, "dana", `${doc}/present`);
    await expect(
      present.locator("[data-region='page'] .mn-page-view"),
    ).toBeVisible({
      timeout: 15_000,
    });

    await signedInAs(page, "sam", path);
    await expect(page.locator("[data-tour='status:server']")).toHaveText(
      "Synced",
    );
    await expect(
      page
        .locator("[data-region='state_bar']")
        .getByRole("button", { name: /^Pitch/ }),
    ).toBeVisible({ timeout: 15_000 });
    const speech = dana
      .locator("[data-region='page'] [data-type='dialogue']")
      .first();
    await speech.scrollIntoViewIfNeeded();
    await speech.click({ position: { x: 4, y: 4 } });
    // wait for Dana's dialogue caret broadcast to arrive in Sam's editor so room.pitch sees a speech
    await expect(
      page.locator("[data-type='dialogue'] .mn-cursor-tab").first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(editorOf(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editorOf(page)).toBeFocused();
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
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
  send: { at: DOC, drawn: SEND, first: SEND, close: null, name: null },
  share_dialog: {
    at: DOC,
    drawn: POPUP,
    first: POPUP,
    close: null,
    name: null,
  },
  consequence_dialog: {
    at: DOC,
    drawn: CONSEQUENCE,
    first: CONSEQUENCE,
    close: null,
    name: null,
  },
  alternates_popover: {
    at: DOC,
    drawn: POPUP,
    first: POPUP,
    close: null,
    name: null,
    ready: writeAlternate,
    seen: {
      material: {
        caretInSpeech: true,
        alternates: 1,
        selection: false,
        cuts: 0,
      },
    },
  },
  beside: {
    at: DOC,
    drawn: BESIDE,
    first: `${BESIDE} [data-beside-body]`,
    close: DOCUMENT_WORDS.closeBeside(OTHER_TITLE),
    name: null,
    ready: openOther,
    choose: chooseOther,
  },
  name_offer: {
    at: DOC,
    drawn: CARET_LIST,
    first: CARET_LIST,
    close: null,
    name: null,
    ready: writeSpeech,
  },
  project_settings: {
    at: DOC,
    drawn: `div:has(> header > h1:has-text("${PROJECT_WORDS.heading}"))`,
    first: `div:has(> header > h1:has-text("${PROJECT_WORDS.heading}"))`,
    close: SEND_WORDS.back(OTHER_TITLE),
    name: null,
    ready: openProjectScript,
  },
  workspace_settings: {
    at: "/",
    drawn: `div:has(> header > h1:has-text("${WORKSPACE_WORDS.title}"))`,
    first: `div:has(> header > h1:has-text("${WORKSPACE_WORDS.title}"))`,
    close: WORKSPACE_WORDS.backToLibrary,
    name: null,
    ready: signInForWorkspace,
    seen: { signedIn: true },
  },
  comment_popover: {
    at: DOC,
    drawn: POPUP,
    first: `${POPUP} textarea`,
    close: null,
    name: null,
    ready: writeSceneWithSelection,
  },
  pitch_field: {
    at: DOC,
    drawn: "[data-tour='pitch_field']",
    first: "[data-tour='pitch_field'] input",
    close: null,
    name: null,
    ready: openPitchRoom,
    seen: { signedIn: true },
  },
  cell_popover: {
    at: DOC,
    drawn: "[data-surface='cell_popover']",
    first: "[data-surface='cell_popover']",
    close: null,
    name: null,
  },
  prompter_files: {
    at: DOC,
    drawn: POPUP,
    first: POPUP,
    close: null,
    name: null,
  },
  view_menu: {
    at: DOC,
    drawn: "[role='menu']",
    first: "[role='menu']",
    close: null,
    name: null,
  },
  save_template_dialog: {
    at: DOC,
    drawn: POPUP,
    first: `${POPUP} input`,
    close: null,
    name: null,
    ready: openNewsScriptForTemplate,
    seen: { signedIn: true, projectKind: "news", role: "owner" },
  },
};

// the openers drawn as a control on the page their surface is used from; every other opener has none there
const CONTROLLED: readonly CommandId[] = [
  "app.palette",
  "app.syncCentre",
  "alternate.show",
  "demo.tour",
  "library.newProject",
  "room.pitch",
];

/** What the commands see at `place` with focus in the page, written out by hand. */
function contextAt(place: Place, platform: Platform): CommandContext {
  const { at, seen } = place;
  const panelOpen = { left: false, side: false };
  if (at === DOC)
    return {
      ...ON_A_SCRIPT,
      platform,
      screen: "document",
      focus: "page",
      panelOpen,
      ...seen,
    };
  if (at === "/")
    return {
      ...ON_A_SCRIPT,
      platform,
      docOpen: false,
      role: null,
      screen: "library",
      focus: "page",
      panelOpen,
      ...seen,
    };
  throw new RangeError(
    `the focus tests do not know what the commands see on ${at}`,
  );
}

// an opener that uses a part of its surface: Script settings lies below the Selection group in Details, and Add
// alternate writes in the field below the alternates
const PARTS: Partial<Record<CommandId, string>> = {
  "doc.scriptSettings": "[data-region='side_panel'] [data-script-settings]",
  "alternate.add": `${POPUP} input`,
};

const placeOf = (id: SurfaceId, opener: CommandId): Place => {
  const place = PLACES[id];
  if (place === undefined)
    throw new RangeError(`the focus tests do not know where ${id} is shown`);
  return { ...place, first: PARTS[opener] ?? place.first };
};

/**
 * Opens `place.at` as You and waits for the screen's heading to hold focus, as it does on arrival, and on a script for
 * its editor to be drawn, so the page reads the same before and after a surface is used.
 */
async function arrive(page: Page, at: string): Promise<void> {
  await signedInAs(page, "you", at === DOC ? "/" : at);
  if (at === DOC) {
    // the Tour that You's first launch opens is the demo's; the script is opened without it
    await closeFirstTour(page);
    await makeScript(page, DOC_ID);
    await page.goto(DOC);
  }
  // a script's page takes focus at the caret, any other screen its heading
  await expect(
    at === DOC ? editorOf(page) : page.getByRole("heading", { level: 1 }),
  ).toBeFocused();
  if (at === DOC) await expect(editorOf(page)).toBeVisible();
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
      const first = holder?.matches("input, textarea")
        ? holder
        : holder?.querySelector(
            "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']), [contenteditable='true']",
          );
      return {
        in:
          active !== null && active === first
            ? "first"
            : active !== null && surface?.contains(active)
              ? "inside"
              : "outside",
        field:
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement,
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
      await expect.poll(where).toMatchObject({ in: "first" });
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
    case "caret":
      await expect.poll(() => regionOfFocus(page)).toBe("page");
      return;
    default:
      intent satisfies never;
  }
}

// the file picker is the system's own, drawn by no page
for (const entry of SURFACES.filter((s) => s.id !== "file_picker"))
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
        test.fixme(
          entry.id === "send",
          "the Export and Print forms are not drawn yet, so the Send screen goes straight back to the document",
        );
        test.fixme(
          entry.id === "name_field",
          "Name this draft does nothing yet: the History tab's naming field is not drawn",
        );
        test.fixme(
          entry.id === "side_panel" && opener === "history.open",
          "History opens on an empty tab: the History tab's versions list is not drawn",
        );
        const place = placeOf(entry.id, opener);
        const command = commandOf(opener);
        const platform = await platformOf(page);
        const ctx = contextAt(place, platform);
        test.fixme(
          entry.id === "share_dialog" &&
            command.when !== null &&
            !command.when(ctx),
          "Share does nothing yet: the Share dialog is not drawn",
        );
        test.skip(
          by === "key" && command.keys[platform].length === 0,
          `${opener} has no key on ${platform}`,
        );
        const controlled = CONTROLLED.includes(opener);
        test.skip(
          by === "control" && !controlled,
          `${opener} has no control here`,
        );
        await arrive(page, place.at);
        const cleanup = await place.ready?.(page);
        try {
          const control = page.locator(`[data-tour="${opener}"]:visible`);
          if (controlled) await expect(control.first()).toBeVisible();
          else expect(await control.count()).toBe(0);
          const shown = command.visible === null || command.visible(ctx);
          const sameLabelVisible =
            typeof command.label === "string" &&
            COMMANDS.some(
              (other) =>
                other.id !== opener &&
                other.label === command.label &&
                (other.visible === null || other.visible(ctx)),
            );
          expect(await isListed(page, opener)).toBe(shown || sameLabelVisible);
          test.skip(!shown, `${opener} is absent on this document`);
          // the caret is where Escape sends focus from the frame; the Library covers the page, so it has none
          if (place.at === DOC) await page.keyboard.press("Escape");
          const caret = await focusedDescription(page);
          if (by === "control") await control.first().focus();
          const before = await focusedDescription(page);
          const scrollY = await page.evaluate(() => window.scrollY);
          const intent = command.opens?.focus ?? entry.focusOnOpen;

          const ran = (await runs(page)).length;
          await expect(page.locator(place.drawn)).toHaveCount(0);
          await openSurface(page, entry, opener, by);
          await place.choose?.(page);
          await expect(page.locator(place.drawn)).toHaveCount(1);
          expect((await runs(page)).slice(ran)).toEqual(
            by === "palette" ? ["app.palette", opener] : [opener],
          );
          await expectOpenFocus(page, intent, place, before);
          const expectGivenBack = async (): Promise<void> => {
            await expect
              .poll(() => focusedDescription(page))
              .toBe(entry.focusOnClose === "caret" ? caret : before);
            expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
          };

          if (intent === "stay" && place.name !== null && before === caret)
            expect(await politeText(page)).toBe(place.name);
          await page.keyboard.press("Escape");
          // Escape never closes a panel or leaves a screen: it returns focus to the page from a panel
          await expect(page.locator(place.drawn)).toHaveCount(
            entry.kind === "panel" || entry.kind === "screen" ? 1 : 0,
          );
          if (entry.kind !== "screen") await expectGivenBack();
          if (place.close === null) return;
          const close = page.getByRole("button", { name: place.close });
          await close.focus();
          await close.press("Enter");
          await expect(page.locator(place.drawn)).toHaveCount(0);
          await expectGivenBack();
        } finally {
          await cleanup?.();
        }
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
  const run = (id: CommandId): Promise<void> => runFromPalette(page, id);

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
