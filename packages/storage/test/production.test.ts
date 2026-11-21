import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import type {
  AnchorRow,
  DocFile,
  IssueRow,
  RequestRow,
  RevisionSetRow,
  SetBlockRow,
  Storage,
} from "../src/index.ts";
import { openSqliteStorage, StorageError } from "../src/index.ts";
import { createMemoryStorage } from "../src/testing/index.ts";
import { DOC, DOC2, HOME, createTempTrees, doc } from "./raw.ts";

// Every test runs on both drivers and expects each to see the same.
const trees = createTempTrees("manent storage-");
let storages: Storage[];
let files: { memory: DocFile; sqlite: DocFile };

beforeEach(async () => {
  const memory = createMemoryStorage({ now: () => 1_000 });
  const sqlite = openSqliteStorage({
    dir: await trees.tree(),
    now: () => 1_000,
  });
  storages = [memory, sqlite];
  files = { memory: memory.open(HOME), sqlite: sqlite.open(HOME) };
  for (const f of Object.values(files)) {
    f.log.create(doc(DOC));
    f.log.create(doc(DOC2));
  }
});
afterEach(() => {
  for (const storage of storages) storage.close();
});
afterAll(() => trees.removeAll());

/** What `check` returns on each driver's file. */
const onBoth = (check: (f: DocFile) => unknown) => ({
  memory: check(files.memory),
  sqlite: check(files.sqlite),
});
const both = (expected: unknown) => ({ memory: expected, sqlite: expected });

const KEY = "0123456789abcdef0123456789abcdef";

const row = (
  order: number,
  label: string,
  blockId: string,
  source = "lock",
): AnchorRow => ({
  level: 1,
  order,
  label,
  blockId,
  offset: order * 3,
  quote: `${label} begins here`,
  fallbackIds: [`${blockId}-next`, `${blockId}-after`],
  source,
});

const set = (ordinal: number): RevisionSetRow => ({
  id: `set-${ordinal}`,
  docId: DOC,
  ordinal,
  name: ordinal === 0 ? "White" : "Blue",
  colour: ordinal === 0 ? "white" : "blue",
  mark: "*",
  baselineVersionId: `v${ordinal}`,
  issuedVersionId: null,
  issuedAt: null,
  issuedOn: null,
  issuedByUserId: null,
  recalledAt: null,
  fullDraft: false,
  startedAt: 1_000 + ordinal,
  engineVersion: 1,
});

const block = (
  blockId: string,
  ranges: Pick<SetBlockRow, "inserted" | "deletedAt">,
): SetBlockRow => ({
  setId: "set-1",
  blockId,
  pageLabel: "12A",
  change: "changed",
  hash: "0a1b2c3d",
  ...ranges,
});

const issue = (id: string, issuedAt: number): IssueRow => ({
  id,
  docId: DOC,
  setId: "set-1",
  kind: id === "i3" ? "correction" : "issue",
  versionId: `v-${id}`,
  issuedByUserId: "priya",
  issuedAt,
  issuedOn: "2026-11-16",
  recipientUserIds: ["sam", "dana"],
  pages: ["3", "17A"],
  memo: "Blue revisions 16 Nov: pp. 3, 17A",
  files: ["pdf_marked", "pdf_clean"],
  tint: id !== "i3",
  what: "changed",
});

const request = (result: string): RequestRow => ({
  docId: DOC,
  key: KEY,
  userId: "priya",
  status: 200,
  result,
  createdAt: 1_000,
});

const stop = () => {
  throw new Error("the write stops here");
};

/** The code of the StorageError `fn` throws, or the name of any other error; null when it throws nothing. */
function thrownBy(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof StorageError) return error.code;
    if (error instanceof Error) return error.name;
    throw error;
  }
}

test("an anchor table replaced closes the old rows and keeps their history", () => {
  expect(
    onBoth((f) => {
      f.production.replaceAnchors(DOC, [row(1, "1", "a0"), row(2, "2", "a3")], {
        generation: 1,
        seq: 10,
      });
      f.production.replaceAnchors(
        DOC,
        [row(1, "1", "a0"), row(2, "1A", "a2", "issue"), row(3, "2", "a3")],
        { generation: 1, seq: 20 },
      );
      return {
        open: f.production
          .anchors(DOC)
          .map((r) => [r.order, r.label, r.source]),
        closed: f.production
          .anchorHistory(DOC)
          .filter((r) => r.toSeq === 20)
          .map((r) => r.label),
        anchors: f.production.anchors(DOC),
        history: f.production.anchorHistory(DOC),
      };
    }),
  ).toEqual(
    both({
      open: [
        [1, "1", "lock"],
        [2, "1A", "issue"],
        [3, "2", "lock"],
      ],
      closed: ["1", "2"],
      anchors: [
        row(1, "1", "a0"),
        row(2, "1A", "a2", "issue"),
        row(3, "2", "a3"),
      ],
      history: [
        {
          ...row(1, "1", "a0"),
          fromGeneration: 1,
          fromSeq: 10,
          toGeneration: 1,
          toSeq: 20,
        },
        {
          ...row(2, "2", "a3"),
          fromGeneration: 1,
          fromSeq: 10,
          toGeneration: 1,
          toSeq: 20,
        },
        {
          ...row(1, "1", "a0"),
          fromGeneration: 1,
          fromSeq: 20,
          toGeneration: null,
          toSeq: null,
        },
        {
          ...row(2, "1A", "a2", "issue"),
          fromGeneration: 1,
          fromSeq: 20,
          toGeneration: null,
          toSeq: null,
        },
        {
          ...row(3, "2", "a3"),
          fromGeneration: 1,
          fromSeq: 20,
          toGeneration: null,
          toSeq: null,
        },
      ],
    }),
  );
});

test("an anchor table replaced at or before the position the open one starts at is refused", () => {
  expect(
    onBoth((f) => {
      f.production.replaceAnchors(DOC, [row(1, "1", "a0")], {
        generation: 1,
        seq: 10,
      });
      f.production.replaceAnchors(DOC, [row(1, "1", "a0"), row(2, "2", "a3")], {
        generation: 1,
        seq: 20,
      });
      const replace = (generation: number, seq: number) =>
        thrownBy(() =>
          f.production.replaceAnchors(DOC, [row(1, "1", "a1")], {
            generation,
            seq,
          }),
        );
      return {
        samePosition: replace(1, 20),
        earlier: replace(1, 15),
        earlierGeneration: replace(0, 30),
        history: f.production
          .anchorHistory(DOC)
          .map((r) => [r.blockId, r.fromSeq, r.toSeq]),
      };
    }),
  ).toEqual(
    both({
      samePosition: "RangeError",
      earlier: "RangeError",
      earlierGeneration: "RangeError",
      history: [
        ["a0", 10, 20],
        ["a0", 20, null],
        ["a3", 20, null],
      ],
    }),
  );
});

// A set, an anchor table and a request, as one request writes them.
const writeRequest = (f: DocFile) => {
  f.production.addSet(set(1));
  f.production.replaceAnchors(DOC, [row(1, "1", "a0")], {
    generation: 1,
    seq: 0,
  });
  f.production.putRequest(request("{}"));
};
const storedRequest = (f: DocFile) => ({
  sets: f.production.sets(DOC).map((s) => s.id),
  anchors: f.production.anchors(DOC).map((r) => r.label),
  request: f.production.request(DOC, KEY)?.result ?? null,
});

test("production rows commit with the document's transaction or not at all", () => {
  expect(
    onBoth((f) => {
      const thrown = thrownBy(() =>
        f.transaction(() => {
          writeRequest(f);
          stop();
        }),
      );
      const rolledBack = storedRequest(f);
      f.transaction(() => writeRequest(f));
      return { thrown, rolledBack, committed: storedRequest(f) };
    }),
  ).toEqual(
    both({
      thrown: "commit_failed",
      rolledBack: { sets: [], anchors: [], request: null },
      committed: { sets: ["set-1"], anchors: ["1"], request: "{}" },
    }),
  );
});

test("a request key is stored once", () => {
  expect(
    onBoth((f) => {
      f.production.putRequest(request('{"first":true}'));
      const again = thrownBy(() =>
        f.production.putRequest({ ...request('{"second":true}'), status: 409 }),
      );
      return {
        again,
        stored: f.production.request(DOC, KEY),
        other: f.production.request(DOC2, KEY),
      };
    }),
  ).toEqual(
    both({
      again: "RangeError",
      stored: request('{"first":true}'),
      other: null,
    }),
  );
});

test("revisions keep their order and their issued blocks", () => {
  const issued = {
    issuedVersionId: "v2",
    issuedAt: 2_000,
    issuedOn: "2026-11-16",
    issuedByUserId: "priya",
    fullDraft: true,
  };
  const changed = block("b2", {
    inserted: [
      [0, 4],
      [9, 12],
    ],
    deletedAt: [6],
  });
  const whole = block("b1", { inserted: [], deletedAt: [] });
  const added = block("b3", { inserted: [], deletedAt: [] });
  expect(
    onBoth((f) => {
      f.production.addSet(set(1));
      f.production.addSet(set(0));
      f.production.updateSet("set-1", issued);
      f.production.putSetBlocks("set-0", [whole]);
      f.production.putSetBlocks("set-1", [changed, whole]);
      f.production.putSetBlocks("set-1", [added, changed]);
      return {
        sets: f.production.sets(DOC),
        blocks: f.production.setBlocks("set-1"),
        white: f.production.setBlocks("set-0"),
      };
    }),
  ).toEqual(
    both({
      sets: [set(0), { ...set(1), ...issued }],
      blocks: [changed, added],
      white: [{ ...whole, setId: "set-0" }],
    }),
  );
});

test("issues are listed newest first", () => {
  expect(
    onBoth((f) => {
      f.production.addIssue(issue("i1", 2_000));
      f.production.addIssue(issue("i2", 3_000));
      f.production.addIssue(issue("i3", 3_000));
      return {
        issues: f.production.issues(DOC),
        other: f.production.issues(DOC2),
      };
    }),
  ).toEqual(
    both({
      issues: [issue("i3", 3_000), issue("i2", 3_000), issue("i1", 2_000)],
      other: [],
    }),
  );
});

test("a production row reads back as put, and a second put replaces it", () => {
  const locked = {
    docId: DOC,
    numbering: "suffix",
    colourOrder: ["white", "blue", "pink"],
    lockedAt: 1_000,
    lockedOn: "2026-10-27",
    lockedByUserId: "priya",
    endedAt: null,
  };
  expect(
    onBoth((f) => {
      f.production.put(locked);
      const first = f.production.get(DOC);
      f.production.put({ ...locked, numbering: "prefix", endedAt: 5_000 });
      return {
        first,
        second: f.production.get(DOC),
        other: f.production.get(DOC2),
      };
    }),
  ).toEqual(
    both({
      first: locked,
      second: { ...locked, numbering: "prefix", endedAt: 5_000 },
      other: null,
    }),
  );
});

test("scene numbers are upserted by block and reserved ones stay", () => {
  expect(
    onBoth((f) => {
      f.production.putSceneNumbers(DOC, [
        { blockId: "b1", num: "1", reserved: false },
        { blockId: "b2", num: "2", reserved: false },
      ]);
      f.production.putSceneNumbers(DOC, [
        { blockId: "b2", num: "2", reserved: true },
      ]);
      return f.production.sceneNumbers(DOC);
    }),
  ).toEqual(
    both([
      { blockId: "b1", num: "1", reserved: false },
      { blockId: "b2", num: "2", reserved: true },
    ]),
  );
});

test("clearing scene numbers clears that script's alone", () => {
  expect(
    onBoth((f) => {
      f.production.putSceneNumbers(DOC, [
        { blockId: "b1", num: "1", reserved: false },
      ]);
      f.production.putSceneNumbers(DOC2, [
        { blockId: "b1", num: "4", reserved: true },
      ]);
      f.production.clearSceneNumbers(DOC);
      return {
        cleared: f.production.sceneNumbers(DOC),
        other: f.production.sceneNumbers(DOC2),
      };
    }),
  ).toEqual(
    both({ cleared: [], other: [{ blockId: "b1", num: "4", reserved: true }] }),
  );
});

test("the anchor table at a position is the one whose range holds it", () => {
  const first = [row(1, "1", "a0"), row(2, "2", "a3")];
  const second = [
    { ...row(1, "2A", "a4", "issue"), level: 2 },
    row(1, "1", "a0"),
    row(2, "1A", "a2", "issue"),
    row(3, "2", "a3"),
  ];
  expect(
    onBoth((f) => {
      f.production.replaceAnchors(DOC, first, { generation: 1, seq: 10 });
      f.production.replaceAnchors(DOC, second, { generation: 1, seq: 20 });
      const at = (generation: number, seq: number) =>
        f.production.anchorsAt(DOC, { generation, seq }).map((r) => r.label);
      return {
        before: at(1, 9),
        opened: at(1, 10),
        between: at(1, 15),
        closed: at(1, 20),
        after: at(1, 25),
        rebuilt: at(2, 3),
        other: f.production.anchorsAt(DOC2, { generation: 1, seq: 15 }),
      };
    }),
  ).toEqual(
    both({
      before: [],
      opened: ["1", "2"],
      between: ["1", "2"],
      closed: ["1", "1A", "2", "2A"],
      after: ["1", "1A", "2", "2A"],
      rebuilt: ["1", "1A", "2", "2A"],
      other: [],
    }),
  );
});

test("in production is the document row's flag", () => {
  expect(
    onBoth((f) => {
      f.transaction(() => f.production.setLocked(DOC, true));
      const locked = f.log.get(DOC)?.locked;
      const thrown = thrownBy(() =>
        f.transaction(() => {
          f.production.setLocked(DOC, false);
          stop();
        }),
      );
      return {
        locked,
        thrown,
        afterRollback: f.log.get(DOC)?.locked,
        other: f.log.get(DOC2)?.locked,
      };
    }),
  ).toEqual(
    both({ locked: 1, thrown: "commit_failed", afterRollback: 1, other: 0 }),
  );
});
