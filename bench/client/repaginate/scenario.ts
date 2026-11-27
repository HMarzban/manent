// Repaginating in the real editor: the frame after the paper changes, when every break moves, and the keystroke that
// pushes one line over a page's end.
import type { CDPSession, Page } from "@playwright/test";
import { benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import {
  caretAt,
  keyToPaintMs,
  openCorpusScript,
  pageStarts,
  runFromPalette,
  scriptBlocks,
  settled,
} from "../typing/run-typing.ts";

/** Paper changes a process makes, there and back, and lines it pushes over a page's end, by mode. */
const ROUNDS = {
  quick: { paper: 1, lines: 1 },
  standard: { paper: 10, lines: 50 },
  full: { paper: 10, lines: 50 },
} as const;
const PAPERS = ["Paper: A4", "Paper: US Letter"] as const;
const BREAKS_MS = 60_000;
const BREAKS_POLL_MS = 100;

/** Resolves once the page breaks are no longer `before`. */
async function untilBreaksMove(page: Page, before: string): Promise<void> {
  const until = performance.now() + BREAKS_MS;
  while (JSON.stringify(await pageStarts(page)) === before) {
    if (performance.now() > until)
      throw new Error("the page breaks did not move with the paper");
    await Bun.sleep(BREAKS_POLL_MS);
  }
}

/** Each change of paper, Letter to A4 and back `rounds` times: the palette's Enter to the next paint, ms. */
async function paperFrames(
  page: Page,
  cdp: CDPSession | null,
  rounds: number,
): Promise<number[]> {
  const samples: number[] = [];
  for (let n = 0; n < rounds; n++)
    for (const label of PAPERS) {
      const before = JSON.stringify(await pageStarts(page));
      samples.push(await runFromPalette(page, label));
      await untilBreaksMove(page, before);
      await settled(page);
      if (cdp !== null) await cdp.send("HeapProfiler.collectGarbage");
    }
  return samples;
}

/** `times` Enters at the end of the block that ends a page in the script's middle, each taken back: keydown to paint, ms. */
async function pushedLines(page: Page, times: number): Promise<number[]> {
  const starts = await pageStarts(page);
  const next = starts[Math.floor(starts.length / 2)]!;
  const blocks = await scriptBlocks(page);
  const ending = blocks[next - 1]!;
  const samples: number[] = [];
  for (let n = 0; n < times; n++) {
    await caretAt(page, ending.id, "end");
    samples.push(await keyToPaintMs(page, "Enter", "Enter"));
    await page.keyboard.press("Backspace");
    await settled(page);
  }
  return samples;
}

/**
 * Repaginating the corpus's screenplay of `pages` pages (seed 1) as Dana: the paper changed from Letter to A4 and
 * back through the palette's script setting, each time from the Enter that runs it to the next paint
 * (`breaks_frame_ms`); a new line at the end of the block that ends a page in the middle, from the Enter to the next
 * paint (`incremental_ms`), each taken back with a Backspace; and `input_blocks`.
 */
export function repaginateScenario(pages: 120 | 2000): Scenario {
  return {
    id: `repaginate-${pages}`,
    workload: pages === 120 ? "W1" : "W7",
    processes: 5,
    async run() {
      const rounds = ROUNDS[benchMode()];
      const demo = await startBenchDemo();
      try {
        const { page, cdp } = await demo.openPage({ userId: "dana" });
        const { d } = await openCorpusScript(page, pages);
        const breaks = await paperFrames(page, cdp, rounds.paper);
        const lines = await pushedLines(page, rounds.lines);
        return [
          measurement("breaks_frame_ms", "ms", breaks),
          measurement("incremental_ms", "ms", lines),
          inputBlocks(d.blocks),
        ];
      } finally {
        await demo.stop();
      }
    },
  };
}
