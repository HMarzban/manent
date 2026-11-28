// Offline merge: the browser types offline while an extreme simulated writer accumulates offline
// operations on a compressed clock, then both reconnect together and every marker must survive.
import { measureDoc, scriptBody } from "@manent/crdt";
import { PROFILES, createSimulatedPerson } from "@manent/demo";
import { blockText, blocksOf } from "@manent/schema";
import { createMemoryStore } from "@manent/sync-client";
import type { Clock } from "@manent/sync-client";
import { createBot } from "@manent/testkit";
import type { Page } from "@playwright/test";
import { documentOfPages } from "../../corpus/documents.ts";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { longFrames, startBenchDemo } from "../driver.ts";
import {
  regionsIn,
  seededRandom,
  shareRoles,
  until,
  untilHandleSynced,
  waitForServer,
  watchSocketBytes,
} from "../people.ts";
import {
  caretAt,
  editorHook,
  openScript,
  scriptBlocks,
  settled,
} from "../typing/run-typing.ts";

const PAGE_KEYS = { quick: 40, standard: 2_000, full: 2_000 } as const;
const REMOTE_OPS = { quick: 50, standard: 20_000, full: 20_000 } as const;
const BURST = 20;
const CONVERGE_TIMEOUT_MS = 180_000;
const TYPED = "offline line ";

interface Scheduled {
  at: number;
  seq: number;
  fn: () => void;
  cancelled: boolean;
}

/** A clock whose `advance` pops scheduled timers in order immediately, compressing hours into seconds. */
function createCompressedClock(startMs: number): {
  clock: Clock;
  step(): boolean;
} {
  let nowMs = startMs;
  let seq = 0;
  const queue: Scheduled[] = [];
  return {
    clock: {
      now: () => nowMs,
      schedule(fn, delayMs) {
        const entry: Scheduled = {
          at: nowMs + Math.max(0, delayMs),
          seq: ++seq,
          fn,
          cancelled: false,
        };
        queue.push(entry);
        return () => {
          entry.cancelled = true;
        };
      },
    },
    step() {
      let best = -1;
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i]!;
        if (item.cancelled) continue;
        if (
          best === -1 ||
          item.at < queue[best]!.at ||
          (item.at === queue[best]!.at && item.seq < queue[best]!.seq)
        )
          best = i;
      }
      if (best === -1) return false;
      const [next] = queue.splice(best, 1);
      nowMs = next!.at;
      next!.fn();
      return true;
    },
  };
}

/** Throws naming the first marker absent from both the converged script text and Recovered text. */
export function assertMarkersKept(
  markers: readonly string[],
  scriptText: string,
  recoveredTexts: readonly string[],
): void {
  const recovered = recoveredTexts.join("\n");
  for (const marker of markers) {
    if (!scriptText.includes(marker) && !recovered.includes(marker))
      throw new Error(
        `a typed marker is in neither the script nor Recovered text: ${marker}`,
      );
  }
}

/** Types `total` keystrokes offline at full speed in bursts of BURST, each starting with a marker. */
async function typeOfflineBursts(
  page: Page,
  blockId: string,
  total: number,
): Promise<string[]> {
  await caretAt(page, blockId, "end");
  const markers: string[] = [];
  let burst = 0;
  for (let i = 0; i < total; i++) {
    if (i % BURST === 0) {
      burst += 1;
      const marker = `⟦dana:${burst}⟧`;
      markers.push(marker);
      await page.keyboard.insertText(marker);
    }
    const ch = TYPED[i % TYPED.length]!;
    await page.keyboard.press(ch === " " ? "Space" : ch);
  }
  await settled(page);
  return markers;
}

function docLines(doc: Parameters<typeof scriptBody>[0]): string[] {
  return blocksOf(scriptBody(doc).materialize()).map(blockText);
}

async function pageLines(page: Page): Promise<string[]> {
  const found = await editorHook(page, ["blocks"]);
  if (!Array.isArray(found)) throw new TypeError("the blocks are not a list");
  return found.map((block: unknown) => {
    const text: unknown = Reflect.get(Object(block), "text");
    if (typeof text !== "string")
      throw new TypeError("a block needs string text");
    return text;
  });
}

/** Offline merge scenario for screenplay or manuscript documents of `pages` pages. */
export function mergeScenario(options: {
  id: string;
  workload: Scenario["workload"];
  format: "screenplay" | "manuscript";
  pages: number;
}): Scenario {
  const { id, workload, format, pages } = options;
  return {
    id,
    workload,
    processes: 5,
    async run(): Promise<Measurement[]> {
      const mode = benchMode();
      const d = documentOfPages({ format, pages, seed: 1, sections: "even" });
      const demo = await startBenchDemo();
      try {
        const p = await demo.openPage({ userId: "dana" });
        try {
          const docId = await openScript(p.page, format, d.doc, d.blocks);
          await waitForServer(demo, {
            userId: "dana",
            docId,
            blocks: d.blocks,
          });
          await shareRoles(demo, docId, [
            { userId: "sam", role: "edit", capabilities: [] },
          ]);
          const blocks = await scriptBlocks(p.page);
          const element = format === "manuscript" ? "body" : "action";
          const pageBlock =
            blocks.find(
              (b, i) =>
                i >= Math.floor(blocks.length * 0.05) && b.type === element,
            ) ?? blocks[0]!;
          const [remoteRegion] = regionsIn(blocks, 0.3, 0.9, 1);

          const samStore = createMemoryStore("sam");
          const samBot = createBot({
            server: { url: demo.url },
            userId: "sam",
            token: await demo.token("sam"),
            store: samStore,
          });
          try {
            const samHandle = await samBot.open(docId);
            await untilHandleSynced(samHandle);

            await p.page.context().setOffline(true);
            samBot.client.setOnline(false);

            const pageMarkers = await typeOfflineBursts(
              p.page,
              pageBlock.id,
              PAGE_KEYS[mode],
            );

            const compressed = createCompressedClock(Date.now());
            const samPerson = createSimulatedPerson({
              handle: samHandle,
              client: { setOnline() {} },
              profile: PROFILES.extreme,
              clock: compressed.clock,
              random: seededRandom(500),
              region: remoteRegion!,
              markers: true,
            });
            samPerson.start();
            const targetOps = REMOTE_OPS[mode];
            while (samPerson.events.length < targetOps && compressed.step()) {}
            await samPerson.stop();

            const remoteMarkers = samPerson.events.flatMap((e) =>
              e.marker === null ? [] : [e.marker],
            );

            const socketBytes = await watchSocketBytes(p.cdp);
            const frames = await longFrames(p);
            const beforeBytes = socketBytes();
            await frames.start();
            const reconnectedAt = performance.now();

            await p.page.context().setOffline(false);
            samBot.client.setOnline(true);

            let samText = "";
            await until(
              async () => {
                if (
                  !samHandle.status.get().synced ||
                  samHandle.status.get().waiting > 0
                )
                  return false;
                samText = docLines(samHandle.doc()).join("\n");
                const browserText = (await pageLines(p.page)).join("\n");
                return samText === browserText;
              },
              CONVERGE_TIMEOUT_MS,
              "the browser and remote writer did not converge after reconnecting",
            );

            const convergeMs = performance.now() - reconnectedAt;
            const durations = await frames.stop();
            const afterBytes = socketBytes();
            const longestTaskMs =
              durations.length === 0 ? 0 : Math.max(...durations);
            const bytesExchanged =
              afterBytes.sent -
              beforeBytes.sent +
              (afterBytes.received - beforeBytes.received);
            const docBytesAfter = measureDoc(samHandle.doc()).liveBytes;

            const recovered = (await samStore.recovered(docId)).map(
              (item) => item.text,
            );
            assertMarkersKept(
              [...pageMarkers, ...remoteMarkers],
              samText,
              recovered,
            );

            return [
              measurement("converge_ms", "ms", [convergeMs]),
              measurement("longest_task_ms", "ms", [longestTaskMs]),
              measurement("bytes_exchanged", "bytes", [bytesExchanged]),
              measurement("doc_bytes_after", "bytes", [docBytesAfter]),
              inputBlocks(d.blocks),
            ];
          } finally {
            await samBot.close();
          }
        } finally {
          await p.close();
        }
      } finally {
        await demo.stop();
      }
    },
  };
}
