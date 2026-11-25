// Opening a script: the first time on a device, again after a reload, and again with the network cut, each to the
// editor accepting input with content; and the page's heap and nodes once it is open.
import { blockIds } from "@manent/crdt";
import { createBot } from "@manent/testkit";
import type { Page } from "@playwright/test";
import { NotMeasured, benchMode } from "../../env.ts";
import type { Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { domNodes, heapBytes, startBenchDemo } from "../driver.ts";
import type { BenchDemo } from "../driver.ts";
import {
  markRecords,
  openCorpusScript,
  untilBlocks,
} from "../typing/run-typing.ts";

/** Opens a process makes of each kind, by mode. */
const OPENS = { quick: 1, standard: 10, full: 10 } as const;
const WORKLOADS: Readonly<Record<120 | 300 | 2000, Scenario["workload"]>> = {
  120: "W1",
  300: null,
  2000: "W7",
};

/** As long as a 2,000-page script may take to reach the server on a loaded machine. */
const SERVER_MS = 180_000;
/** Each try opens a fresh bot, so that one subscription that is never sent the script does not end the wait. */
const ATTEMPT_MS = 15_000;
const SERVER_POLL_MS = 500;

/**
 * Resolves once the server holds all `blocks` blocks of `docId`, read by a bot of `userId`: the status beside the
 * title can still read Synced from before the script was made.
 */
async function untilServerHolds(
  demo: BenchDemo,
  at: { userId: string; docId: string; blocks: number },
): Promise<void> {
  const until = performance.now() + SERVER_MS;
  let held = 0;
  while (performance.now() < until) {
    const bot = createBot({
      server: { url: demo.url },
      userId: at.userId,
      token: await demo.token(at.userId),
    });
    try {
      const handle = await bot.open(at.docId);
      const attemptUntil = performance.now() + ATTEMPT_MS;
      while (performance.now() < attemptUntil) {
        held = blockIds(handle.doc()).length;
        if (held === at.blocks) return;
        await Bun.sleep(SERVER_POLL_MS);
      }
    } finally {
      await bot.close();
    }
  }
  throw new Error(`the server held ${held} of the ${at.blocks} blocks`);
}

/** Runs `navigate`, waits until the page holds `blocks` blocks, and resolves to that load's `open.editable` mark, ms. */
async function editableMs(
  page: Page,
  navigate: () => Promise<unknown>,
  blocks: number,
): Promise<number> {
  await navigate();
  await untilBlocks(page, blocks);
  const [record] = await markRecords(page, "open.editable");
  if (record === undefined)
    throw new NotMeasured("the open.editable mark was not recorded");
  return record.durationMs;
}

/** The reload with the network cut, which needs the shell the page cached. */
async function offlineReload(page: Page): Promise<void> {
  try {
    await page.reload();
  } catch (error) {
    throw new NotMeasured(
      `the shell was not cached: a reload with the network cut did not load (${String(error).split("\n")[0]})`,
    );
  }
}

/**
 * Opening the corpus's screenplay of `pages` pages (seed 1), made once through the editor's hooks as Dana: OPENS times
 * a fresh browser context opens it online (`first_editable_cold`), reloads it (`first_editable_warm`), then reloads it
 * with the network cut (`first_editable_offline`), each read from the `open.editable` mark; `heap_bytes` and
 * `dom_nodes` after each warm open; and `input_blocks`.
 */
export function openScenario(pages: 120 | 300 | 2000): Scenario {
  return {
    id: `open-${pages}`,
    workload: WORKLOADS[pages],
    processes: 5,
    async run() {
      const demo = await startBenchDemo();
      try {
        const maker = await demo.openPage({ userId: "dana" });
        const { d, docId } = await openCorpusScript(maker.page, pages);
        await untilServerHolds(demo, {
          userId: "dana",
          docId,
          blocks: d.blocks,
        });
        await maker.close();
        const cold: number[] = [];
        const warm: number[] = [];
        const offline: number[] = [];
        const heap: number[] = [];
        const nodes: number[] = [];
        for (let n = 0; n < OPENS[benchMode()]; n++) {
          const p = await demo.openPage({ userId: "dana" });
          try {
            const { page } = p;
            const at = `${demo.url}/s/${docId}`;
            cold.push(await editableMs(page, () => page.goto(at), d.blocks));
            warm.push(await editableMs(page, () => page.reload(), d.blocks));
            heap.push(await heapBytes(p));
            nodes.push(await domNodes(p));
            await page.context().setOffline(true);
            offline.push(
              await editableMs(page, () => offlineReload(page), d.blocks),
            );
          } finally {
            await p.close();
          }
        }
        return [
          measurement("first_editable_cold", "ms", cold),
          measurement("first_editable_warm", "ms", warm),
          measurement("first_editable_offline", "ms", offline),
          measurement("heap_bytes", "bytes", heap),
          measurement("dom_nodes", "count", nodes),
          inputBlocks(d.blocks),
        ];
      } finally {
        await demo.stop();
      }
    },
  };
}
