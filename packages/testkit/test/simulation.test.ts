import { expect, test } from "bun:test";
import {
  createDoc,
  scriptBody,
  scriptDocFromJSON,
  updateMeta,
  yXmlFragmentForBinding,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { DocFile } from "@manent/storage";
import type { RecoveredItem } from "@manent/sync-client";
import type { VersionSet } from "@manent/sync-protocol";
import { createWorld } from "../src/index.ts";
import type { SimClient, World } from "../src/index.ts";

const SEEDS = Number(process.env.MANENT_SIM_SEEDS ?? 25);
const LONG = { timeout: 120_000 };
const V1: VersionSet = { protocol: 1, schema: 1, engine: 0, table: 0 };
const V2: VersionSet = { ...V1, schema: 2 };

const forSeeds = async (
  run: (world: World) => Promise<void>,
  options: Partial<Parameters<typeof createWorld>[0]> = {},
) => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const world = await createWorld({
      seed,
      users: ["dana", "sam", "priya"],
      ...options,
    });
    await run(world);
    await world.settle();
    world.check();
  }
};

function clientOf(w: World, userId: string): SimClient {
  const found = w.clients.find((c) => c.userId === userId);
  if (found === undefined) throw new RangeError(`no client of ${userId}`);
  return found;
}

const docIdOf = (w: World): string => clientOf(w, "dana").handle.docId;

function fileOf(w: World): DocFile {
  const place = w.storage.directory.placeOf(docIdOf(w));
  if (place === null) throw new RangeError("the script is not placed");
  return w.storage.open(place.home);
}

function headOf(w: World): number {
  return fileOf(w).log.get(docIdOf(w))?.headSeq ?? 0;
}

const rowsOf = (w: World) =>
  fileOf(w).log.tail(docIdOf(w), 1, 0, { quarantine: false }).rows;

async function allOnline(w: World): Promise<void> {
  for (const c of w.clients) c.online(true);
  await w.settle();
}

function linesOf(c: SimClient): string[] {
  return docLines(c.handle.doc());
}

function docLines(doc: CrdtDoc): string[] {
  const sections = scriptBody(doc).materialize().content ?? [];
  return sections
    .flatMap((section) => section.content ?? [])
    .map((block) => (block.content ?? []).map((run) => run.text).join(""));
}

let said = 0;
/** A new block at the start of the script holding one marker of `c`'s, which is returned. */
function say(c: SimClient): string {
  said += 1;
  const marker = `[${c.device}:said-${said}]`;
  const id = `said${String(said).padStart(12, "0")}`;
  c.write((w) => {
    w.insertBlocks(null, [
      {
        type: "block",
        attrs: { id, type: "action" },
        content: [{ type: "text", text: marker }],
      },
    ]);
  });
  return marker;
}

function sayMany(c: SimClient, n: number): string[] {
  return Array.from({ length: n }, () => say(c));
}

const missingFrom = (markers: readonly string[], text: string): string[] =>
  markers.filter((m) => !text.includes(m));

type Fragment = ReturnType<typeof yXmlFragmentForBinding>;
type Node = ReturnType<Fragment["get"]>;
type ElementNode = Extract<Node, { nodeName: string }>;
type TextNode = Exclude<Node, ElementNode>;

/** A block holding `text` and an image, which the editor never writes, typed at the start of `c`'s script. */
function typeImage(c: SimClient, text: string): void {
  const scratch = yXmlFragmentForBinding(
    scriptDocFromJSON({
      type: "doc",
      content: [
        {
          type: "section",
          content: [{ type: "block", content: [{ type: "text", text: "x" }] }],
        },
      ],
    }),
  );
  const sample = scratch.get(0) as ElementNode;
  const Element = sample.constructor as new (name: string) => ElementNode;
  const Text = (sample.get(0) as ElementNode).get(0)
    .constructor as new () => TextNode;
  const block = new Element("block");
  block.setAttribute("id", "hostile00000001");
  block.setAttribute("type", "action");
  const run = new Text();
  run.insert(0, text);
  block.insert(0, [run, new Element("img")]);
  const body = yXmlFragmentForBinding(c.handle.doc());
  const first = body.get(0);
  if (first instanceof Element) return first.insert(0, [block]);
  const section = new Element("section");
  section.insert(0, [block]);
  body.insert(0, [section]);
}

const stepSome = (w: World, n: number): void => {
  for (let i = 0; i < n; i++) w.network.step();
};

/** Frames, a turn and a second of time, `rounds` times: enough for clients to notice a refusal. */
async function idle(w: World, rounds: number): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    while (w.network.step());
    await new Promise((resolve) => setImmediate(resolve));
    w.clock.advance(1_000);
  }
}

const DAY_MS = 86_400_000;

test(
  "random editing with duplicated and swapped frames converges and loses nothing",
  () =>
    forSeeds(
      async (w) => {
        for (let i = 0; i < 300; i++) {
          w.act();
          if (i % 7 === 0) await w.settle();
        }
      },
      { faults: { duplicate: 0.05 } },
    ),
  LONG,
);

test(
  "connections cut at any moment cost resends, never edits",
  () =>
    forSeeds(async (w) => {
      for (let i = 0; i < 200; i++) {
        w.act();
        if (i % 11 === 0) {
          w.network.partition(true);
          stepSome(w, 3);
          w.network.partition(false);
        }
      }
    }),
  LONG,
);

test(
  "long offline divergence: three devices write alone for a day, then meet",
  () =>
    forSeeds(async (w) => {
      for (const c of w.clients) c.online(false);
      for (let i = 0; i < 400; i++) w.act();
      w.clock.advance(86_400_000);
      for (const c of w.clients) c.online(true);
    }),
  LONG,
);

test(
  "the server crashes before a commit, after it, and at once; every acknowledged edit survives",
  () =>
    forSeeds(async (w) => {
      for (const when of ["before_commit", "after_commit", "now"] as const) {
        for (let i = 0; i < 40; i++) w.act();
        w.crashServer(when);
        stepSome(w, 50);
        w.startServer();
        await w.settle();
        w.check();
      }
    }),
  LONG,
);

test(
  "a commit that fails poisons the room, and the clients' outboxes put everything back",
  () =>
    forSeeds(async (w) => {
      for (let i = 0; i < 100; i++) {
        w.act();
        if (i === 50) w.storage.failNextCommit();
        if (i % 10 === 0) await w.settle();
      }
      await allOnline(w);
      expect(w.clients.map((c) => c.handle.status.get().synced)).toEqual(
        w.clients.map(() => true),
      );
    }),
  LONG,
);

test(
  "a damaged checkpoint and a damaged row are survived, and the row heals from a client that saw it",
  () =>
    forSeeds(async (w) => {
      for (let i = 0; i < 120; i++) {
        w.act();
        if (i % 20 === 0) await w.settle();
      }
      await allOnline(w);
      const docId = docIdOf(w);
      w.storage.corruptCheckpoint(docId);
      const from = fileOf(w).checkpoints.newest(docId, 1)?.seq ?? 0;
      const seq = lossyRowNear(w, from, Math.ceil((from + 1 + headOf(w)) / 2));
      damageCheckpointsFrom(w, seq);
      w.storage.corruptRow(docId, seq);
      w.crashServer("now");
      w.startServer();
      await w.settle();
      w.check();
      expect(rowsOf(w).map((row) => row.origin)).toContain("heal");
      const kinds = fileOf(w)
        .versions.list(docId)
        .map((v) => v.kind);
      expect(kinds).toContain("pre_heal");
    }),
  LONG,
);

/** Damages checkpoints until none newer than `seq` is left, so that a load reads row `seq`. */
function damageCheckpointsFrom(w: World, seq: number): void {
  const docId = docIdOf(w);
  const { checkpoints } = fileOf(w);
  for (
    let newest = checkpoints.newest(docId, 1);
    newest !== null && newest.seq >= seq;
    newest = checkpoints.newest(docId, 1)
  )
    w.storage.corruptCheckpoint(docId);
}

/** The script rebuilt from every row of the log but `seq`. */
function linesWithout(w: World, seq: number): string[] {
  const doc = createDoc();
  for (const row of rowsOf(w)) if (row.seq !== seq) doc.applyUpdate(row.update);
  const lines = docLines(doc);
  doc.destroy();
  return lines;
}

const sameText = (a: readonly string[], b: readonly string[]): boolean =>
  a.join("\n") === b.join("\n");

/** The row after `from` nearest `middle` whose loss changes the script: one a heal has work to do for. */
function lossyRowNear(w: World, from: number, middle: number): number {
  const text = w.serverText();
  const [row] = rowsOf(w)
    .filter((r) => r.seq > from && !sameText(linesWithout(w, r.seq), text))
    .toSorted((a, b) => Math.abs(a.seq - middle) - Math.abs(b.seq - middle));
  if (row === undefined)
    throw new RangeError("no row's loss changes the script");
  return row.seq;
}

test(
  "a damaged row that only deleted text heals too",
  () =>
    forSeeds(async (w) => {
      let seq: number | null = null;
      for (let i = 0; seq === null; i++) {
        if (i === 2_000) throw new RangeError("no row only deleted text");
        w.act();
        if (i % 20 !== 19) continue;
        await allOnline(w);
        const text = w.serverText();
        const deletions = rowsOf(w).filter(
          (row) =>
            updateMeta(row.update).length === 0 &&
            !sameText(linesWithout(w, row.seq), text),
        );
        seq = deletions.at(-1)?.seq ?? null;
      }
      const before = w.serverText();
      damageCheckpointsFrom(w, seq);
      w.storage.corruptRow(docIdOf(w), seq);
      w.crashServer("now");
      w.startServer();
      await w.settle();
      expect(w.serverText()).toEqual(before);
    }),
  LONG,
);

test(
  "after a backup is restored, nothing acknowledged is lost: clients that are ahead heal it or keep it as Recovered text",
  () =>
    forSeeds(async (w) => {
      for (let i = 0; i < 60; i++) w.act();
      await w.settle();
      const backup = w.storage.snapshot();
      for (let i = 0; i < 60; i++) w.act();
      await w.settle();
      w.crashServer("now");
      w.storage.restore(backup);
      w.startServer();
    }),
  LONG,
);

/**
 * Everyone synced; a backup; `author` writes five markers that are acknowledged; then everyone
 * leaves and the backup is put back. Returns the markers, and each client's Recovered text at the
 * backup.
 */
async function restoreAfterWords(
  w: World,
  author: SimClient,
): Promise<{ words: string[]; recovered: (readonly RecoveredItem[])[] }> {
  for (let i = 0; i < 60; i++) w.act();
  await allOnline(w);
  const backup = w.storage.snapshot();
  const recovered = w.clients.map((c) => c.handle.recovered.get());
  const words = sayMany(author, 5);
  await w.settle();
  for (const c of w.clients) c.online(false);
  w.crashServer("now");
  w.storage.restore(backup);
  w.startServer();
  return { words, recovered };
}

test(
  "after a restore, words only their own author wrote since the backup heal straight back into the script",
  () =>
    forSeeds(async (w) => {
      const dana = clientOf(w, "dana");
      const { words, recovered } = await restoreAfterWords(w, dana);
      dana.online(true);
      await w.settle();
      await allOnline(w);
      expect(missingFrom(words, w.serverText().join("\n"))).toEqual([]);
      expect(w.clients.map((c) => c.handle.recovered.get())).toEqual(recovered);
    }),
  LONG,
);

test(
  "only one author comes back after a restore: the other's acknowledged words are kept by the one who holds them",
  () =>
    forSeeds(async (w) => {
      const sam = clientOf(w, "sam");
      const { words } = await restoreAfterWords(w, sam);
      const holders = [clientOf(w, "dana"), clientOf(w, "priya")];
      for (const c of holders) c.online(true);
      await w.settle();
      const recovered = holders
        .flatMap((c) => c.handle.recovered.get())
        .filter((item) => item.cause === "rejected")
        .map((item) => item.text)
        .join("\n");
      const kept = `${w.serverText().join("\n")}\n${recovered}`;
      expect(missingFrom(words, kept)).toEqual([]);
      sam.online(true);
    }),
  LONG,
);

test(
  "the server's head is overtaken before the client that is ahead returns",
  () =>
    forSeeds(async (w) => {
      const dana = clientOf(w, "dana");
      const { words } = await restoreAfterWords(w, dana);
      const ahead = (await dana.store.load(docIdOf(w)))?.meta.lastServerSeq;
      if (ahead === undefined) throw new RangeError("dana stored nothing");
      const sam = clientOf(w, "sam");
      sam.online(true);
      await w.settle();
      while (headOf(w) <= ahead) {
        say(sam);
        await w.settle();
      }
      dana.online(true);
      await w.settle();
      expect(missingFrom(words, w.serverText().join("\n"))).toEqual([]);
    }),
  LONG,
);

test(
  "a session that expires at any step keeps the edits waiting until sign-in",
  () =>
    forSeeds(async (w) => {
      const at = (w.seed * 37) % 100;
      for (const c of w.clients) c.online(true);
      for (let i = 0; i < 100; i++) {
        w.act();
        stepSome(w, 5);
        if (i === at) w.network.refuseSessions(true);
      }
      for (const c of w.clients) c.online(true);
      await idle(w, 40);
      const sides = w.clients.map((c) => c.handle.status.get().side);
      expect(sides).toEqual(w.clients.map(() => ["sign_in"]));
      w.network.refuseSessions(false);
      for (const c of w.clients) c.client.retryNow();
    }),
  LONG,
);

test(
  "devices whose clocks are days apart order nothing by them",
  () =>
    forSeeds(async (w) => {
      for (let i = 0; i < 100; i++) {
        w.act();
        if (i % 25 === 0) await w.settle();
      }
      await allOnline(w);
      const now = w.clock.clock.now();
      for (const c of w.clients) await c.handle.saveVersion("manual");
      const times = await Promise.all(
        w.clients.map(async (c) =>
          (await c.store.versions(docIdOf(w)))
            .filter((version) => version.label === "manual")
            .map((version) => version.createdAt),
        ),
      );
      expect(times).toEqual([
        [now + 3 * DAY_MS],
        [now - 3 * DAY_MS],
        [now + 3 * DAY_MS],
      ]);
    }),
  LONG,
);

test(
  "the local store refuses writes on one device; it keeps typing, and the server still gets its edits",
  () =>
    forSeeds(async (w) => {
      for (let i = 0; i < 50; i++) w.act();
      await allOnline(w);
      const refusing = w.clients[w.seed % w.clients.length];
      if (refusing === undefined) throw new RangeError("no client");
      refusing.store.refuseWrites("quota");
      for (let i = 0; i < 50; i++) w.act();
      await allOnline(w);
      const words = sayMany(refusing, 3);
      await w.settle();
      expect(refusing.handle.status.get().saved).toBe(false);
      expect(missingFrom(words, w.serverText().join("\n"))).toEqual([]);
    }),
  LONG,
);

test(
  "a browser that cleared its storage gets the script back from the server",
  () =>
    forSeeds(async (w) => {
      for (let i = 0; i < 80; i++) w.act();
      await allOnline(w);
      const cleared = w.clients[w.seed % w.clients.length];
      if (cleared === undefined) throw new RangeError("no client");
      cleared.store.wipe();
      await cleared.reopen();
      await w.settle();
      expect(linesOf(cleared)).toEqual(w.serverText());
    }),
  LONG,
);

test(
  "a hostile push is refused, its sender keeps its text as Recovered text, and nobody else notices",
  () =>
    forSeeds(async (w) => {
      for (let i = 0; i < 50; i++) w.act();
      await allOnline(w);
      const sender = w.clients[w.seed % w.clients.length];
      if (sender === undefined) throw new RangeError("no client");
      const others = w.clients.filter((c) => c !== sender);
      const before = others.map((c) => c.handle.recovered.get());
      const text = `[${sender.device}:hostile]`;
      typeImage(sender, text);
      await w.settle();
      const kept = sender.handle.recovered
        .get()
        .filter((item) => item.text.includes(text))
        .map((item) => item.cause);
      expect(kept).toEqual(["rejected"]);
      expect(w.serverText().join("\n")).not.toContain(text);
      expect(others.map((c) => c.handle.recovered.get())).toEqual(before);
      expect(others.map((c) => c.handle.status.get().side)).toEqual(
        others.map(() => []),
      );
    }),
  LONG,
);

test(
  "a person removed, or a script deleted, while they hold unsent edits: the edits are kept and never sent",
  () =>
    forSeeds(async (w) => {
      for (let i = 0; i < 40; i++) w.act();
      await allOnline(w);
      const docId = docIdOf(w);
      const byUser = (userId: string) =>
        rowsOf(w).filter((row) => row.userId === userId).length;
      const sam = clientOf(w, "sam");
      sam.online(false);
      const removed = say(sam);
      const samRows = byUser("sam");
      w.storage.directory.removeRole(docId, "sam");
      sam.online(true);
      await w.settle();
      expect(sam.handle.status.get().side).toEqual(["access_removed"]);
      expect(linesOf(sam).join("\n")).toContain(removed);
      const priya = clientOf(w, "priya");
      priya.online(false);
      const deleted = say(priya);
      const priyaRows = byUser("priya");
      w.storage.directory.tombstone(docId, "dana");
      w.crashServer("now");
      w.startServer();
      priya.online(true);
      await w.settle();
      expect(priya.handle.status.get().side).toEqual(["deleted"]);
      expect(linesOf(priya).join("\n")).toContain(deleted);
      expect([byUser("sam"), byUser("priya")]).toEqual([samRows, priyaRows]);
      const text = w.serverText().join("\n");
      expect([text.includes(removed), text.includes(deleted)]).toEqual([
        false,
        false,
      ]);
    }),
  LONG,
);

test(
  "a client older than the script reads it; a client newer than the server writes within the server's schema",
  async () => {
    await forSeeds(
      async (w) => {
        const old = clientOf(w, "sam");
        for (let i = 0; i < 40; i++) w.act();
        const waiting = say(old);
        await allOnline(w);
        expect(old.handle.status.get().side).toEqual(["read_only"]);
        expect(linesOf(old).join("\n")).toContain(waiting);
        expect(w.serverText().join("\n")).not.toContain(waiting);
      },
      {
        serverVersions: { current: V2, min: V1 },
        clientVersions: (device) => (device === "sam-1" ? V1 : V2),
      },
    );
    await forSeeds(
      async (w) => {
        for (let i = 0; i < 40; i++) w.act();
        await allOnline(w);
        expect(w.clients.map((c) => c.handle.writeSchema.get())).toEqual([
          1, 1, 1,
        ]);
      },
      {
        serverVersions: { current: V1, min: V1 },
        clientVersions: (device) => (device === "sam-1" ? V2 : V1),
      },
    );
  },
  LONG,
);

/** The storage's backup handle and every row of the log after one run of seed 4747. */
const seededRun = async () => {
  const w = await createWorld({ seed: 4747, users: ["dana", "sam"] });
  for (let i = 0; i < 150; i++) w.act();
  await w.settle();
  return [w.storage.snapshot(), rowsOf(w)];
};

test("the same seed gives the same run, byte for byte", async () => {
  expect(await seededRun()).toEqual(await seededRun());
});
