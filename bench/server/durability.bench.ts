// The real server killed 200 times while three editors type a marker line every 5 ms: after each
// restart a reader on a fresh device looks for every marker acknowledged before the kill.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRng } from "@manent/demo";
import { blockText, blockView } from "@manent/schema";
import { createBot, startTestServer } from "@manent/testkit";
import type { Bot, TestServer } from "@manent/testkit";
import type { Measurement, Scenario } from "../harness.ts";
import { delay, docIdOf, shareScript, until } from "./support.ts";

const KILLS = 200;
const EDITORS = ["dana", "sam", "priya"] as const;
const TYPING_MS = 5;
const SEED = 4747;
const READ_TIMEOUT_MS = 30_000;

/** Every marker acknowledged before a kill that a reader on a fresh device does not find after it. */
async function lostMarkers(server: TestServer): Promise<number> {
  const docId = docIdOf(0);
  await shareScript(server, docId, EDITORS.slice(1));
  const bots: Bot[] = [];
  const timers: Timer[] = [];
  let writing = true;
  try {
    for (const userId of EDITORS) {
      const bot = createBot({
        server,
        userId,
        token: await server.token(userId),
      });
      bots.push(bot);
      const handle = await bot.open(docId);
      let typed = 0;
      timers.push(
        setInterval(() => {
          if (writing) bot.typeLine(handle, `${userId} ${typed++}`);
        }, TYPING_MS),
      );
    }
    const rng = createRng(SEED);
    const lost = new Set<string>();
    for (let round = 0; round < KILLS; round++) {
      // the kill lands at an arbitrary step of the write path
      writing = true;
      await delay(rng.int(5, 400));
      await server.kill();
      writing = false;
      const acknowledged = bots.flatMap((bot) => bot.ledger.acknowledged());
      await server.start();
      const reader = createBot({
        server,
        userId: "dana",
        token: await server.token("dana"),
      });
      const view = reader.client.view(docId);
      try {
        await until(() => view.status.get().live, READ_TIMEOUT_MS);
        const held = new Set(
          view.blocks.get().map((block) => blockText(blockView(block))),
        );
        for (const marker of acknowledged)
          if (!held.has(marker)) lost.add(marker);
      } finally {
        view.close();
        await reader.close();
      }
    }
    return lost.size;
  } finally {
    for (const timer of timers) clearInterval(timer);
    await Promise.all(bots.map((bot) => bot.close()));
  }
}

const scenario: Scenario = {
  id: "server.durability",
  workload: null,
  processes: 1,
  async run(): Promise<Measurement[]> {
    const dataDir = await mkdtemp(join(tmpdir(), "manent-durability-"));
    const server = await startTestServer({ dataDir });
    try {
      return [
        {
          metric: "acked_lost",
          unit: "count",
          samples: [await lostMarkers(server)],
        },
      ];
    } finally {
      await server.stop();
      await rm(dataDir, { recursive: true, force: true });
    }
  },
};

export default scenario;
