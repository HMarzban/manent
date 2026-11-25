// Prompter-feed staleness inside the air window under packet loss: time from a manual Send
// (`POST /api/prompter/send`) and from a row move's acknowledgement to prompter receipt.
import { moveRows, scriptBody } from "@manent/crdt";
import { createRng } from "@manent/demo";
import { blockText, blockView, blocksOf, randomBlockId } from "@manent/schema";
import { DEFAULT_LIMITS } from "@manent/server-core";
import type { PrompterRow } from "@manent/sync-protocol";
import {
  bunSocket,
  createBot,
  createPrompterBot,
  lossySocket,
} from "@manent/testkit";
import type { Bot, PrompterBot } from "@manent/testkit";
import type { RUNDOWN_ROWS } from "../../corpus/rundown.ts";
import { benchMode } from "../../env.ts";
import type { Measurement, Scenario } from "../../harness.ts";
import { measurement, sampleMs } from "../../measure.ts";
import { OWNER, until } from "../support.ts";
import {
  replayKey,
  seedNewsRundowns,
  startW5Server,
  withTimeout,
  wrapDsmallFailure,
} from "./w5-server.ts";

type Mode = ReturnType<typeof benchMode>;

const MODES: Readonly<
  Record<
    Mode,
    { rows: (typeof RUNDOWN_ROWS)[number]; prompters: number; pairs: number }
  >
> = Object.freeze({
  quick: { rows: 20, prompters: 2, pairs: 10 },
  standard: { rows: 80, prompters: 20, pairs: 110 },
  full: { rows: 80, prompters: 20, pairs: 110 },
});

const SEED = 4747;
const LOSS_RATE = 0.02;
const LOSS_DELAY_MS = 200;
const READY_MS = 30_000;
const SETTLE_MS = 20_000;

function hasMarkerInStory(
  prompter: PrompterBot,
  storyRowId: string,
  marker: string,
): boolean {
  const blocks = prompter.prompter.stories.get().get(storyRowId);
  if (blocks === undefined) return false;
  for (let i = blocks.length - 1; i >= 0; i--)
    if (blockText(blockView(blocks[i]!)) === marker) return true;
  return false;
}

function orderMatches(
  runOrder: readonly PrompterRow[],
  movedRowId: string,
  afterRowId: string | null,
): boolean {
  const idx = runOrder.findIndex((r) => r.rowId === movedRowId);
  if (idx === -1) return false;
  if (afterRowId === null) return idx === 0;
  return idx > 0 && runOrder[idx - 1]?.rowId === afterRowId;
}

function awaitAllPrompters(
  prompters: readonly PrompterBot[],
  check: (bot: PrompterBot) => boolean,
  subscribe: (bot: PrompterBot, notify: () => void) => () => void,
  label: string,
): Promise<void> {
  if (prompters.every(check)) return Promise.resolve();
  const done = Promise.withResolvers<void>();
  const unsubs: (() => void)[] = [];
  const checkNow = (): void => {
    if (prompters.every(check)) done.resolve();
  };
  for (const bot of prompters) unsubs.push(subscribe(bot, checkNow));
  checkNow();
  return withTimeout(done.promise, SETTLE_MS, label).finally(() => {
    for (const u of unsubs) u();
  });
}

async function runStaleness(): Promise<Measurement[]> {
  const config = MODES[benchMode()];
  const viewerUsers = Array.from(
    { length: config.prompters },
    (_, i) => `w5-prompter-${i}`,
  );
  const server = await startW5Server({
    roomIdleMs: DEFAULT_LIMITS.roomIdleMs,
    maxConnections: config.prompters + 16,
  });
  const prompters: PrompterBot[] = [];
  const lossyTimers = new Set<Timer>();
  let editorBot: Bot | null = null;
  try {
    const [rundown] = seedNewsRundowns(server.storage, {
      rundownCount: 1,
      rows: config.rows,
      editorUsers: [],
      viewerUsers,
      insideAirWindow: true,
    });
    const placed = rundown!;
    const rng = createRng(SEED);
    for (let i = 0; i < config.prompters; i++) {
      const userId = viewerUsers[i]!;
      prompters.push(
        createPrompterBot({
          server,
          userId,
          token: server.token(userId),
          rundownId: placed.rundownId,
          socket: (url) =>
            lossySocket(bunSocket(url, server.url), {
              lossRate: LOSS_RATE,
              delayMs: LOSS_DELAY_MS,
              random: () => rng.next(),
              schedule: (run, ms) => {
                const timer = setTimeout(() => {
                  lossyTimers.delete(timer);
                  run();
                }, ms);
                lossyTimers.add(timer);
              },
            }),
        }),
      );
    }
    await until(
      () => prompters.every((p) => p.prompter.status.get().feed === "live"),
      READY_MS,
    );

    const ownerToken = server.token(OWNER);
    editorBot = createBot({ server, userId: OWNER, token: ownerToken });
    const rundownHandle = await editorBot.open(placed.rundownId);
    const storyDocId = placed.storyDocIds[0]!;
    const storyRowId = placed.storyRowIds[0]!;
    const storyHandle = await editorBot.open(storyDocId);
    await until(
      () =>
        rundownHandle.status.get().waiting === 0 &&
        storyHandle.status.get().waiting === 0,
      READY_MS,
    );

    const movingRowId = placed.storyRowIds[1]!;
    const anchorA = placed.storyRowIds[0]!;
    const anchorB = placed.storyRowIds[2]!;
    const samples: number[] = [];

    for (let i = 0; i < config.pairs; i++) {
      // Sample 1: manual Send inside air window -> all prompter bots receive the updated story text.
      const marker = `prompter-send-${i}`;
      const body = scriptBody(storyHandle.doc());
      const after = blocksOf(body.materialize()).at(-1)?.attrs.id ?? null;
      body.write((w) =>
        w.insertBlocks(after, [
          {
            type: "block",
            attrs: { id: randomBlockId(), type: "dialogue" },
            content: [{ type: "text", text: marker }],
          },
        ]),
      );
      await until(() => storyHandle.status.get().waiting === 0, SETTLE_MS);
      const sendMs = await sampleMs(async () => {
        const waitReceipt = awaitAllPrompters(
          prompters,
          (b) => hasMarkerInStory(b, storyRowId, marker),
          (b, notify) => b.prompter.stories.subscribe(notify),
          `prompter send ${i}`,
        );
        const res = await fetch(`${server.url}/api/prompter/send`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ownerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            docId: placed.rundownId,
            rowId: storyRowId,
            key: replayKey(0x57a1, 0, i),
          }),
        });
        if (!res.ok)
          throw new Error(`POST /api/prompter/send answered ${res.status}`);
        await waitReceipt;
      });
      samples.push(sendMs);

      // Sample 2: row move acknowledged -> all prompter bots receive the updated run order.
      const targetAnchor = i % 2 === 0 ? anchorB : anchorA;
      const waitOrder = awaitAllPrompters(
        prompters,
        (b) =>
          orderMatches(b.prompter.runOrder.get(), movingRowId, targetAnchor),
        (b, notify) => b.prompter.runOrder.subscribe(notify),
        `prompter move ${i}`,
      );
      moveRows(rundownHandle.doc(), [movingRowId], targetAnchor);
      await until(() => rundownHandle.status.get().waiting === 0, SETTLE_MS);
      const moveMs = await sampleMs(() => waitOrder);
      samples.push(moveMs);
    }

    return [measurement("staleness_ms", "ms", samples)];
  } catch (error) {
    throw wrapDsmallFailure(error);
  } finally {
    for (const timer of lossyTimers) clearTimeout(timer);
    lossyTimers.clear();
    await editorBot?.close();
    await Promise.all(prompters.map((p) => p.close()));
    await server.stop();
  }
}

const scenario: Scenario = {
  id: "prompter.staleness",
  workload: "W5",
  processes: 5,
  run: runStaleness,
};

export default scenario;
