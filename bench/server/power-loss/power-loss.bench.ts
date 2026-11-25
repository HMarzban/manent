// The real server's data directory copied 50 times mid-write without stopping it, modelling a
// sudden power cut: a fresh server opened on each copy must hold every acknowledged marker.
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRng } from "@manent/demo";
import { blockText, blockView } from "@manent/schema";
import { createBot, startTestServer } from "@manent/testkit";
import type { Bot, TestServer } from "@manent/testkit";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { delay, docIdOf, shareScript, until } from "../support.ts";

const CUTS_BY_MODE = { quick: 5, standard: 50, full: 50 } as const;
const EDITORS = ["dana", "sam", "priya"] as const;
const TYPING_MS = 5;
const SEED = 4747;
const READ_TIMEOUT_MS = 30_000;

/** Opens a fresh server on a snapshot directory and returns any acknowledged markers missing from it. */
async function missingFromCopy(
  copyDir: string,
  docId: string,
  acknowledged: readonly string[],
): Promise<string[]> {
  const copyServer = await startTestServer({ dataDir: copyDir });
  let reader: Bot | null = null;
  try {
    reader = createBot({
      server: copyServer,
      userId: "dana",
      token: await copyServer.token("dana"),
    });
    const view = reader.client.view(docId);
    await until(() => view.status.get().live, READ_TIMEOUT_MS);
    const held = new Set(
      view.blocks.get().map((block) => blockText(blockView(block))),
    );
    return acknowledged.filter((marker) => !held.has(marker));
  } finally {
    await reader?.close();
    await copyServer.stop();
  }
}

/** Every marker acknowledged before a live data-directory copy that a fresh server on the copy does not find. */
async function lostAcrossCuts(
  server: TestServer,
  cuts: number,
): Promise<number> {
  const docId = docIdOf(0);
  await shareScript(server, docId, EDITORS.slice(1));
  const bots: Bot[] = [];
  const timers: Timer[] = [];
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
        setInterval(
          () => bot.typeLine(handle, `${userId} ${typed++}`),
          TYPING_MS,
        ),
      );
    }
    const rng = createRng(SEED);
    const lost = new Set<string>();
    for (let round = 0; round < cuts; round++) {
      // the snapshot lands at an arbitrary step of the write path while the server keeps running
      await delay(rng.int(5, 400));
      const acknowledged = bots.flatMap((bot) => bot.ledger.acknowledged());
      const copyDir = await mkdtemp(join(tmpdir(), "manent-power-loss-copy-"));
      try {
        await cp(server.dataDir, copyDir, { recursive: true });
        for (const marker of await missingFromCopy(
          copyDir,
          docId,
          acknowledged,
        ))
          lost.add(marker);
      } finally {
        await rm(copyDir, { recursive: true, force: true });
      }
    }
    return lost.size;
  } finally {
    for (const timer of timers) clearInterval(timer);
    await Promise.all(bots.map((bot) => bot.close()));
  }
}

const scenario: Scenario = {
  id: "server.power-loss",
  workload: null,
  processes: 1,
  async run(): Promise<Measurement[]> {
    const cuts = CUTS_BY_MODE[benchMode()];
    const dataDir = await mkdtemp(join(tmpdir(), "manent-power-loss-"));
    const server = await startTestServer({ dataDir });
    try {
      return [
        {
          metric: "acked_lost",
          unit: "count",
          samples: [await lostAcrossCuts(server, cuts)],
        },
      ];
    } finally {
      await server.stop();
      await rm(dataDir, { recursive: true, force: true });
    }
  },
};

export default scenario;
