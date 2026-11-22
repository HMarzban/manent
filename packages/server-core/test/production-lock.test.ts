import { afterAll, expect, test } from "bun:test";
import {
  DEFAULT_LAYOUT_SETTINGS,
  engineFor,
  profileFromSettings,
} from "@manent/pagination";
import { captureAnchors, mergeAnchors } from "@manent/revisions";
import { openSqliteStorage } from "@manent/storage";
import type { PagesRequest } from "@manent/sync-protocol";
import { createTempTrees } from "@manent/testkit";
import { scriptPages } from "../src/index.ts";
import {
  KEY1,
  headingId,
  key,
  lockRequest,
  productionWorld,
  valueOf,
} from "./production-world.ts";
import type { ProductionWorld } from "./production-world.ts";
import { DOC } from "./seed.ts";

const trees = createTempTrees("manent-production-");
afterAll(() => trees.removeAll());

const pages = (
  w: ProductionWorld,
  n: number,
  op: PagesRequest["op"],
  labels: string[],
  label: string | null = null,
) =>
  w.run(
    w.service.pages("priya", { docId: DOC, key: key(n), op, labels, label }),
  );

const labelsOf = (anchors: readonly { label: string }[]): string[] =>
  anchors.map((anchor) => anchor.label);

const headings = (w: ProductionWorld) =>
  w.blocks().filter((block) => block.attrs.type === "scene_heading");

test("locking numbers every scene, records every page, freezes the layout and starts Blue", async () => {
  const w = productionWorld();
  const s = await w.run(w.service.lock("priya", lockRequest(KEY1)));
  expect(
    s.ok && [
      s.value.locked,
      s.value.sets.map((x) => [x.ordinal, x.name, x.issuedAt !== null]),
      s.value.anchors.length,
      s.value.sceneNumbers.slice(0, 2),
    ],
  ).toEqual([
    true,
    [
      [0, "White", true],
      [1, "Blue", false],
    ],
    30,
    [
      { blockId: headingId(1), num: "1", reserved: false },
      { blockId: headingId(2), num: "2", reserved: false },
    ],
  ]);
  expect(
    headings(w)
      .map((b) => b.attrs.num)
      .slice(0, 3),
  ).toEqual(["1", "2", "3"]);
  expect(w.settings()).toMatchObject({
    "script.paper": "letter",
    "script.numbering": "suffix",
    "script.colourOrder": "standard",
  });
  expect(w.versions().map((v) => [v.kind, v.name])).toContainEqual([
    "named",
    "White production draft",
  ]);
  expect([w.controlKinds(), w.file.log.get(DOC)!.locked]).toEqual([
    ["lock_anchors_changed", "layout_changed", "version_created"],
    1,
  ]);
});

test("a lock asked twice under one key locks once, also while the first is being written", async () => {
  const w = productionWorld();
  const [a, b] = await w.run(
    Promise.all([
      w.service.lock("priya", lockRequest(KEY1)),
      w.service.lock("priya", lockRequest(KEY1)),
    ]),
  );
  const whites = w
    .versions()
    .filter((v) => v.name === "White production draft");
  const ordinals = w.file.production.sets(DOC).map((set) => set.ordinal);
  expect([a.ok, b, whites.length, ordinals]).toEqual([true, a, 1, [0, 1]]);
});

test("a lock's rows, its version and its key commit together or not at all", async () => {
  const w = productionWorld();
  const { production } = w.file;
  w.storage.failNextCommit();
  const failed = await w.run(w.service.lock("priya", lockRequest(KEY1)));
  expect([
    failed.ok ? null : [failed.status, failed.body],
    production.get(DOC),
    production.anchors(DOC),
    w.versions().map((v) => v.name),
    production.request(DOC, KEY1),
  ]).toEqual([[429, { error: "busy", issued: null }], null, [], [], null]);
  const retried = await w.run(w.service.lock("priya", lockRequest(KEY1)));
  expect(
    retried.ok && [retried.value.locked, retried.value.anchors.length],
  ).toEqual([true, 30]);
});

test("someone without the lock permission is refused", async () => {
  const w = productionWorld();
  const head = w.file.log.get(DOC)!.headSeq;
  const refused = await w.run(w.service.lock("sam", lockRequest(KEY1)));
  expect([
    refused.ok ? null : [refused.status, refused.body.error],
    w.file.production.get(DOC),
    w.file.log.get(DOC)!.headSeq,
  ]).toEqual([[403, "forbidden"], null, head]);
});

test("a lock sees the edits queued before it", async () => {
  const w = productionWorld();
  w.sam.push((writer) =>
    writer.insertBlocks("action-90-8", [
      {
        type: "block",
        attrs: { id: headingId(91), type: "scene_heading" },
        content: [{ type: "text", text: "EXT. HARBOUR WALL - DAWN" }],
      },
    ]),
  );
  const s = valueOf(await w.run(w.service.lock("priya", lockRequest(KEY1))));
  const last = s.anchors.at(-1);
  expect([
    s.sceneNumbers.at(-1),
    s.anchors.length,
    [last?.label, last?.blockId],
  ]).toEqual([
    { blockId: headingId(91), num: "91", reserved: false },
    31,
    ["31", headingId(91)],
  ]);
});

test("a page range can be unlocked, locked again and renumbered", async () => {
  const w = productionWorld();
  await w.lock();
  const unlocked = valueOf(await pages(w, 2, "unlock", ["5", "6"]));
  const relocked = valueOf(await pages(w, 3, "lock", ["4A", "4B"]));
  const renumbered = valueOf(await pages(w, 4, "renumber", ["4B"], "6"));
  expect(
    [unlocked, relocked, renumbered].map((s) =>
      labelsOf(s.anchors).slice(2, 7),
    ),
  ).toEqual([
    ["3", "4", "7", "8", "9"],
    ["3", "4", "4A", "4B", "7"],
    ["3", "4", "4A", "6", "7"],
  ]);
});

test("Lock A-pages records the current A-pages at the second level", async () => {
  const w = productionWorld();
  await w.lock();
  await w.editPage(12, 60);
  const s = valueOf(await pages(w, 2, "lock_a_pages", []));
  expect([
    s.lockLevel,
    s.anchors.filter((a) => a.level === 2).map((a) => [a.label, a.source]),
  ]).toEqual([2, [["12A", "lock"]]]);
});

test("fragments are consolidated into the first", async () => {
  const w = productionWorld();
  await w.lock();
  await w.editPage(12, 1300);
  const engine = engineFor(1)!;
  const profile = profileFromSettings(engine, {
    ...DEFAULT_LAYOUT_SETTINGS,
    scenesNumbered: true,
  })!;
  const records = valueOf(w.service.state("priya", DOC)).anchors;
  const { pagination } = scriptPages(
    w.blocks(),
    new Map(),
    profile,
    records,
    engine,
  );
  const issued = mergeAnchors(
    records,
    captureAnchors(pagination, "derived_pages", 1, "issue"),
    pagination,
  );
  const head = w.file.log.get(DOC)!.headSeq;
  w.file.transaction(() =>
    w.file.production.replaceAnchors(DOC, issued, { generation: 1, seq: head }),
  );
  const s = valueOf(await pages(w, 2, "consolidate", ["12A", "12B", "12C"]));
  expect(
    s.anchors.filter((a) => a.source === "issue").map((a) => a.label),
  ).toEqual(["12A"]);
});

test("unlocking keeps a draft first and empties the page anchors only", async () => {
  const w = productionWorld();
  const locked = await w.lock();
  const head = w.file.log.get(DOC)!.headSeq;
  const settings = w.settings();
  const s = valueOf(
    await w.run(w.service.unlock("priya", { docId: DOC, key: key(2) })),
  );
  const [newest] = w.versions();
  expect([
    [newest?.kind, newest?.name, newest?.seq],
    s.anchors,
    s.locked,
    s.sets,
    s.sceneNumbers,
    w.settings(),
  ]).toEqual([
    ["named", "Before unlock", head],
    [],
    true,
    locked.sets,
    locked.sceneNumbers,
    settings,
  ]);
});

test("ending production saves a draft, clears the numbers and unfreezes the layout", async () => {
  const w = productionWorld();
  await w.lock();
  const s = valueOf(
    await w.run(w.service.end("priya", { docId: DOC, key: key(2) })),
  );
  w.sam.take();
  w.sam.set("script.paper", "a4");
  await w.run(Promise.resolve());
  const answers = w.sam
    .take()
    .flatMap((m) => (m.type === "ACK" || m.type === "ERROR" ? [m.type] : []));
  expect([
    w.versions().map((v) => v.name),
    s.locked,
    s.sets,
    headings(w).filter((b) => b.attrs.num !== null),
    w.file.log.get(DOC)!.locked,
    answers,
    w.settings()["script.paper"],
  ]).toEqual([
    ["Before end of production", "White production draft"],
    false,
    [],
    [],
    0,
    ["ACK"],
    "a4",
  ]);
});

test("a script whose production has ended is refused a second lock, on the SQLite store", async () => {
  const dir = await trees.tree({});
  const w = productionWorld((now) => openSqliteStorage({ dir, now }));
  await w.lock();
  valueOf(await w.run(w.service.end("priya", { docId: DOC, key: key(2) })));
  const ask = async (n: number) => {
    const answer = await w.run(w.service.lock("priya", lockRequest(key(n))));
    return answer.ok ? "locked" : [answer.status, answer.body.error];
  };
  expect([await ask(3), await ask(4), w.file.log.get(DOC)!.locked]).toEqual([
    [409, "already_locked"],
    [409, "already_locked"],
    0,
  ]);
  w.storage.close();
});
