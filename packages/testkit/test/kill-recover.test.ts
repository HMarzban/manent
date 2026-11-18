import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { scriptBody } from "@manent/crdt";
import { createRng } from "@manent/demo";
import { blockText, blockView, blocksOf } from "@manent/schema";
import { openSqliteStorage } from "@manent/storage";
import type { DocHandle } from "@manent/sync-client";
import { createBot, createTempTrees, startTestServer } from "../src/index.ts";
import type { AckLedger, Bot, TestServer } from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const PROJECT = "3b8e5d27-91c4-4f0a-a6d2-7e15c09b4f38";
const EDITORS = ["dana", "sam", "priya"] as const;
const TYPING_MS = 5;
const POLL_MS = 10;
const READ_TIMEOUT_MS = 30_000;

const trees = createTempTrees("manent-kill-");
const opened = new Set<Bot>();
const typists: Typist[] = [];
let running: TestServer | null = null;

afterAll(async () => {
  for (const typist of typists) typist.stopTyping();
  await Promise.all([...opened].map((bot) => bot.close()));
  await running?.stop();
  await trees.removeAll();
});

/** An editor typing one marker line every `TYPING_MS` until it is told to stop. */
interface Typist {
  readonly ledger: AckLedger;
  synced(): boolean;
  /** The script's lines, as one string to compare. */
  text(): string;
  stopTyping(): void;
}

/** Resolves once `condition` holds, checking every `POLL_MS`; rejects after `timeoutMs`. */
async function until(
  condition: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline)
      throw new Error(`the condition did not hold within ${timeoutMs} ms`);
    await delay(POLL_MS);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function signIn(server: TestServer, userId: string): Promise<Bot> {
  const bot = createBot({ server, userId, token: await server.token(userId) });
  opened.add(bot);
  return bot;
}

function lines(handle: DocHandle): string[] {
  return blocksOf(scriptBody(handle.doc()).materialize()).map(blockText);
}

function typeLines(bot: Bot, handle: DocHandle): Typist {
  let typed = 0;
  const timer = setInterval(
    () => bot.typeLine(handle, `${bot.userId} ${typed++}`),
    TYPING_MS,
  );
  const typist: Typist = {
    ledger: bot.ledger,
    synced: () => handle.status.get().synced,
    text: () => JSON.stringify(lines(handle)),
    stopTyping: () => clearInterval(timer),
  };
  typists.push(typist);
  return typist;
}

/** Dana creates the script and Sam and Priya may edit it (written while the server is stopped); then all three type. */
async function threeEditors(
  server: TestServer,
  docId: string,
): Promise<Typist[]> {
  await server.createDocument("dana", {
    docId,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  await server.stop();
  const storage = openSqliteStorage({
    dir: join(server.dataDir, "data"),
    now: Date.now,
  });
  for (const userId of EDITORS.slice(1))
    storage.directory.setRole(docId, userId, "edit", []);
  storage.close();
  await server.start();
  const editors = await Promise.all(
    EDITORS.map(async (userId) => {
      const bot = await signIn(server, userId);
      return { bot, handle: await bot.open(docId) };
    }),
  );
  await until(
    () => editors.every(({ handle }) => handle.status.get().synced),
    READ_TIMEOUT_MS,
  );
  return editors.map(({ bot, handle }) => typeLines(bot, handle));
}

/** A reader on a fresh device: it holds nothing of its own, so its lines are what the server's log holds. */
async function freshReader(
  server: TestServer,
  docId: string,
): Promise<{ lines: string[]; close(): Promise<void> }> {
  const bot = await signIn(server, "dana");
  const view = bot.client.view(docId);
  await until(() => view.status.get().live, READ_TIMEOUT_MS);
  return {
    lines: view.blocks.get().map((block) => blockText(blockView(block))),
    close() {
      opened.delete(bot);
      return bot.close();
    },
  };
}

function integrity(path: string): string {
  const db = new Database(path, { readonly: true });
  try {
    return db
      .query<{ integrity_check: string }, []>("PRAGMA integrity_check")
      .all()
      .map((row) => row.integrity_check)
      .join("\n");
  } finally {
    db.close();
  }
}

/** `PRAGMA integrity_check` on each file the script lives in. */
async function integrityOf(
  dataDir: string,
): Promise<Record<"control" | "project" | "checkpoints", string>> {
  const dir = join(dataDir, "data");
  return {
    control: integrity(join(dir, "control.sqlite")),
    project: integrity(join(dir, `project-${PROJECT}.sqlite`)),
    checkpoints: integrity(join(dir, `project-${PROJECT}.checkpoints.sqlite`)),
  };
}

test("the server is killed again and again under load, and no acknowledged update is ever lost", async () => {
  const kills = Number(process.env.MANENT_KILLS ?? 20);
  const rng = createRng(4747);
  const server = await startTestServer({ dataDir: await trees.tree({}) });
  running = server;
  const bots = await threeEditors(server, DOC);
  for (let round = 0; round < kills; round++) {
    // the one place a real delay is the point: the kill lands at an arbitrary step of the write path
    await delay(rng.int(5, 400));
    await server.kill();
    const acknowledged = bots.flatMap((b) => b.ledger.acknowledged());
    await server.start();
    const fresh = await freshReader(server, DOC);
    const missing = acknowledged.filter(
      (marker) => !fresh.lines.includes(marker),
    );
    expect({ round, missing }).toEqual({ round, missing: [] });
    await fresh.close();
  }
  for (const b of bots) b.stopTyping();
  await until(
    () =>
      bots.every((b) => b.synced()) &&
      new Set(bots.map((b) => b.text())).size === 1,
    30_000,
  );
  expect(new Set(bots.map((b) => b.text())).size).toBe(1);
  expect(await integrityOf(server.dataDir)).toEqual({
    control: "ok",
    project: "ok",
    checkpoints: "ok",
  });
}, 600_000);
