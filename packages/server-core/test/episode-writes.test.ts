import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  createDoc,
  readCommentRounds,
  readEpisodes,
  renameRound,
  resolveThread,
  scriptBody,
  scriptDocFromJSON,
  startRound,
  startThread,
  writeEpisode,
  writeGroup,
  writeProjectKey,
} from "@manent/crdt";
import type { EpisodeEntry } from "@manent/crdt";
import type { ScriptFontFiles } from "@manent/formats";
import type { FontFaceKey } from "@manent/pagination";
import {
  engineFor,
  profileFromSettings,
  readLayoutSettings,
} from "@manent/pagination";
import { blocksOf, sectionize } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import {
  PROTOCOL_VERSION,
  commentsDocId,
  indexDocId,
} from "@manent/sync-protocol";
import type { VersionSet } from "@manent/sync-protocol";
import {
  DEFAULT_LIMITS,
  OWNER_CAPABILITIES,
  PRODUCT_SETTING_RULES,
  createDraftReaders,
  createDraftsService,
  createEpisodeDraftEvents,
  createEpisodeWrites,
  createRoundCountHooks,
  createSyncService,
  createWorkflow,
  readScriptFonts,
} from "../src/index.ts";
import type { Directory, SyncService } from "../src/index.ts";
import { fakeClock, fakePeer } from "../src/testing/index.ts";
import { DOC, PROJECT, appendAll } from "./seed.ts";
import { subscribe } from "./service-world.ts";

const T0 = 1_811_808_000_000;
const V1: VersionSet = {
  protocol: PROTOCOL_VERSION,
  schema: 2,
  engine: 1,
  table: 0,
};
const PROJECT_HOME = { kind: "project", id: PROJECT } as const;
const PROJECT_INDEX = indexDocId("project", PROJECT);
const OTHER_SCRIPT = "01a1e81d-c6f2-7301-a0f6-5c345eb6c799";
const EPISODE_ID = "ep-205";

const PEOPLE: Readonly<Record<string, string>> = {
  dana: "Dana Reyes",
  sam: "Sam Okafor",
  leo: "Leo Marsh",
};

const USERS: Directory = {
  user: (userId) =>
    Object.hasOwn(PEOPLE, userId) ? { userId, name: PEOPLE[userId]! } : null,
  workspacesOf: (userId) =>
    Object.hasOwn(PEOPLE, userId)
      ? [{ id: "studio", name: "Studio", seeding: null }]
      : [],
};

const keyOf = (n: number): string => n.toString(16).padStart(32, "0");

const loadFonts = (): Promise<ScriptFontFiles> =>
  readScriptFonts((key: FontFaceKey) =>
    Bun.resolveSync(
      `@fontsource/courier-prime/files/courier-prime-${key}.woff`,
      join(import.meta.dir, "..", "..", "formats", "test"),
    ),
  );

const fontsPromise = loadFonts();

function headingId(scene: number): string {
  return `a0000000-0000-4000-8000-${String(scene * 100).padStart(12, "0")}`;
}

function actionId(scene: number, line: number): string {
  return `a0000000-0000-4000-8000-${String(scene * 100 + line).padStart(12, "0")}`;
}

function makeScript(scenes: number, linesPerScene: number): DocJSON {
  const blocks = [];
  for (let s = 1; s <= scenes; s += 1) {
    blocks.push({
      type: "block" as const,
      attrs: { id: headingId(s), type: "scene_heading" as const },
      content: [{ type: "text" as const, text: `INT. HARBOUR ${s} - NIGHT` }],
    });
    for (let l = 1; l <= linesPerScene; l += 1) {
      blocks.push({
        type: "block" as const,
        attrs: { id: actionId(s, l), type: "action" as const },
        content: [
          {
            type: "text" as const,
            text: `Scene ${s} action line ${l} along the wet pier.`,
          },
        ],
      });
    }
  }
  return sectionize(blocks);
}

function expectedPages(
  doc: DocJSON,
  settings: Readonly<Record<string, unknown>>,
): number {
  const engine = engineFor(1)!;
  const profile = profileFromSettings(
    engine,
    readLayoutSettings((key) => settings[key]),
  )!;
  return engine.paginate(engine.toLayoutBlocks(blocksOf(doc)), profile).pages
    .length;
}

function episodeWorld(options?: {
  scenes?: number;
  linesPerScene?: number;
  template?: string;
  ladder?: readonly string[];
  style?: Record<string, unknown>;
}) {
  const clock = fakeClock(T0);
  const storage = createMemoryStorage({ now: clock.clock.now });
  let seqId = 0;
  let seqTok = 0;
  const ids = (): string => `id-${String(++seqId).padStart(5, "0")}`;
  const tokens = (): string => `tok_${String(++seqTok).padStart(39, "0")}`;
  const errors: unknown[] = [];

  let builtSync: SyncService | null = null;
  const sync = (): SyncService => {
    if (builtSync === null) throw new RangeError("sync not built");
    return builtSync;
  };

  const writes = createEpisodeWrites({
    storage,
    sync,
    log: (error) => errors.push(error),
  });
  const draftEvents = createEpisodeDraftEvents(writes);
  const workflow = createWorkflow({
    storage,
    sync,
    clock: clock.clock,
    ids,
    names: (userId) => PEOPLE[userId] ?? userId,
    renderPdf: async () => new Uint8Array(),
    rules: PRODUCT_SETTING_RULES,
    draftEvents,
  });
  const drafts = createDraftsService({
    storage,
    sync,
    clock: clock.clock,
    ids,
    tokens,
    names: (userId) => PEOPLE[userId] ?? userId,
    fonts: () => fontsPromise,
    users: USERS,
    draftEvents,
    log: (error) => errors.push(error),
  });
  builtSync = createSyncService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
    ids,
    versions: { current: V1, min: V1 },
    limits: {
      ...DEFAULT_LIMITS,
      framesPerSecond: 1e9,
      frameBurst: 1e9,
      bytesPerSecond: 1e12,
      byteBurst: 1e12,
    },
    registry: PRODUCT_SETTING_RULES,
    hooks: [
      workflow.history,
      workflow.production.hooks,
      createRoundCountHooks({ roundCounts: writes.roundCounts }),
      writes.hooks,
    ],
    draftReaders: createDraftReaders(storage),
  });

  const file = storage.open(PROJECT_HOME);
  const scriptJson = makeScript(
    options?.scenes ?? 6,
    options?.linesPerScene ?? 8,
  );
  storage.directory.place(DOC, PROJECT_HOME, "script", "dana");
  storage.directory.setRole(DOC, "dana", "owner", OWNER_CAPABILITIES);
  storage.directory.setRole(DOC, "sam", "edit", []);
  storage.directory.setRole(DOC, "leo", "comment", []);
  file.log.create({
    id: DOC,
    kind: "script",
    ownerUserId: null,
    schemaVersion: 2,
    engineVersion: 1,
  });
  const scriptCrdt = scriptDocFromJSON(scriptJson);
  appendAll(storage, [scriptCrdt.encodeState()], {
    docId: DOC,
    home: PROJECT_HOME,
    userId: "dana",
  });
  scriptCrdt.destroy();

  storage.directory.place(PROJECT_INDEX, PROJECT_HOME, "index", "dana");
  storage.directory.setRole(PROJECT_INDEX, "dana", "owner", OWNER_CAPABILITIES);
  storage.directory.setRole(PROJECT_INDEX, "sam", "edit", []);
  file.log.create({
    id: PROJECT_INDEX,
    kind: "index",
    ownerUserId: null,
    schemaVersion: 2,
    engineVersion: 1,
  });
  const indexCrdt = createDoc();
  writeProjectKey(
    indexCrdt,
    "template",
    "project.template",
    options?.template ?? "drama",
  );
  if (options?.ladder !== undefined)
    writeProjectKey(indexCrdt, "ladder", "project.ladder", options.ladder);
  if (options?.style !== undefined)
    writeProjectKey(indexCrdt, "style", "project.style", options.style);
  writeGroup(indexCrdt, {
    id: "grp-network",
    name: "Network",
    role: null,
    memberUserIds: ["leo"],
    watermark: false,
  });
  const initialEpisode: EpisodeEntry = {
    id: EPISODE_ID,
    seasonId: "season-2",
    number: 205,
    title: "Slack Water",
    writerUserId: "sam",
    stage: null,
    dueAt: null,
    pages: null,
    openCount: null,
    locked: false,
    docIds: { script: DOC, outline: null, roomLog: null },
  };
  writeEpisode(indexCrdt, initialEpisode);
  appendAll(storage, [indexCrdt.encodeState()], {
    docId: PROJECT_INDEX,
    home: PROJECT_HOME,
    userId: "dana",
  });
  indexCrdt.destroy();

  async function settle(): Promise<void> {
    for (let i = 0; i < 12; i += 1) {
      clock.runDeferred();
      await Promise.resolve();
    }
  }

  async function run<T>(promise: Promise<T>): Promise<T> {
    let settled = false;
    void promise.finally(() => {
      settled = true;
    });
    for (let i = 0; i < 40; i += 1) {
      if (settled) break;
      clock.runDeferred();
      await Promise.resolve();
    }
    const result = await promise;
    await settle();
    return result;
  }

  function readEpisode(): EpisodeEntry {
    const row = file.log.get(PROJECT_INDEX)!;
    const doc = createDoc();
    for (const entry of file.log.tail(PROJECT_INDEX, row.generation, 0).rows)
      doc.applyUpdate(entry.update);
    const ep = readEpisodes(doc).get(EPISODE_ID)!;
    doc.destroy();
    return ep;
  }

  return {
    clock,
    storage,
    file,
    sync: builtSync,
    history: workflow.history,
    production: workflow.production,
    drafts,
    writes,
    draftEvents,
    scriptJson,
    errors,
    settle,
    run,
    readEpisode,
  };
}

test("naming a draft writes the ladder label or draft name and page count to every member's project index", async () => {
  const w = episodeWorld();
  const sam = fakePeer({ userId: "sam", name: "Sam Okafor", versions: V1 });
  w.sync.attach(sam);
  w.sync.receive(sam, subscribe(PROJECT_INDEX, "edit", [9001]));
  sam.take();

  const named = await w.run(
    w.history.name("dana", {
      docId: DOC,
      key: keyOf(1),
      name: "Studio draft",
      fromVersionId: null,
    }),
  );
  expect(named.ok).toBe(true);
  const pages = expectedPages(w.scriptJson, {});
  expect(w.readEpisode()).toEqual({
    id: EPISODE_ID,
    seasonId: "season-2",
    number: 205,
    title: "Slack Water",
    writerUserId: "sam",
    stage: "Studio",
    dueAt: null,
    pages,
    openCount: null,
    locked: false,
    docIds: { script: DOC, outline: null, roomLog: null },
  });
  expect(
    sam
      .take()
      .some(
        (m) =>
          m.type === "SYNC" && m.docId === PROJECT_INDEX && m.step === "update",
      ),
  ).toBe(true);

  const custom = await w.run(
    w.history.name("dana", {
      docId: DOC,
      key: keyOf(2),
      name: "Director pass",
      fromVersionId: null,
    }),
  );
  expect(custom.ok).toBe(true);
  expect(w.readEpisode().stage).toBe("Director pass");

  // An explicit empty project.ladder turns off template ladder matching
  const wEmpty = episodeWorld({ ladder: [] });
  const namedEmpty = await wEmpty.run(
    wEmpty.history.name("dana", {
      docId: DOC,
      key: keyOf(25),
      name: "Studio draft",
      fromVersionId: null,
    }),
  );
  expect(namedEmpty.ok).toBe(true);
  expect(wEmpty.readEpisode().stage).toBe("Studio draft");

  // Sending a draft without groups falls back to ladder label / draft name
  const sentNoGroup = await w.run(
    w.drafts.send(
      "dana",
      {
        docId: DOC,
        key: keyOf(26),
        name: "Table draft",
        what: "whole",
        files: ["clean_pdf"],
        againstVersionId: null,
        groupIds: [],
        recipientUserIds: [],
        watermark: false,
        link: null,
      },
      w.history.keep,
    ),
  );
  expect(sentNoGroup.ok).toBe(true);
  expect(w.readEpisode().stage).toBe("Table");
  expect(w.errors).toEqual([]);
  expect(wEmpty.errors).toEqual([]);
});

test("page counts of unlocked drafts lay out with the project's followed settings", async () => {
  const style = { action: { spaceBefore: 6 } };
  const w = episodeWorld({ style });
  const unstyledPages = expectedPages(w.scriptJson, {});
  const styledPages = expectedPages(w.scriptJson, { "script.style": style });
  expect(styledPages).toBeGreaterThan(unstyledPages);

  const named = await w.run(
    w.history.name("dana", {
      docId: DOC,
      key: keyOf(3),
      name: "Writer's First",
      fromVersionId: null,
    }),
  );
  expect(named.ok).toBe(true);
  expect(w.readEpisode().stage).toBe("Writer's First");
  expect(w.readEpisode().pages).toBe(styledPages);
  expect(w.errors).toEqual([]);
});

test("sending a draft writes its round's name and addressing a comment lowers openCount", async () => {
  const w = episodeWorld();
  const sent = await w.run(
    w.drafts.send(
      "dana",
      {
        docId: DOC,
        key: keyOf(4),
        name: "Network draft",
        what: "whole",
        files: ["clean_pdf"],
        againstVersionId: null,
        groupIds: ["grp-network"],
        recipientUserIds: [],
        watermark: false,
        link: null,
      },
      w.history.keep,
    ),
  );
  expect(sent.ok).toBe(true);
  expect(w.readEpisode().stage).toBe("Network");
  expect(w.readEpisode().pages).toBe(expectedPages(w.scriptJson, {}));
  expect(w.readEpisode().openCount).toEqual({ round: "Network", open: 0 });

  const commentsId = commentsDocId(DOC);
  const commentsRow = w.file.log.get(commentsId)!;
  const comments = createDoc();
  for (const entry of w.file.log.tail(commentsId, commentsRow.generation, 0)
    .rows)
    comments.applyUpdate(entry.update);
  const roundId = Object.keys(readCommentRounds(comments))[0]!;
  comments.destroy();

  await w.run(
    w.sync.authorityWrite(commentsId, {
      userId: "leo",
      origin: "system",
      edit(doc) {
        startRound(
          doc,
          { roundId: "r-old", name: "Studio", versionId: "v-old" },
          () => T0 - 10_000,
        );
        for (let i = 1; i <= 4; i += 1) {
          startThread(
            doc,
            {
              threadId: `t-${i}`,
              itemId: `i-${i}`,
              authorUserId: "leo",
              body: `Note ${i}`,
              anchor: null,
              roundId,
              mentionedUserIds: [],
            },
            () => T0 + i,
          );
        }
        return { ok: true };
      },
      inTransaction() {},
    }),
  );
  expect(w.readEpisode().openCount).toEqual({ round: "Network", open: 4 });

  await w.run(
    w.sync.authorityWrite(commentsId, {
      userId: "dana",
      origin: "system",
      edit(doc) {
        resolveThread(
          doc,
          {
            threadId: "t-1",
            byUserId: "dana",
            outcome: "addressed",
            reason: "Cut line",
          },
          () => T0 + 100,
        );
        return { ok: true };
      },
      inTransaction() {},
    }),
  );
  expect(w.readEpisode().openCount).toEqual({ round: "Network", open: 3 });

  await w.run(
    w.sync.authorityWrite(commentsId, {
      userId: "dana",
      origin: "system",
      edit(doc) {
        renameRound(doc, roundId, "Network notes");
        return { ok: true };
      },
      inTransaction() {},
    }),
  );
  expect(w.readEpisode().openCount).toEqual({
    round: "Network notes",
    open: 3,
  });
  expect(w.errors).toEqual([]);
});

test("lock writes White and locked true, issue writes colour, recall writes active colour, and End production writes locked false", async () => {
  const w = episodeWorld();

  const locked = await w.run(
    w.production.lock("dana", {
      docId: DOC,
      key: keyOf(10),
      numbering: "suffix",
      colourOrder: "standard",
      lockedOn: "2026-11-24",
    }),
  );
  expect(locked.ok).toBe(true);
  expect(w.readEpisode().stage).toBe("White");
  expect(w.readEpisode().locked).toBe(true);
  expect(w.readEpisode().pages).toBeGreaterThan(0);

  const issued = await w.run(
    w.production.issue("dana", {
      docId: DOC,
      key: keyOf(11),
      expectedOrdinal: 1,
      issuedOn: "2026-11-24",
      what: "full",
      pages: locked.ok ? locked.value.anchors.map((a) => a.label) : [],
      recipientUserIds: ["dana"],
      memo: "Blue draft",
      files: ["pdf_clean"],
      tint: false,
    }),
  );
  expect(issued.ok).toBe(true);
  expect(w.readEpisode().stage).toBe("Blue");
  expect(w.readEpisode().locked).toBe(true);

  const sam = fakePeer({ userId: "sam", name: "Sam Okafor", versions: V1 });
  w.sync.attach(sam);
  w.sync.receive(sam, subscribe(DOC, "edit", [9002]));
  const editDoc = createDoc({ clientId: 9002 });
  const row = w.file.log.get(DOC)!;
  for (const entry of w.file.log.tail(DOC, row.generation, 0).rows)
    editDoc.applyUpdate(entry.update);
  let updateBytes: Uint8Array | null = null;
  editDoc.subscribe((u) => {
    updateBytes = u;
  });
  scriptBody(editDoc).write((writer) => {
    writer.insertText(actionId(1, 1), 0, "REVISED: ");
  });
  editDoc.destroy();
  expect(updateBytes).not.toBeNull();
  w.sync.receive(sam, {
    type: "PUSH",
    docId: DOC,
    generation: row.generation,
    clientSeq: 1,
    update: updateBytes!,
    heal: false,
  });
  await w.settle();

  // Name an interim draft before recalling Blue so the recall write is proven to move Stage back to Blue
  const interim = await w.run(
    w.history.name("dana", {
      docId: DOC,
      key: keyOf(15),
      name: "Interim pass",
      fromVersionId: null,
    }),
  );
  expect(interim.ok).toBe(true);
  expect(w.readEpisode().stage).toBe("Interim pass");

  const blueSet = issued.ok
    ? issued.value.state.sets.find((s) => s.name === "Blue")!
    : null;
  expect(blueSet).not.toBeNull();
  const recalled = await w.run(
    w.production.recall("dana", {
      docId: DOC,
      key: keyOf(12),
      setId: blueSet!.setId,
      issuedOn: "2026-11-24",
      pages: ["1"],
      memo: "Corrected p. 1",
      files: ["pdf_marked"],
      tint: false,
    }),
  );
  expect(recalled.ok).toBe(true);
  expect(w.readEpisode().stage).toBe("Blue");
  expect(w.readEpisode().locked).toBe(true);

  const unlocked = await w.run(
    w.production.unlock("dana", { docId: DOC, key: keyOf(13) }),
  );
  expect(unlocked.ok).toBe(true);
  expect(w.readEpisode().locked).toBe(true);

  const ended = await w.run(
    w.production.end("dana", { docId: DOC, key: keyOf(14) }),
  );
  expect(ended.ok).toBe(true);
  expect(w.readEpisode().locked).toBe(false);
  expect(w.readEpisode().stage).toBe("Blue");
  expect(w.errors).toEqual([]);
});

test("spoofed version ids, wrong kinds and tombstoned scripts never update an episode", async () => {
  const w = episodeWorld();
  w.storage.directory.place(OTHER_SCRIPT, PROJECT_HOME, "script", "dana");
  w.storage.directory.setRole(
    OTHER_SCRIPT,
    "dana",
    "owner",
    OWNER_CAPABILITIES,
  );
  w.file.log.create({
    id: OTHER_SCRIPT,
    kind: "script",
    ownerUserId: null,
    schemaVersion: 2,
    engineVersion: 1,
  });
  const other = scriptDocFromJSON(makeScript(1, 2));
  appendAll(w.storage, [other.encodeState()], {
    docId: OTHER_SCRIPT,
    home: PROJECT_HOME,
    userId: "dana",
  });
  other.destroy();
  const otherNamed = await w.run(
    w.history.name("dana", {
      docId: OTHER_SCRIPT,
      key: keyOf(20),
      name: "Studio",
      fromVersionId: null,
    }),
  );
  expect(otherNamed.ok).toBe(true);
  const otherVersionId = otherNamed.ok ? otherNamed.value.version.id : "";

  // Cross-document version id spoof is ignored
  w.draftEvents.named(DOC, otherVersionId, "dana");
  await w.settle();
  expect(w.readEpisode().stage).toBeNull();
  expect(w.readEpisode().pages).toBeNull();

  // Wrong version kind (sent called with a named version) is ignored
  const ownNamed = await w.run(
    w.history.name("dana", {
      docId: DOC,
      key: keyOf(21),
      name: "Table",
      fromVersionId: null,
    }),
  );
  expect(ownNamed.ok).toBe(true);
  const ownNamedId = ownNamed.ok ? ownNamed.value.version.id : "";
  expect(w.readEpisode().stage).toBe("Table");
  w.draftEvents.sent(DOC, ownNamedId, "dana");
  await w.settle();
  expect(w.readEpisode().stage).toBe("Table");

  // Unknown comments doc does nothing
  w.writes.roundCounts.counted(OTHER_SCRIPT, [
    { roundId: "r-1", name: "Fake", createdAt: T0, open: 9 },
  ]);
  await w.settle();
  expect(w.readEpisode().openCount).toBeNull();

  // Tombstoned script refuses further updates
  w.storage.directory.tombstone(DOC, "dana");
  w.draftEvents.named(DOC, ownNamedId, "dana");
  w.writes.roundCounts.counted(commentsDocId(DOC), [
    { roundId: "r-2", name: "Network", createdAt: T0, open: 2 },
  ]);
  await w.settle();
  expect(w.readEpisode().stage).toBe("Table");
  expect(w.readEpisode().openCount).toBeNull();
  expect(w.errors).toEqual([]);
});
