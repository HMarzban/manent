// 200 bots on fresh devices join a room on the real server holding a 120-page script, at seeded
// moments within 5 seconds, each leaving once synced: the longest any of them took from its join
// until it was synced.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEMO_USER_IDS, createRng } from "@manent/demo";
import { createBot, startTestServer } from "@manent/testkit";
import type { TestServer } from "@manent/testkit";
import type { Measurement, Scenario } from "../harness.ts";
import {
  OWNER,
  delay,
  docIdOf,
  scriptOfPages,
  shareScript,
  stateOf,
  until,
} from "./support.ts";

const BOTS = 200;
const STORM_MS = 5_000;
const SYNC_TIMEOUT_MS = 30_000;
const SEED = 4747;

/** From a bot's join on a fresh device until it is synced, in ms; it leaves before this resolves. */
async function joinTime(
  server: TestServer,
  docId: string,
  person: { userId: string; token: string },
): Promise<number> {
  const joinedAt = performance.now();
  const bot = createBot({ server, ...person });
  try {
    const handle = await bot.open(docId);
    await until(() => handle.status.get().synced, SYNC_TIMEOUT_MS);
    return performance.now() - joinedAt;
  } finally {
    await bot.close();
  }
}

/**
 * Each bot is one of the demo's six people, drawn by the seeded generator, and leaves once synced:
 * the server admits 32 connections per person, fewer than 200 for six people.
 */
async function lastSyncedMs(server: TestServer): Promise<number> {
  const docId = docIdOf(0);
  const editors = DEMO_USER_IDS.filter((userId) => userId !== OWNER);
  await shareScript(server, docId, editors, stateOf(scriptOfPages(120)));
  const people = await Promise.all(
    DEMO_USER_IDS.map(async (userId) => ({
      userId,
      token: await server.token(userId),
    })),
  );
  const rng = createRng(SEED);
  const joins = Array.from({ length: BOTS }, async () => {
    const person = rng.pick(people);
    await delay(rng.int(0, STORM_MS));
    return joinTime(server, docId, person);
  });
  const settled = await Promise.allSettled(joins);
  const times: number[] = [];
  for (const outcome of settled) {
    if (outcome.status === "rejected")
      throw new Error("a bot of the join storm was never synced", {
        cause: outcome.reason,
      });
    times.push(outcome.value);
  }
  return Math.max(...times);
}

const scenario: Scenario = {
  id: "server.join-storm",
  workload: null,
  processes: 5,
  async run(): Promise<Measurement[]> {
    const dataDir = await mkdtemp(join(tmpdir(), "manent-join-storm-"));
    const server = await startTestServer({ dataDir });
    try {
      return [
        {
          metric: "last_synced_ms",
          unit: "ms",
          samples: [await lastSyncedMs(server)],
        },
      ];
    } finally {
      await server.stop();
      await rm(dataDir, { recursive: true, force: true });
    }
  },
};

export default scenario;
