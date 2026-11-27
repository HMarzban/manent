// The interface driven as a person drives it, for the interface scenarios: each surface opened and closed, a setting
// changed, the person switched, another screen opened and the app reloaded.
import { DEMO_PEOPLE } from "@manent/demo";
import type { Page } from "@playwright/test";
import {
  markRecords,
  runFromPalette,
  settled,
  untilBlocks,
} from "../typing/run-typing.ts";

const THEMES = ["Theme: Dark", "Theme: Light"] as const;
const POPOVER_TRIGGER =
  "[data-region='title_bar'] [data-slot='popover-trigger']";
const POPOVER = "[data-slot='popover-content']";
const DIALOG = "[role='dialog']";
const LEFT_PANEL = "[data-region='left_panel']";
/** As long as the Send screen may take to draw before its mark counts as never kept. */
const SCREEN_MS = 30_000;
const SCREEN_POLL_MS = 100;

/** The durations, ms, of the marks a page kept, gathered step by step and across its loads. */
export interface MarkLog {
  /** Adds the records of `names` the page kept since `fromMs` on its clock; 0 takes every one since it loaded. */
  gather(names: readonly string[], fromMs: number): Promise<void>;
  /** Records a duration, ms, measured directly around a surface interaction. */
  record(name: string, ms: number): void;
  durations(name: string): number[];
}

export function createMarkLog(page: Page): MarkLog {
  const log = new Map<string, number[]>();
  return {
    async gather(names, fromMs) {
      for (const name of names) {
        const kept = (await markRecords(page, name))
          .filter((record) => record.startMs >= fromMs)
          .map((record) => record.durationMs);
        log.set(name, [...(log.get(name) ?? []), ...kept]);
      }
    },
    record(name, ms) {
      log.set(name, [...(log.get(name) ?? []), ms]);
    },
    durations: (name) => log.get(name) ?? [],
  };
}

/** The page's clock now, ms: where the marks of the next step begin. */
export const pageNow = (page: Page): Promise<number> =>
  page.evaluate(() => performance.now());

/** Waits until an element matching `selector` is visible, presses Escape, and waits until it is gone. */
async function shownThenClosed(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.locator(selector).first().waitFor({ state: "hidden" });
}

/** Milliseconds from clicking `selector` in-page to the first frame `surface` is visible. */
const openingClickMs = (
  page: Page,
  selector: string,
  surface: string,
): Promise<number> =>
  page.evaluate(
    ({ wanted, shown }) =>
      new Promise<number>((resolve, reject) => {
        const target = document.querySelector(wanted);
        if (!(target instanceof HTMLElement)) {
          reject(new Error(`no control ${wanted}`));
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
          const el = document.querySelector(shown);
          if (el !== null && el.checkVisibility())
            resolve(performance.now() - startedAt);
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
    { wanted: selector, shown: surface },
  );

/** The palette opened from the keyboard, a search typed in it, and closed (`ui.open.palette`, `ui.search.palette`). */
export async function searchPalette(page: Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.getByRole("combobox");
  await search.waitFor();
  await page.keyboard.type("Theme");
  await page.keyboard.press("Escape");
  await search.waitFor({ state: "hidden" });
}

/** The status's popover opened and closed (`ui.open.popover`), returning click-to-visible ms. */
export async function openPopover(page: Page): Promise<number> {
  const ms = await openingClickMs(page, POPOVER_TRIGGER, POPOVER);
  await page.keyboard.press("Escape");
  await page.locator(POPOVER).first().waitFor({ state: "hidden" });
  return ms;
}

/** The left panel opened and closed again from the palette (`ui.open.panel`), returning open-to-paint ms. */
export async function togglePanel(page: Page): Promise<number> {
  const ms = await runFromPalette(page, "Left panel");
  await page.locator(LEFT_PANEL).waitFor();
  await runFromPalette(page, "Left panel");
  await page.locator(LEFT_PANEL).waitFor({ state: "detached" });
  return ms;
}

/** The Sync centre's dialog opened from the palette and closed (`ui.open.dialog`), returning open-to-paint ms. */
export async function openDialog(page: Page): Promise<number> {
  const ms = await runFromPalette(page, "Sync centre");
  await shownThenClosed(page, DIALOG);
  return ms;
}

/** The theme switched to Dark and back to Light from the palette (`ui.setting.apply`). */
export async function switchTheme(page: Page): Promise<void> {
  for (const label of THEMES) {
    await runFromPalette(page, label);
    await settled(page);
  }
}

/** Preferences opened from the keyboard, then the script again (`ui.open.preferences`). */
export async function openPreferences(
  page: Page,
  blocks: number,
): Promise<void> {
  await page.keyboard.press("ControlOrMeta+,");
  await page.getByRole("searchbox").waitFor();
  await page.goBack();
  await untilBlocks(page, blocks);
}

const nameOf = (userId: string): string => {
  const person = DEMO_PEOPLE.find((p) => p.userId === userId);
  if (person === undefined) throw new RangeError(`no demo person ${userId}`);
  return person.name;
};

/** The tab switched from `people.from` to `people.to` through the demo bar, and back (`ui.switch.person`). */
export async function switchPerson(
  page: Page,
  people: { from: string; to: string },
  blocks: number,
): Promise<void> {
  for (const [now, next] of [
    [people.from, people.to],
    [people.to, people.from],
  ] as const) {
    await page.getByRole("button", { name: `Person: ${nameOf(now)}` }).click();
    await page
      .getByRole("button", { name: new RegExp(`^${nameOf(next)}`) })
      .click();
    await page
      .getByRole("button", { name: `Person: ${nameOf(next)}` })
      .waitFor();
  }
  await untilBlocks(page, blocks);
}

/**
 * The Send screen loaded at its address, until it has kept its `ui.open.screen` mark or SCREEN_MS has passed; the
 * caller gathers its marks before the script loads again.
 */
export async function openSendScreen(
  page: Page,
  at: { url: string; docId: string },
): Promise<void> {
  await page.goto(`${at.url}/s/${at.docId}/send/send_draft`);
  const until = performance.now() + SCREEN_MS;
  while (
    (await markRecords(page, "ui.open.screen")).length === 0 &&
    performance.now() < until
  )
    await Bun.sleep(SCREEN_POLL_MS);
}

/** The script loaded again at its address, once it holds `blocks` blocks. */
export async function openScriptAt(
  page: Page,
  at: { url: string; docId: string },
  blocks: number,
): Promise<void> {
  await page.goto(`${at.url}/s/${at.docId}`);
  await untilBlocks(page, blocks);
}
