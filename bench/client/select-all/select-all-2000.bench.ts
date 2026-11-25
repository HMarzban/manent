// Selecting the whole of a 2,000-page script and collapsing the selection again: the frame of each.
import { benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import {
  caretAt,
  keyToPaintMs,
  openCorpusScript,
  scriptBlocks,
  settled,
} from "../typing/run-typing.ts";

const PAGES = 2000;
/** Selections a process makes, by mode. */
const TIMES = { quick: 1, standard: 10, full: 10 } as const;

/**
 * In the corpus's screenplay of 2,000 pages (seed 1), as Dana, with the caret in the middle: Cmd or Ctrl+A, keydown
 * to the next paint (`select_frame_ms`), then the right arrow, keydown to the next paint (`collapse_frame_ms`); and
 * `input_blocks`.
 */
const scenario: Scenario = {
  id: "select-all-2000",
  workload: "W7",
  processes: 5,
  async run() {
    const demo = await startBenchDemo();
    try {
      const { page } = await demo.openPage({ userId: "dana" });
      const { d } = await openCorpusScript(page, PAGES);
      const blocks = await scriptBlocks(page);
      await caretAt(page, blocks[Math.floor(blocks.length / 2)]!.id, "end");
      const select: number[] = [];
      const collapse: number[] = [];
      for (let n = 0; n < TIMES[benchMode()]; n++) {
        select.push(await keyToPaintMs(page, "ControlOrMeta+a", "a"));
        await settled(page);
        collapse.push(await keyToPaintMs(page, "ArrowRight", "ArrowRight"));
        await settled(page);
      }
      return [
        measurement("select_frame_ms", "ms", select),
        measurement("collapse_frame_ms", "ms", collapse),
        inputBlocks(d.blocks),
      ];
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
