// 50 editors of one script on the real server, each editing its own line and dropping off and back
// on, for MANENT_SOAK_MINUTES (default 2): the server's resident memory at the end against after
// the first minute, and whether every editor ends with the same text.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptBody } from "@manent/crdt";
import { createRng } from "@manent/demo";
import { blockText, blocksOf, randomBlockId } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { createBot, startTestServer } from "@manent/testkit";
import type { Bot, TestServer } from "@manent/testkit";
import { benchMode } from "../env.ts";
import type { Measurement, Scenario } from "../harness.ts";
import { delay, docIdOf, shareScript, until } from "./support.ts";

const PEOPLE = ["dana", "sam", "priya", "ana", "leo"] as const;
const BOTS_EACH = 10;
const EDIT_MS = 5_000;
const RECONNECT_MS = 1_000;
const OFFLINE_MS = 1_000;
const MINUTE_MS = 60_000;
const CONVERGE_TIMEOUT_MS = 60_000;
const SEED = 4747;
/** What the server program's command line holds, to find its process among this one's children. */
const SERVER_PROGRAM = "apps/server/src/main.ts";

const MODE_MINUTES = Object.freeze({
  quick: 1,
  standard: 10,
  full: 480,
});

/** MANENT_SOAK_MINUTES when set, else derived from the benchmark mode; must be a positive whole number. */
export function soakMinutes(
  mode: "quick" | "standard" | "full" = benchMode(),
  raw: string | undefined = process.env.MANENT_SOAK_MINUTES,
): number {
  if (raw === undefined || raw === "") return MODE_MINUTES[mode];
  const minutes = Number(raw);
  if (!Number.isInteger(minutes) || minutes < 1)
    throw new RangeError(
      `MANENT_SOAK_MINUTES must be a positive whole number, not ${raw}`,
    );
  return minutes;
}

/** The resident memory of the server program this process started, in bytes. */
function serverRssBytes(): number {
  const listed = Bun.spawnSync(["ps", "-A", "-o", "pid=,ppid=,rss=,args="]);
  for (const line of listed.stdout.toString().split("\n")) {
    const [, ppid, rssKib, ...args] = line.trim().split(/\s+/);
    if (Number(ppid) === process.pid && args.join(" ").includes(SERVER_PROGRAM))
      return Number(rssKib) * 1024;
  }
  throw new Error(`no child of ${process.pid} runs ${SERVER_PROGRAM}`);
}

interface Editor {
  bot: Bot;
  handle: DocHandle;
  /** Its own block, typed into and deleted from by turns. */
  blockId: string;
  edits: number;
}

function edit(editor: Editor): void {
  const { blockId } = editor;
  scriptBody(editor.handle.doc()).write((writer) => {
    if (editor.edits % 2 === 0) writer.insertText(blockId, 0, "x");
    else writer.deleteText(blockId, 0, 1);
  });
  editor.edits += 1;
}

function textOf(editor: Editor): string {
  return JSON.stringify(
    blocksOf(scriptBody(editor.handle.doc()).materialize()).map(blockText),
  );
}

async function openEditors(
  server: TestServer,
  docId: string,
): Promise<Editor[]> {
  const editors: Editor[] = [];
  for (const userId of PEOPLE)
    for (let n = 0; n < BOTS_EACH; n++) {
      const bot = createBot({
        server,
        userId,
        token: await server.token(userId),
      });
      const handle = await bot.open(docId);
      const blockId = randomBlockId();
      scriptBody(handle.doc()).write((writer) =>
        writer.insertBlocks(null, [
          {
            type: "block",
            attrs: { id: blockId, type: "action" },
            content: [],
          },
        ]),
      );
      editors.push({ bot, handle, blockId, edits: 0 });
    }
  return editors;
}

function converged(editors: readonly Editor[]): boolean {
  if (!editors.every(({ handle }) => handle.status.get().synced)) return false;
  return new Set(editors.map(textOf)).size === 1;
}

async function soak(
  server: TestServer,
  minutes: number,
): Promise<Measurement[]> {
  const docId = docIdOf(0);
  await shareScript(server, docId, PEOPLE.slice(1));
  const editors = await openEditors(server, docId);
  const rng = createRng(SEED);
  const timers = editors.map((editor) =>
    setTimeout(
      () => {
        edit(editor);
        timers.push(setInterval(() => edit(editor), EDIT_MS));
      },
      rng.int(0, EDIT_MS),
    ),
  );
  timers.push(
    setInterval(() => {
      const { bot } = rng.pick(editors);
      bot.client.setOnline(false);
      setTimeout(() => bot.client.setOnline(true), OFFLINE_MS);
    }, RECONNECT_MS),
  );
  try {
    const totalMs = minutes * MINUTE_MS;
    const baselineMs = Math.min(MINUTE_MS, totalMs / 2);
    await delay(baselineMs);
    const afterBaseline = serverRssBytes();
    await delay(totalMs - baselineMs);
    const atEnd = serverRssBytes();
    for (const timer of timers) clearInterval(timer);
    await delay(OFFLINE_MS);
    for (const { bot } of editors) bot.client.setOnline(true);
    try {
      await until(() => converged(editors), CONVERGE_TIMEOUT_MS);
    } catch (cause) {
      throw new Error(
        `the ${editors.length} editors did not end with the same text`,
        { cause },
      );
    }
    return [
      {
        metric: "memory_growth_percent",
        unit: "count",
        samples: [((atEnd - afterBaseline) / afterBaseline) * 100],
      },
      // a run whose editors do not converge throws above, so it is never reported as passing
      { metric: "diverged", unit: "count", samples: [0] },
    ];
  } finally {
    for (const timer of timers) clearInterval(timer);
    await Promise.all(editors.map(({ bot }) => bot.close()));
  }
}

const scenario: Scenario = {
  id: "server.soak",
  workload: null,
  processes: 1,
  async run(): Promise<Measurement[]> {
    const minutes = soakMinutes();
    const dataDir = await mkdtemp(join(tmpdir(), "manent-soak-"));
    const server = await startTestServer({ dataDir });
    try {
      return await soak(server, minutes);
    } finally {
      await server.stop();
      await rm(dataDir, { recursive: true, force: true });
    }
  },
};

export default scenario;
