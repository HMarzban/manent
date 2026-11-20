// Every default shortcut from the registry, pressed where a person writes, reads a panel and types in a field.
import { COMMANDS } from "@manent/commands";
import type { CommandContext, CommandDefinition } from "@manent/commands";
import { DIALOG_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  focusedDescription,
  keysFor,
  ON_A_SCRIPT,
  platformOf,
  pressKeyOf,
  runs,
} from "../support/interface.ts";
import { signedInAs } from "../support/tour.ts";

const DOC = "/s/6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const STAND_IN = "/__stand-in";

/** Where a key is pressed from, and the context the commands see there, written out by hand. */
interface Spot {
  name: string;
  at: string;
  /** Waits for the place to be ready, then puts focus in it. */
  focus(page: Page): Promise<void>;
  context: Omit<CommandContext, "platform">;
}

const editable = (page: Page): Locator =>
  page.locator("[data-region='page'] [contenteditable='true']");

const SPOTS: readonly Spot[] = [
  {
    name: "the stand-in",
    at: STAND_IN,
    focus: (page) => editable(page).click(),
    context: {
      ...ON_A_SCRIPT,
      screen: "document",
      focus: "page",
      panelOpen: { left: false, side: false },
    },
  },
  {
    name: "the side panel",
    at: DOC,
    async focus(page) {
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      await page.getByRole("button", { name: "View" }).click();
      await page.getByRole("menuitemcheckbox", { name: /^Side panel/ }).click();
      await page.keyboard.press("Escape");
      await page
        .locator("[data-region='side_panel'] [role='tab']")
        .first()
        .focus();
    },
    context: {
      ...ON_A_SCRIPT,
      screen: "document",
      focus: "panel",
      panelOpen: { left: false, side: true },
    },
  },
  {
    name: "Preferences' search",
    at: "/preferences/writing",
    focus: (page) =>
      expect(page.getByRole("searchbox", { name: "Search…" })).toBeFocused(),
    context: {
      ...ON_A_SCRIPT,
      docOpen: false,
      role: null,
      screen: "preferences",
      focus: "field",
      panelOpen: { left: false, side: false },
    },
  },
];

type Outcome = "ran" | "passed" | "disabled" | "absent";

/** What the command service answers for `command` in `ctx`, in its order: absent, passed, disabled, ran. */
function outcomeOf(command: CommandDefinition, ctx: CommandContext): Outcome {
  if (command.visible !== null && !command.visible(ctx)) return "absent";
  if (command.passThrough !== null && command.passThrough(ctx)) return "passed";
  if (command.when !== null && !command.when(ctx)) return "disabled";
  return "ran";
}

const labelOf = (command: CommandDefinition, ctx: CommandContext): string =>
  typeof command.label === "string" ? command.label : command.label(ctx);

test("every default shortcut runs its command once, from the page, a panel and a field", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const platform = await platformOf(page);
  for (const spot of SPOTS)
    for (const command of COMMANDS)
      for (const chord of command.keys[platform]) {
        const ctx: CommandContext = { ...spot.context, platform };
        const outcome = outcomeOf(command, ctx);
        // the page's command keymap is not mounted yet, so nothing hears an editor command's key
        if (outcome === "absent" || command.scope === "editor") continue;
        await signedInAs(page, "you", spot.at);
        await spot.focus(page);
        // a load of another document would drop this mark; the window's listener hears the key after the app
        await page.evaluate(() => {
          Reflect.set(window, "__stayed", true);
          window.addEventListener("keydown", (event) =>
            Reflect.set(window, "__prevented", event.defaultPrevented),
          );
        });
        const ran = (await runs(page)).length;
        const pages = context.pages().length;
        await page.keyboard.press(keysFor(chord, platform));
        const after = await page.evaluate(() => ({
          stayed: Reflect.get(window, "__stayed"),
          prevented: Reflect.get(window, "__prevented"),
        }));
        // every press is reported, not only the first that differs
        expect
          .soft({
            at: `${command.id} by ${chord} in ${spot.name}`,
            ran: (await runs(page)).slice(ran),
            ...after,
            pages: context.pages().length,
          })
          .toEqual({
            at: `${command.id} by ${chord} in ${spot.name}`,
            ran: outcome === "ran" ? [command.id] : [],
            stayed: true,
            // a key the command passes on is the field's, the page's or the browser's
            prevented: outcome !== "passed",
            pages,
          });
        // a command that changes screen loads it first; the next press starts from a fresh load
        await page.waitForLoadState("networkidle");
        if (outcome === "disabled")
          await expect
            .soft(
              page.getByText(
                DIALOG_WORDS.disabledLine(
                  labelOf(command, ctx),
                  command.whyNot?.(ctx) ?? "",
                ),
              ),
            )
            .toBeVisible();
      }
});

/** Holds back every script that holds ProseMirror, the editor's, until `release`: the page stays its placeholder. */
async function holdTheEditor(page: Page): Promise<{ release(): void }> {
  const { promise: held, resolve: release } = Promise.withResolvers<void>();
  await page.route("**/chunk-*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    // a sentence only ProseMirror's state module holds
    if (body.includes("Adding different instances of a keyed plugin"))
      await held;
    await route.fulfill({ response, body });
  });
  return { release };
}

test("the palette's key works before the page is editable, and every typed character arrives", async ({
  page,
}) => {
  const editor = await holdTheEditor(page);
  // Firefox holds the load event while the held module is still on its way, so neither step waits for it
  await page.goto(`${DOC}?person=you`, { waitUntil: "commit" });
  await page.waitForURL((at) => !at.searchParams.has("person"), {
    waitUntil: "commit",
  });
  await page.locator("[data-region='page']").waitFor({ state: "attached" });
  expect(await editable(page).count()).toBe(0);
  await pressKeyOf(page, "app.palette");
  await page.keyboard.type("Theme: dark");
  await expect(page.getByRole("combobox", { name: "Commands" })).toHaveValue(
    "Theme: dark",
  );
  editor.release();
});

test("while an input method composes, Enter, Tab, Escape and the arrows belong to it", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "only Chromium starts a composition from a test",
  );
  // Tab is pressed last and only in the page: without a real input method the browser moves focus on it
  const keys = [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Escape",
    "Enter",
  ];
  await signedInAs(page, "you", STAND_IN);
  const cdp = await page.context().newCDPSession(page);
  const compose = () =>
    cdp.send("Input.imeSetComposition", {
      text: "か",
      selectionStart: 1,
      selectionEnd: 1,
    });
  // every key the window hears while composing, after the app has had it
  await page.evaluate(() => {
    const heard: string[] = [];
    Reflect.set(window, "__heard", heard);
    window.addEventListener("keydown", (event) => {
      if (event.isComposing)
        heard.push(`${event.key}${event.defaultPrevented ? " taken" : ""}`);
    });
  });
  const heard = (): Promise<unknown> =>
    page.evaluate(() => Reflect.get(window, "__heard"));

  // in the palette, the row stays highlighted and nothing runs or closes
  await editable(page).click();
  await pressKeyOf(page, "app.palette");
  const palette = page.getByRole("combobox", { name: "Commands" });
  await page.keyboard.type("theme");
  const highlighted = page.locator("[role='option'][data-highlighted]");
  const row = await highlighted.innerText();
  const ran = (await runs(page)).length;
  await compose();
  for (const key of keys) await page.keyboard.press(key);
  await expect(palette).toBeFocused();
  expect([
    await highlighted.innerText(),
    (await runs(page)).slice(ran),
  ]).toEqual([row, []]);
  await cdp.send("Input.imeSetComposition", {
    text: "",
    selectionStart: 0,
    selectionEnd: 0,
  });
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);

  // in the page, Escape leaves focus where it is and no key runs a command
  await editable(page).click();
  await compose();
  const focus = await focusedDescription(page);
  for (const key of keys) await page.keyboard.press(key);
  expect(await focusedDescription(page)).toBe(focus);
  await page.keyboard.press("Tab");
  expect([await heard(), (await runs(page)).slice(ran)]).toEqual([
    [...keys, ...keys, "Tab"],
    [],
  ]);
});
