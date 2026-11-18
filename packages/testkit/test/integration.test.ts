import { afterAll, afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { scriptBody } from "@manent/crdt";
import { createRng, seededIdSource } from "@manent/demo";
import type { Rng } from "@manent/demo";
import { blockText, blocksOf, randomBlockId } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { openSqliteStorage } from "@manent/storage";
import type { DocEvent, DocHandle, ViewHandle } from "@manent/sync-client";
import {
  createAckLedger,
  createBot,
  createTempTrees,
  startTestServer,
} from "../src/index.ts";
import type { Bot, TestServer } from "../src/index.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const PROJECT = "7c3f2a10-58e4-4b6d-9f21-0a8d3e6b5c47";
const FIRST_BLOCK = "first-block-0001";
const UNTIL_MS = 50_000;

const trees = createTempTrees("manent-integration-");
let server: TestServer | null = null;
let bots: Bot[] = [];

afterEach(async () => {
  await Promise.all(bots.map((bot) => bot.close()));
  bots = [];
  await server?.stop();
  server = null;
});

afterAll(() => trees.removeAll());

interface Editor {
  bot: Bot;
  h: DocHandle;
}

/** Resolves once `condition` holds, checking every 10 ms; rejects after `UNTIL_MS`. */
async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + UNTIL_MS;
  while (!condition()) {
    if (Date.now() > deadline)
      throw new Error(`the condition did not hold within ${UNTIL_MS} ms`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function block(id: string, element: string, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type: element },
    content: [{ type: "text", text }],
  };
}

function flatBlocks(h: DocHandle): BlockJSON[] {
  const sections = scriptBody(h.doc()).materialize().content ?? [];
  return sections.flatMap((section) => section.content ?? []);
}

function lines(h: DocHandle): string[] {
  return blocksOf(scriptBody(h.doc()).materialize()).map(blockText);
}

function sameText(a: DocHandle, b: DocHandle): boolean {
  return JSON.stringify(lines(a)) === JSON.stringify(lines(b));
}

function blockCount(h: DocHandle): number {
  return flatBlocks(h).length;
}

function deleteBlock(h: DocHandle, id: string): void {
  scriptBody(h.doc()).write((writer) => writer.deleteBlock(id));
}

/** `count` action blocks of `length` characters each, after the last block, in one change. */
function pasteBlocks(h: DocHandle, count: number, length: number): void {
  const last = flatBlocks(h).at(-1)?.attrs?.id ?? null;
  const pasted = Array.from({ length: count }, (_, i) =>
    block(randomBlockId(), "action", `${i} `.padEnd(length, "~")),
  );
  scriptBody(h.doc()).write((writer) => writer.insertBlocks(last, pasted));
}

function listen(h: DocHandle): DocEvent[] {
  const events: DocEvent[] = [];
  h.on((event) => events.push(event));
  return events;
}

/** Positions are fractions in [0, 1), resolved against the script as it is when the op is applied. */
type Op =
  | { kind: "type"; at: number; offset: number; text: string }
  | { kind: "insert"; at: number; block: BlockJSON }
  | { kind: "delete"; at: number }
  | { kind: "move"; at: number; to: number };

const ELEMENTS = ["scene_heading", "action", "character", "dialogue"];

function randomOps(rng: Rng, count: number): Op[] {
  const ids = seededIdSource(rng);
  return Array.from({ length: count }, (): Op => {
    const roll = rng.int(0, 9);
    const at = rng.next();
    if (roll < 5)
      return {
        kind: "type",
        at,
        offset: rng.next(),
        text: `w${rng.int(0, 99)} `,
      };
    if (roll < 8)
      return {
        kind: "insert",
        at,
        block: block(ids(), rng.pick(ELEMENTS), `line ${rng.int(0, 999)}`),
      };
    if (roll < 9) return { kind: "delete", at };
    return { kind: "move", at, to: rng.next() };
  });
}

const idOf = (b: BlockJSON): string => String(b.attrs?.id);

/** The scene at `at` among the scene headings, and the blocks left once it is taken out. */
function sceneAt(
  blocks: readonly BlockJSON[],
  at: number,
): { scene: BlockJSON[]; rest: BlockJSON[] } | null {
  const heads = blocks.flatMap((b, i) =>
    b.attrs?.type === "scene_heading" ? [i] : [],
  );
  const start = heads[Math.floor(at * heads.length)];
  if (start === undefined) return null;
  const next = heads.find((i) => i > start) ?? blocks.length;
  return {
    scene: blocks.slice(start, next),
    rest: [...blocks.slice(0, start), ...blocks.slice(next)],
  };
}

function apply(h: DocHandle, op: Op): void {
  const blocks = flatBlocks(h);
  const target = blocks[Math.floor(op.at * blocks.length)];
  if (target === undefined) return;
  scriptBody(h.doc()).write((writer) => {
    switch (op.kind) {
      case "type": {
        const length = (target.content ?? []).reduce(
          (sum, run) => sum + run.text.length,
          0,
        );
        writer.insertText(
          idOf(target),
          Math.floor(op.offset * (length + 1)),
          op.text,
        );
        return;
      }
      case "insert":
        writer.insertBlocks(idOf(target), [op.block]);
        return;
      case "delete":
        if (blocks.length > 1) writer.deleteBlock(idOf(target));
        return;
      case "move": {
        const moved = sceneAt(blocks, op.at);
        if (moved === null) return;
        const anchor =
          moved.rest[Math.floor(op.to * (moved.rest.length + 1)) - 1];
        for (const b of moved.scene) writer.deleteBlock(idOf(b));
        writer.insertBlocks(
          anchor === undefined ? null : idOf(anchor),
          moved.scene,
        );
        return;
      }
      default:
        op satisfies never;
    }
  });
}

/** An empty script on a fresh server, owned by Dana. */
async function serve(docId: string): Promise<TestServer> {
  const started = await startTestServer({ dataDir: await trees.tree({}) });
  server = started;
  await started.createDocument("dana", {
    docId,
    kind: "script",
    home: `project:${PROJECT}`,
  });
  return started;
}

/** Sam may edit `docId` and Leo may read it: written to the storage of the stopped server. */
async function share(host: TestServer, docId: string): Promise<void> {
  await host.stop();
  const storage = openSqliteStorage({
    dir: join(host.dataDir, "data"),
    now: Date.now,
  });
  storage.directory.setRole(docId, "sam", "edit", []);
  storage.directory.setRole(docId, "leo", "view", []);
  storage.close();
  await host.start();
}

async function signIn(userId: string): Promise<Bot> {
  const host = running();
  const bot = createBot({
    server: host,
    userId,
    token: await host.token(userId),
  });
  bots.push(bot);
  return bot;
}

async function editor(userId: string, docId: string): Promise<Editor> {
  const bot = await signIn(userId);
  return { bot, h: await bot.open(docId) };
}

/** Dana and Sam, both synced on a script whose one scene heading is FIRST_BLOCK. */
async function twoEditors(docId: string): Promise<[Editor, Editor]> {
  await share(await serve(docId), docId);
  const dana = await editor("dana", docId);
  scriptBody(dana.h.doc()).write((writer) =>
    writer.insertBlocks(null, [
      block(FIRST_BLOCK, "scene_heading", "INT. LIGHTHOUSE - NIGHT"),
    ]),
  );
  const sam = await editor("sam", docId);
  await until(
    () =>
      dana.h.status.get().synced &&
      sam.h.status.get().synced &&
      sameText(dana.h, sam.h),
  );
  return [dana, sam];
}

async function viewer(userId: string, docId: string): Promise<ViewHandle> {
  const handle = (await signIn(userId)).client.view(docId);
  await until(() => handle.status.get().live);
  return handle;
}

function running(): TestServer {
  if (server === null) throw new Error("no test server is running");
  return server;
}

async function health(url: string): Promise<string> {
  return fetch(`${url}/health`).then(
    async (response) => `${response.status} ${await response.text()}`,
    () => "unreachable",
  );
}

test(
  "two people edit one script and end with the same pages",
  async () => {
    const [dana, sam] = await twoEditors(DOC);
    for (let i = 0; i < 50; i++) {
      dana.bot.typeLine(dana.h, `d${i}`);
      sam.bot.typeLine(sam.h, `s${i}`);
    }
    await until(
      () =>
        dana.h.status.get().synced &&
        sam.h.status.get().synced &&
        sameText(dana.h, sam.h),
    );
    expect(
      lines(dana.h).filter((l) => l.startsWith("d") || l.startsWith("s")),
    ).toHaveLength(100);
  },
  { timeout: 60_000 },
);

test(
  "a large paste and a collaborator's typing both arrive",
  async () => {
    const [dana, sam] = await twoEditors(DOC);
    pasteBlocks(dana.h, 40_000, 120);
    for (let i = 0; i < 20; i++) sam.bot.typeLine(sam.h, `s${i}`);
    await until(
      () =>
        dana.h.status.get().synced &&
        sam.h.status.get().synced &&
        sameText(dana.h, sam.h),
    );
    expect(blockCount(sam.h)).toBeGreaterThanOrEqual(40_020);
  },
  { timeout: 60_000 },
);

test(
  "an hour offline on both sides merges on reconnect, and what could not be placed is kept",
  async () => {
    const [dana, sam] = await twoEditors(DOC);
    sam.bot.client.setOnline(false);
    sam.bot.typeInto(sam.h, FIRST_BLOCK, " sam's offline words");
    deleteBlock(dana.h, FIRST_BLOCK);
    await until(() => dana.h.status.get().synced);
    sam.bot.client.setOnline(true);
    await until(() => sam.h.status.get().synced);
    expect(sameText(dana.h, sam.h)).toBe(true);
    expect(sam.h.recovered.get().map((r) => r.text)).toEqual([
      " sam's offline words",
    ]);
  },
  { timeout: 60_000 },
);

test(
  "the server is killed and started while people type; nothing acknowledged is missing and everyone catches up",
  async () => {
    const [dana, sam] = await twoEditors(DOC);
    for (let i = 0; i < 30; i++) dana.bot.typeLine(dana.h, `d${i}`);
    await running().kill();
    for (let i = 30; i < 40; i++) dana.bot.typeLine(dana.h, `d${i}`);
    await running().start();
    // synced says Sam has nothing waiting, not that Dana's lines have reached him yet
    await until(
      () =>
        dana.h.status.get().synced &&
        sam.h.status.get().synced &&
        sameText(dana.h, sam.h),
    );
    for (const marker of dana.bot.ledger.all())
      expect(lines(sam.h)).toContain(marker);
    expect(dana.bot.ledger.acknowledged()).toEqual(dana.bot.ledger.all());
  },
  { timeout: 60_000 },
);

test(
  "a viewer's snapshot and patches always equal the script",
  async () => {
    const [dana] = await twoEditors(DOC);
    const leo = await viewer("leo", DOC);
    for (const op of randomOps(createRng(7), 200)) apply(dana.h, op);
    await until(
      () =>
        dana.h.status.get().synced &&
        JSON.stringify(leo.blocks.get()) === JSON.stringify(flatBlocks(dana.h)),
    );
  },
  { timeout: 60_000 },
);

test(
  "a setting request is answered, and a refusal costs no text",
  async () => {
    const [dana] = await twoEditors(DOC);
    const events = listen(dana.h);
    dana.bot.typeLine(dana.h, "before");
    dana.h.setSetting("script.paper", "a4");
    dana.bot.typeLine(dana.h, "after");
    await until(() => dana.h.status.get().synced);
    expect(events).toContainEqual({
      type: "setting_refused",
      key: "script.paper",
      message: "unknown_key",
    });
    expect(lines(dana.h)).toEqual(expect.arrayContaining(["before", "after"]));
  },
  { timeout: 60_000 },
);

test(
  "the ledger and the test server do what they say",
  async () => {
    const ledger = createAckLedger();
    for (const marker of ["a", "b", "c"]) ledger.typed(marker);
    ledger.acknowledgedThrough(2);
    expect([ledger.acknowledged(), ledger.all()]).toEqual([
      ["a", "b"],
      ["a", "b", "c"],
    ]);

    const started = await serve(DOC);
    const { port, url } = started;
    expect(await health(url)).toBe('200 {"ok":true}');
    await started.kill();
    expect(await health(url)).toBe("unreachable");
    await started.start();
    expect([started.port, await health(url)]).toEqual([
      port,
      '200 {"ok":true}',
    ]);
  },
  { timeout: 60_000 },
);
