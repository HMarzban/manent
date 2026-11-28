// Every default shortcut from the registry, pressed where a person writes, reads a panel and types in a field.
import { COMMANDS, resolveBindings } from "@manent/commands";
import type { CommandContext, CommandDefinition } from "@manent/commands";
import { corpusDoc } from "@manent/pagination/testing";
import { DIALOG_WORDS } from "@manent/ui";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { corpusLine, openScript, viewItem } from "../editor/support.ts";
import {
  focusedDescription,
  keysFor,
  ON_A_SCRIPT,
  platformOf,
  pressKeyOf,
  runs,
} from "../support/interface.ts";
import { makeScript } from "../support/made-script.ts";
import { signedInAs } from "../support/tour.ts";

const DOC_ID = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const DOC = `/s/${DOC_ID}`;
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
      await expect(
        page.locator("[data-region='page'] .mn-page-view"),
      ).toBeFocused();
      const tabs = page.locator("[data-region='side_panel'] [role='tab']");
      // Wait for any persisted panel state to settle, then ensure Side panel is open on a tab strip (never toggling an open panel closed).
      if ((await tabs.count()) === 0) {
        await page.getByRole("button", { name: "View" }).click();
        const item = page.getByRole("menuitemcheckbox", {
          name: /^Side panel/,
        });
        if ((await item.getAttribute("aria-checked")) !== "true") {
          await item.click();
          await page.keyboard.press("Escape");
        } else {
          // Side panel was already checked (e.g. a standalone tab like History or restored asynchronously); close menu and ensure Details tab is open.
          await page.keyboard.press("Escape");
          if ((await tabs.count()) === 0) {
            await page.getByRole("button", { name: "View" }).click();
            await item.click();
            await page.keyboard.press("Escape");
          }
        }
      }
      await tabs.first().focus();
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
  typeof command.label === "string"
    ? command.label
    : command.label(ctx, { get: () => undefined });

test("every default shortcut runs its command once, from the page, a panel and a field", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const platform = await platformOf(page);
  // a page opens only a script its device keeps
  await signedInAs(page, "you");
  await makeScript(page, DOC_ID);
  const { effective } = resolveBindings({
    commands: COMMANDS,
    custom: [],
    platform,
    shell: "web",
    findings: { failsHere: new Set() },
  });
  for (const spot of SPOTS)
    for (const command of COMMANDS)
      for (const chord of effective.get(command.id) ?? []) {
        const ctx: CommandContext = { ...spot.context, platform };
        const outcome = outcomeOf(command, ctx);
        // only global commands bind on the document; editor keys belong to the page (editor/flow.e2e.ts),
        // surface keys (such as scene.moveUp/Down in surface:left_panel) bind only inside their own surface,
        // and Mod+P opens the Send screen (editor/send.e2e.ts)
        if (
          outcome === "absent" ||
          command.scope !== "global" ||
          command.id === "doc.print"
        )
          continue;
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
        // a command that changes screen loads it first; bound networkidle so background SW/demo traffic cannot stall the loop
        await page
          .waitForLoadState("networkidle", { timeout: 1_500 })
          .catch(() => {});
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

test("scene move keys run in the Scenes tab and pass through outside it", async ({
  page,
}) => {
  await openScript(
    page,
    "screenplay",
    corpusDoc([
      corpusLine("scene_heading", "INT. FIRST - DAY"),
      corpusLine("scene_heading", "INT. SECOND - DAY"),
      corpusLine("scene_heading", "INT. THIRD - DAY"),
    ]),
  );
  const rows = page.locator("[data-region='left_panel'] [data-sortable-id]");
  if ((await rows.count()) === 0) await viewItem(page, /^Left panel/);
  await expect(rows).toHaveCount(3);
  const headings = () =>
    rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-sortable-id") ?? ""),
    );
  const before = await headings();

  // outside the left panel, Alt+ArrowUp belongs to the page and neither runs nor prevents default
  await editable(page).click();
  await page.evaluate(() => {
    window.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown")
        Reflect.set(window, "__moveHeard", {
          key: event.key,
          prevented: event.defaultPrevented,
        });
    });
  });
  const heard = () => page.evaluate(() => Reflect.get(window, "__moveHeard"));
  const beforePage = (await runs(page)).length;
  await page.keyboard.press("Alt+ArrowUp");
  expect([await heard(), (await runs(page)).slice(beforePage)]).toEqual([
    { key: "ArrowUp", prevented: false },
    [],
  ]);

  // on a scene row in the Scenes tab, Alt+ArrowUp and Alt+ArrowDown run once, stop propagation, and move the scene
  await page.evaluate(() => Reflect.set(window, "__moveHeard", null));
  await rows.nth(1).locator("[tabindex]").first().focus();
  const beforeUp = (await runs(page)).length;
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(headings).toEqual([before[1]!, before[0]!, before[2]!]);
  expect([await heard(), (await runs(page)).slice(beforeUp)]).toEqual([
    null,
    ["scene.moveUp"],
  ]);

  const beforeDown = (await runs(page)).length;
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(headings).toEqual(before);
  expect([await heard(), (await runs(page)).slice(beforeDown)]).toEqual([
    null,
    ["scene.moveDown"],
  ]);
});
