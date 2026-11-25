// Keystroke to "Saved" in the browser: how long after a key the status bar says the change is saved on this device.
import type { Page } from "@playwright/test";
import { NotMeasured, benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import {
  caretAt,
  openCorpusScript,
  scriptBlocks,
} from "../typing/run-typing.ts";

const PAGES = 120;
/** Keystrokes a process makes, by mode; 230 keeps 207 after the warm-up. */
const KEYSTROKES = { quick: 3, standard: 230, full: 230 } as const;
const INTERVAL_MS = 300;
/** As long as one keystroke may take to be saved before it counts as never. */
const SAVED_MS = 10_000;
const STATUS_BAR = "[data-region='status_bar']";

/**
 * Presses `key` and resolves to the time from its keydown to the first change of the status bar after which its text
 * reads Saved, ms; or, when there is no such moment, why: the bar read Saved already at the keydown, or never did
 * within SAVED_MS.
 */
async function keyToSavedMs(
  page: Page,
  key: string,
): Promise<{ ms: number } | { missing: string }> {
  await page.evaluate(
    ({ bar, limitMs }) => {
      const element = document.querySelector(bar);
      if (element === null) throw new Error("the page has no status bar");
      const reads = (): boolean =>
        element.textContent?.includes("Saved") ?? false;
      const saved = new Promise((resolve) => {
        const onKey = (): void => {
          window.removeEventListener("keydown", onKey, { capture: true });
          const pressedAt = performance.now();
          if (reads()) {
            resolve({
              missing: "the status bar reads Saved before a keystroke",
            });
            return;
          }
          const observer = new MutationObserver(() => {
            if (!reads()) return;
            observer.disconnect();
            clearTimeout(timer);
            resolve({ ms: performance.now() - pressedAt });
          });
          const timer = setTimeout(() => {
            observer.disconnect();
            resolve({
              missing: `the status bar did not read Saved within ${limitMs} ms of a keystroke`,
            });
          }, limitMs);
          observer.observe(element, {
            subtree: true,
            childList: true,
            characterData: true,
          });
        };
        window.addEventListener("keydown", onKey, { capture: true });
      });
      Reflect.set(window, "__keyToSaved", saved);
    },
    { bar: STATUS_BAR, limitMs: SAVED_MS },
  );
  await page.keyboard.press(key);
  const told: unknown = await page.evaluate(() =>
    Reflect.get(window, "__keyToSaved"),
  );
  const ms: unknown = Reflect.get(Object(told), "ms");
  if (typeof ms === "number") return { ms };
  return { missing: String(Reflect.get(Object(told), "missing")) };
}

/**
 * In the corpus's screenplay of 120 pages (seed 1), as Dana: KEYSTROKES keys 300 ms apart at the end of a block in
 * the middle, `keystroke_saved` each from its keydown to the status bar reading Saved; and `input_blocks`.
 * NotMeasured, saying why, when a keystroke has no moment at which the status bar comes to read Saved.
 */
const scenario: Scenario = {
  id: "saved-web-120",
  workload: "W1",
  processes: 5,
  async run() {
    const demo = await startBenchDemo();
    try {
      const { page } = await demo.openPage({ userId: "dana" });
      const { d } = await openCorpusScript(page, PAGES);
      const blocks = await scriptBlocks(page);
      await caretAt(page, blocks[Math.floor(blocks.length / 2)]!.id, "end");
      const samples: number[] = [];
      for (let n = 0; n < KEYSTROKES[benchMode()]; n++) {
        const startedAt = performance.now();
        const saved = await keyToSavedMs(page, "x");
        if ("missing" in saved) throw new NotMeasured(saved.missing);
        samples.push(saved.ms);
        await Bun.sleep(
          Math.max(0, startedAt + INTERVAL_MS - performance.now()),
        );
      }
      return [
        measurement("keystroke_saved", "ms", samples),
        inputBlocks(d.blocks),
      ];
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
