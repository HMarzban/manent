// Opening a surface the way a person would, saying what holds focus, and reading which commands ran, in the test build.
import { COMMANDS } from "@manent/commands";
import type {
  Chord,
  CommandContext,
  CommandDefinition,
  CommandId,
} from "@manent/commands";
import type { Platform } from "@manent/settings";
import type { SurfaceEntry } from "@manent/ui";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** The command `id`; throws RangeError when there is none. */
export function commandOf(id: string): CommandDefinition {
  const command = COMMANDS.find((c) => c.id === id);
  if (command === undefined) throw new RangeError(`no command ${id}`);
  return command;
}

/**
 * What the commands see for You on the test script, written out by hand: never synced, in the demo, with no
 * production state. The History tab is listed on every document, so `history.open` is always offered.
 */
export const ON_A_SCRIPT = {
  docOpen: true,
  role: "editor",
  online: true,
  shell: "web",
  demo: true,
  signedIn: false,
  historyPresent: true,
  format: null,
  rulerShown: false,
  spaceBeforeSet: false,
  zoom: null,
  zoomPercent: null,
  production: null,
} as const satisfies Partial<CommandContext>;

/** The label of `id`; throws RangeError when it depends on the context. */
export function labelOf(id: CommandId): string {
  const { label } = commandOf(id);
  if (typeof label !== "string")
    throw new RangeError(`${id} has no plain label`);
  return label;
}

/**
 * The platform the app binds keys for: the system its user agent names, as the app reads it. Playwright's WebKit
 * names macOS on every host, so on Linux it gets the Mac's keys while `navigator.platform` says Linux.
 */
export async function platformOf(page: Page): Promise<Platform> {
  const agent = await page.evaluate(() => navigator.userAgent);
  if (/\bMac OS X\b/.test(agent)) return "mac";
  return /\bWindows\b/.test(agent) ? "windows" : "linux";
}

/** The keys Playwright presses for `chord`: `Mod` is Meta on macOS and Control elsewhere. */
export function keysFor(chord: Chord, platform: Platform): string {
  return chord.replace(/^Mod\+/, platform === "mac" ? "Meta+" : "Control+");
}

/** Presses the first key of `id` on the page's platform; throws RangeError when it has none there. */
export async function pressKeyOf(page: Page, id: CommandId): Promise<void> {
  const platform = await platformOf(page);
  const chord = commandOf(id).keys[platform][0];
  if (chord === undefined)
    throw new RangeError(`${id} has no key on ${platform}`);
  await page.keyboard.press(keysFor(chord, platform));
}

/**
 * Opens `entry` by running `opener`: by its first key on this platform, by typing its label in the palette and
 * pressing Enter, or by pressing Enter on its control (the element that carries `data-tour="<opener>"`). Throws
 * RangeError when the command has no key here, no plain label or no control on the page.
 */
export async function openSurface(
  page: Page,
  entry: SurfaceEntry,
  opener: CommandId,
  by: "key" | "palette" | "control",
): Promise<void> {
  const command = commandOf(opener);
  if (!entry.openedBy.includes(opener))
    throw new RangeError(`${opener} does not open ${entry.id}`);
  switch (by) {
    case "key":
      await pressKeyOf(page, opener);
      return;
    case "palette": {
      if (typeof command.label !== "string")
        throw new RangeError(`${opener}'s label depends on the context`);
      await pressKeyOf(page, "app.palette");
      await page.getByRole("combobox", { name: "Commands" }).waitFor();
      await page.keyboard.type(command.label);
      await page.keyboard.press("Enter");
      return;
    }
    case "control": {
      const control = page.locator(`[data-tour="${opener}"]:visible`).first();
      if ((await control.count()) === 0)
        throw new RangeError(`${opener} has no control on this page`);
      await control.focus();
      await control.press("Enter");
      return;
    }
    default:
      by satisfies never;
  }
}

/**
 * What holds focus: `body` when nothing does, else the region it is in (or `outside`, for a popup drawn at the end of
 * the page), its role or tag, and its name.
 */
export async function focusedDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body) return "body";
    const region =
      element.closest("[data-region]")?.getAttribute("data-region") ??
      "outside";
    const role = element.getAttribute("role") ?? element.tagName.toLowerCase();
    const labelledBy = element.getAttribute("aria-labelledby");
    const labelled =
      labelledBy === null ? null : document.getElementById(labelledBy);
    const name =
      element.getAttribute("aria-label") ??
      labelled?.textContent ??
      element.textContent ??
      "";
    return `${region} ${role} "${name.trim()}"`;
  });
}

/** Every command the test build has seen run, in order, through any way. */
export async function runs(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hook: unknown = Reflect.get(window, "__manent");
    const list: unknown =
      typeof hook === "object" && hook !== null
        ? Reflect.get(hook, "runs")
        : null;
    if (!Array.isArray(list))
      throw new Error("the test build's list of runs is missing");
    return list.map(String);
  });
}

/** The durations, in milliseconds and oldest first, of the marks named `name` the test build has kept. */
export async function markDurations(
  page: Page,
  name: string,
): Promise<number[]> {
  return page.evaluate((wanted) => {
    const hook: unknown = Reflect.get(window, "__manent");
    const read: unknown =
      typeof hook === "object" && hook !== null
        ? Reflect.get(hook, "readMarks")
        : null;
    if (typeof read !== "function")
      throw new Error("the test build's marks are missing");
    const marks: unknown = Reflect.apply(read, hook, [wanted]);
    if (!Array.isArray(marks)) throw new Error("the marks are not a list");
    return marks.map((mark: unknown) =>
      Number(
        typeof mark === "object" && mark !== null
          ? Reflect.get(mark, "durationMs")
          : NaN,
      ),
    );
  }, name);
}

/** The longest of the marks named `name`, in milliseconds; throws when the test build has kept none. */
export async function longestMark(page: Page, name: string): Promise<number> {
  const durations = await markDurations(page, name);
  if (durations.length === 0) throw new Error(`no ${name} mark was kept`);
  return Math.max(...durations);
}

/** Runs the palette's row labelled `label` once the palette has highlighted it, then closes the palette. */
export async function runFromPalette(page: Page, label: string): Promise<void> {
  await pressKeyOf(page, "app.palette");
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.type(label);
  await expect(page.locator("[role='option'][data-highlighted]")).toContainText(
    label,
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
}
