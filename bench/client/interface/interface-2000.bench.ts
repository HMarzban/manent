// The interface beside a 2,000-page script: the theme switched, and clicks outside the page, each to its next paint.
import type { Page } from "@playwright/test";
import { benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import { openCorpusScript, runFromPalette } from "../typing/run-typing.ts";
import { createMarkLog, pageNow, switchTheme } from "./drive.ts";

const PAGES = 2000;
/** Theme switches there and back, and clicks on each control, a process makes, by mode. */
const TIMES = { quick: 1, standard: 10, full: 10 } as const;
const CLICKS = { quick: 1, standard: 20, full: 20 } as const;

/** A control outside the page, what its click opens, and how that is closed again. */
interface Control {
  selector: string;
  opens: string;
  close(page: Page): Promise<void>;
}

const pressEscape = (page: Page): Promise<void> =>
  page.keyboard.press("Escape");

/** The palette's button, the page readout that opens Details in the side panel, and the View menu. */
const CONTROLS: readonly Control[] = [
  {
    selector: "[data-region='status_bar'] [data-tour='app.palette']",
    opens: "[role='combobox']",
    close: pressEscape,
  },
  {
    selector: "[data-region='status_bar'] button:has-text('Page ')",
    opens: "[data-region='side_panel']",
    close: async (page) => {
      await runFromPalette(page, "Side panel");
    },
  },
  {
    selector: "[data-region='status_bar'] [data-slot='dropdown-menu-trigger']",
    opens: "[role='menu']",
    close: pressEscape,
  },
];

/**
 * Starts recording each click: its Event Timing `duration` when Event Timing reports it, which it does only from
 * 16 ms; otherwise the page's own time from the click's timestamp to the next paint, the span Event Timing measures.
 */
const watchClicks = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const entries: { startTime: number; duration: number }[] = [];
    const clicks: { startTime: number; duration: number }[] = [];
    // the shortest duration Event Timing reports; the DOM's types do not name the option
    const options = { type: "event", durationThreshold: 16 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (entry.name === "click")
          entries.push({
            startTime: entry.startTime,
            duration: entry.duration,
          });
    }).observe(options);
    window.addEventListener(
      "click",
      (event) => {
        const startTime = event.timeStamp;
        requestAnimationFrame(() => {
          const channel = new MessageChannel();
          channel.port1.addEventListener("message", () => {
            clicks.push({ startTime, duration: performance.now() - startTime });
            channel.port1.close();
          });
          channel.port1.start();
          channel.port2.postMessage(null);
        });
      },
      { capture: true },
    );
    Reflect.set(window, "__clicks", { entries, clicks });
  });

interface Timed {
  startTime: number;
  duration: number;
}

const readTimed = (list: unknown): Timed[] =>
  (Array.isArray(list) ? list : []).map((x: unknown) => ({
    startTime: Number(Reflect.get(Object(x), "startTime")),
    duration: Number(Reflect.get(Object(x), "duration")),
  }));

/** Each click recorded since `fromMs`, ms: its Event Timing duration, or the page's own when Event Timing has none. */
async function clickDurations(page: Page, fromMs: number): Promise<number[]> {
  const watched: unknown = await page.evaluate(() =>
    Reflect.get(window, "__clicks"),
  );
  const entries = readTimed(Reflect.get(Object(watched), "entries"));
  return readTimed(Reflect.get(Object(watched), "clicks"))
    .filter((click) => click.startTime >= fromMs)
    .map(
      (click) =>
        (
          entries.find(
            (entry) => Math.abs(entry.startTime - click.startTime) < 1,
          ) ?? click
        ).duration,
    );
}

/**
 * In the corpus's screenplay of 2,000 pages (seed 1), as Dana: the theme switched from Light to Dark and back TIMES
 * times a process, `theme_apply_ms` the `ui.setting.apply` mark's durations; CLICKS clicks each on the palette's
 * button, the page readout and the View menu, `inp_outside_ms` each click's duration to the next paint; and
 * `input_blocks`.
 */
const scenario: Scenario = {
  id: "interface-2000",
  workload: "W7",
  processes: 5,
  async run() {
    const mode = benchMode();
    const demo = await startBenchDemo();
    try {
      const { page } = await demo.openPage({ userId: "dana" });
      const { d } = await openCorpusScript(page, PAGES);
      const log = createMarkLog(page);
      for (let n = 0; n < TIMES[mode]; n++) {
        const fromMs = await pageNow(page);
        await switchTheme(page);
        await log.gather(["ui.setting.apply"], fromMs);
      }
      await watchClicks(page);
      const fromMs = await pageNow(page);
      for (const control of CONTROLS)
        for (let n = 0; n < CLICKS[mode]; n++) {
          await page.locator(control.selector).first().click();
          await page.locator(control.opens).first().waitFor();
          await control.close(page);
          await page
            .locator(control.opens)
            .first()
            .waitFor({ state: "hidden" });
        }
      return [
        measurement("theme_apply_ms", "ms", log.durations("ui.setting.apply")),
        measurement("inp_outside_ms", "ms", await clickDurations(page, fromMs)),
        inputBlocks(d.blocks),
      ];
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
