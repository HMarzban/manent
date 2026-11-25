// Typing in a 120-page script beside 10 viewer bots: alone, with 3 realistic writers, with 3
// extreme writers, and in a W3 rewrite night (1 rewrite typist and 2 realistic writers).
import { PROFILES } from "@manent/demo";
import { percentile } from "@manent/perf";
import type { Page } from "@playwright/test";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { inputBlocks, measurement } from "../../measure.ts";
import { startBenchDemo } from "../driver.ts";
import {
  openViewers,
  regionsIn,
  shareRoles,
  startPeople,
  waitForServer,
} from "../people.ts";
import type { PersonSpec } from "../people.ts";
import {
  caretAt,
  openCorpusScript,
  pressPaced,
  scriptBlocks,
} from "../typing/run-typing.ts";
import type { ScriptBlock } from "../typing/run-typing.ts";

const PAGES = 120;
const VIEWERS = 10;
const INTERVAL_MS = 60;
const KEYSTROKES = { quick: 1, standard: 200, full: 200 } as const;
const POSITIONS = [0.05, 0.5, 0.95] as const;
const TYPED = "the tide turns ";
const WRITERS = ["sam", "leo", "ana"] as const;

const keysOf = (count: number): string[] =>
  Array.from({ length: count }, (_, k) => {
    const ch = TYPED[k % TYPED.length]!;
    return ch === " " ? "Space" : ch;
  });

function typingPlaces(blocks: readonly ScriptBlock[]): string[] {
  return POSITIONS.map((at) => {
    const from = Math.floor(blocks.length * at);
    const index = blocks.findIndex((b, i) => i >= from && b.type === "action");
    if (index === -1)
      throw new RangeError(`the script has no action after block ${from}`);
    return blocks[index]!.id;
  });
}

async function typeLeg(
  page: Page,
  places: readonly string[],
  keys: readonly string[],
): Promise<number[]> {
  const samples: number[] = [];
  for (const blockId of places) {
    await caretAt(page, blockId, "end");
    samples.push(...(await pressPaced(page, keys, INTERVAL_MS)));
  }
  return samples;
}

const scenario: Scenario = {
  id: "crowd-120",
  workload: "W1",
  processes: 5,
  async run(): Promise<Measurement[]> {
    const demo = await startBenchDemo();
    try {
      const p = await demo.openPage({ userId: "dana" });
      try {
        const { d, docId } = await openCorpusScript(p.page, PAGES);
        await waitForServer(demo, {
          userId: "dana",
          docId,
          blocks: d.blocks,
        });
        await shareRoles(demo, docId, [
          ...WRITERS.map((userId) => ({
            userId,
            role: "edit" as const,
            capabilities: [] as readonly string[],
          })),
          { userId: "you", role: "view", capabilities: [] },
        ]);
        const blocks = await scriptBlocks(p.page);
        const places = typingPlaces(blocks);
        const regions = regionsIn(blocks, 0.15, 0.45, WRITERS.length);
        const keys = keysOf(KEYSTROKES[benchMode()]);
        const stopViewers = await openViewers(demo, docId, "you", VIEWERS);
        try {
          const alone = await typeLeg(p.page, places, keys);

          const leg = async (
            specs: readonly PersonSpec[],
            seed: number,
          ): Promise<number[]> => {
            const started = await startPeople({
              demo,
              docId,
              people: specs,
              seed,
            });
            try {
              return await typeLeg(p.page, places, keys);
            } finally {
              await started.stop();
            }
          };

          const realistic = await leg(
            WRITERS.map((userId, i) => ({
              userId,
              profile: PROFILES.realistic,
              region: regions[i]!,
              markers: false,
            })),
            100,
          );
          const extreme = await leg(
            WRITERS.map((userId, i) => ({
              userId,
              profile: PROFILES.extreme,
              region: regions[i]!,
              markers: false,
            })),
            200,
          );
          const rewrite = await leg(
            [
              {
                userId: "sam",
                profile: PROFILES.rewrite_typist,
                region: regions[0]!,
                markers: false,
              },
              {
                userId: "leo",
                profile: PROFILES.realistic,
                region: regions[1]!,
                markers: false,
              },
              {
                userId: "ana",
                profile: PROFILES.realistic,
                region: regions[2]!,
                markers: false,
              },
            ],
            300,
          );

          const aloneP95 = percentile(alone, 95);
          return [
            measurement("keystroke_paint_alone", "ms", alone),
            measurement("keystroke_paint_realistic", "ms", realistic),
            measurement("keystroke_paint_extreme", "ms", extreme),
            measurement("keystroke_paint_rewrite", "ms", rewrite),
            measurement("remote_extra_realistic", "ms", [
              percentile(realistic, 95) - aloneP95,
            ]),
            measurement("remote_extra_extreme", "ms", [
              percentile(extreme, 95) - aloneP95,
            ]),
            inputBlocks(d.blocks),
          ];
        } finally {
          await stopViewers();
        }
      } finally {
        await p.close();
      }
    } finally {
      await demo.stop();
    }
  },
};

export default scenario;
