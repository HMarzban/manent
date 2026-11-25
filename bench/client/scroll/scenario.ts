// Scrolling a script from top to bottom with the wheel, at reading speed and at fling speed: the time between frames.
import type { Page } from "@playwright/test";
import { benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import { openCorpusScript, settled } from "../typing/run-typing.ts";

/** Pixels the wheel scrolls every STEP_MS: reading speed, then fling speed. */
const SPEEDS_PX = [300, 3000] as const;
const STEP_MS = 100;
/** A quick run turns the wheel this many times at each speed; the others go from top to bottom. */
const QUICK_STEPS = 3;
/** A frame at least this long counts in `frames_over_50`. */
const LONG_FRAME_MS = 50;
/** Wheel turns in a row that leave the page where it was before the scroll counts as stuck. */
const STUCK_STEPS = 50;

/** Moves the element that scrolls the editor (its nearest ancestor that scrolls) to `top`, or leaves it where it is (null); where it stands then and how far it can go, px. */
const scrollerAt = (
  page: Page,
  top: number | null,
): Promise<{ top: number; bottom: number }> =>
  page.evaluate((to) => {
    let element = document.querySelector("[data-editor-host]");
    while (
      element !== null &&
      !/(auto|scroll)/.test(getComputedStyle(element).overflowY)
    )
      element = element.parentElement;
    if (element === null) throw new Error("nothing scrolls the editor");
    if (to !== null) element.scrollTop = to;
    return {
      top: element.scrollTop,
      bottom: element.scrollHeight - element.clientHeight,
    };
  }, top);

/** Starts recording the time between the page's animation frames. */
const startFrames = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const frames: number[] = [];
    const recording = { frames, on: true };
    Reflect.set(window, "__frames", recording);
    let last: number | null = null;
    const tick = (time: number): void => {
      if (last !== null) frames.push(time - last);
      last = time;
      if (recording.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

/** Stops the recording and resolves to the time between each two frames, ms. */
const stopFrames = (page: Page): Promise<number[]> =>
  page.evaluate(() => {
    const recording: unknown = Reflect.get(window, "__frames");
    Reflect.set(Object(recording), "on", false);
    const frames: unknown = Reflect.get(Object(recording), "frames");
    if (!Array.isArray(frames)) throw new RangeError("no frames were recorded");
    return frames.map(Number);
  });

/** From the top, turns the wheel `px` every STEP_MS until the page reaches its end, or `steps` times; the frames meanwhile, ms. */
async function wheelDown(
  page: Page,
  px: number,
  steps: number | null,
): Promise<number[]> {
  await scrollerAt(page, 0);
  await settled(page);
  const view = page.viewportSize();
  if (view === null) throw new Error("the page has no viewport");
  await page.mouse.move(view.width / 2, view.height / 2);
  await startFrames(page);
  let last = 0;
  let stuck = 0;
  for (let n = 0; n < (steps ?? Infinity); n++) {
    const startedAt = performance.now();
    await page.mouse.wheel(0, px);
    const { top, bottom } = await scrollerAt(page, null);
    if (top >= bottom - 1) break;
    stuck = top === last ? stuck + 1 : 0;
    if (stuck === STUCK_STEPS)
      throw new Error(`the page stopped scrolling at ${top} of ${bottom} px`);
    last = top;
    await Bun.sleep(Math.max(0, startedAt + STEP_MS - performance.now()));
  }
  return stopFrames(page);
}

/**
 * Scrolling the corpus's screenplay of `pages` pages (seed 1) as Dana, from top to bottom with the wheel at 300 px
 * then at 3,000 px every 100 ms: `frame_ms` the time between animation frames, `frames_over_50` the percent of them
 * 50 ms or longer (one a process), and `input_blocks`.
 */
export function scrollScenario(pages: 120 | 2000): Scenario {
  return {
    id: `scroll-${pages}`,
    workload: pages === 120 ? "W1" : "W7",
    processes: 5,
    async run() {
      const demo = await startBenchDemo();
      try {
        const { page } = await demo.openPage({ userId: "dana" });
        const { d } = await openCorpusScript(page, pages);
        const steps = benchMode() === "quick" ? QUICK_STEPS : null;
        const frames: number[] = [];
        for (const px of SPEEDS_PX)
          frames.push(...(await wheelDown(page, px, steps)));
        const long = frames.filter((ms) => ms >= LONG_FRAME_MS).length;
        return [
          measurement("frame_ms", "ms", frames),
          measurement("frames_over_50", "percent", [
            (long / frames.length) * 100,
          ]),
          inputBlocks(d.blocks),
        ];
      } finally {
        await demo.stop();
      }
    },
  };
}
