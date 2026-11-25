import { expect, test } from "bun:test";
import {
  createDoc,
  initRundown,
  insertRows,
  scriptDocFromJSON,
} from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import { createMemoryStorage } from "@manent/storage/testing";
import type { VersionSet } from "@manent/sync-protocol";
import { createHistoryService, createSyncService } from "../src/index.ts";
import type { SyncService } from "../src/index.ts";
import { fakeClock } from "../src/testing/index.ts";

const T0 = 1_811_808_000_000;
const V1: VersionSet = { protocol: 1, schema: 1, engine: 0, table: 0 };
const PROJECT = "11111111-1111-7111-8111-111111111111";
const RUNDOWN = "22222222-2222-7222-8222-222222222222";
const SCRIPT = "33333333-3333-7333-8333-333333333333";
const HOME = { kind: "project", id: PROJECT } as const;
const HOME_STR = `project:${PROJECT}`;
const ROW_1 = "row-sec-00000001";
const BLK_1 = "blk-sec-00000001";
const key = (n: number): string => n.toString(16).padStart(32, "0");

const UPLOAD_CONTENT: DocJSON = {
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: BLK_1, type: "action" },
          content: [{ type: "text", text: "Uploaded line." }],
        },
      ],
    },
  ],
};

function setupWorld() {
  const clock = fakeClock(T0);
  const storage = createMemoryStorage({ now: () => clock.clock.now() });
  let made = 0;
  const ids = (): string => `v-${String(++made).padStart(5, "0")}`;
  let sync!: SyncService;
  const history = createHistoryService({
    sync: () => sync,
    storage,
    clock: clock.clock,
    ids,
  });
  sync = createSyncService({
    storage,
    clock: clock.clock,
    defer: clock.defer,
    ids,
    versions: { current: V1, min: V1 },
    hooks: [history],
  });

  sync.access.create("sam", {
    docId: RUNDOWN,
    kind: "rundown",
    home: HOME_STR,
  });
  sync.access.create("sam", { docId: SCRIPT, kind: "script", home: HOME_STR });

  storage.directory.setRole(RUNDOWN, "sam", "owner", ["edit_rundowns"]);
  storage.directory.setRole(RUNDOWN, "dana", "edit", ["edit_rundowns"]);
  storage.directory.setRole(RUNDOWN, "priya", "edit", []);
  storage.directory.setRole(RUNDOWN, "leo", "view", []);
  storage.directory.setRole(RUNDOWN, "ana", "comment", []);

  storage.directory.setRole(SCRIPT, "sam", "owner", []);
  storage.directory.setRole(SCRIPT, "dana", "edit", []);
  storage.directory.setRole(SCRIPT, "priya", "edit", []);
  storage.directory.setRole(SCRIPT, "leo", "view", []);

  const rdDoc = createDoc({ clientId: 101 });
  initRundown(
    rdDoc,
    {
      airDate: "2026-11-25",
      airAt: T0 + 3_600_000,
      windowLeadMs: 3_600_000,
      targetMs: 1_800_000,
    },
    SHOW_COLUMNS,
  );
  insertRows(
    rdDoc,
    [{ id: ROW_1, kind: "item", docId: null, blockId: null }],
    null,
  );
  const file = storage.open(HOME);
  file.log.append({
    docId: RUNDOWN,
    generation: 1,
    userId: "sam",
    update: rdDoc.encodeState(),
    origin: "edit",
    clocks: [{ clientId: 101, clock: 1 }],
  });
  rdDoc.destroy();

  const scriptBlocks: BlockJSON[] = [
    {
      type: "block",
      attrs: { id: BLK_1, type: "scene_heading" },
      content: [{ type: "text", text: "INT. STUDIO - DAY" }],
    },
  ];
  const scDoc = scriptDocFromJSON(
    { type: "doc", content: [{ type: "section", content: scriptBlocks }] },
    { clientId: 102 },
  );
  file.log.append({
    docId: SCRIPT,
    generation: 1,
    userId: "sam",
    update: scDoc.encodeState(),
    origin: "edit",
    clocks: [{ clientId: 102, clock: 1 }],
  });
  scDoc.destroy();

  const finish = <T>(promise: Promise<T>): Promise<T> => {
    clock.runDeferred();
    return promise;
  };

  return { clock, storage, sync, history, file, finish };
}

test("edit role without edit_rundowns is forbidden on all 4 rundown history write routes but can read and write script history", async () => {
  const { history, finish } = setupWorld();
  const seeded = await finish(
    history.save("sam", {
      docId: RUNDOWN,
      key: key(1),
      kind: "saved",
    }),
  );
  expect(seeded.ok).toBe(true);
  if (!seeded.ok) throw new Error("expected seeded version");
  const versionId = seeded.value.version.id;

  // Priya has role "edit" on RUNDOWN without edit_rundowns -> all 4 write routes rejected
  expect(
    await history.save("priya", {
      docId: RUNDOWN,
      key: key(2),
      kind: "saved",
    }),
  ).toEqual({ ok: false, code: "forbidden" });

  expect(
    await history.upload("priya", {
      docId: RUNDOWN,
      version: {
        id: "dev-upload-1",
        kind: "saved",
        name: null,
        deviceId: "dev-1",
        content: UPLOAD_CONTENT,
        schemaVersion: 1,
      },
    }),
  ).toEqual({ ok: false, code: "forbidden" });

  expect(
    await history.restore("priya", {
      docId: RUNDOWN,
      key: key(3),
      versionId,
      scope: { kind: "script" },
      clientId: null,
    }),
  ).toEqual({ ok: false, code: "forbidden" });

  expect(
    await history.name("priya", {
      docId: RUNDOWN,
      key: key(4),
      name: "Lock",
      fromVersionId: null,
    }),
  ).toEqual({ ok: false, code: "forbidden" });

  expect(
    await history.name("priya", {
      docId: RUNDOWN,
      key: key(5),
      name: "From seed",
      fromVersionId: versionId,
    }),
  ).toEqual({ ok: false, code: "forbidden" });

  // Priya can still read rundown history
  const listed = await history.list("priya", RUNDOWN, null, 20);
  expect(listed.ok).toBe(true);
  if (listed.ok) expect(listed.value.versions).toHaveLength(1);

  // View and comment roles are also forbidden on writes and allowed on reads
  for (const userId of ["leo", "ana"] as const) {
    expect(
      await history.save(userId, {
        docId: RUNDOWN,
        key: key(10),
        kind: "saved",
      }),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await history.name(userId, {
        docId: RUNDOWN,
        key: key(11),
        name: "Blocked",
        fromVersionId: null,
      }),
    ).toEqual({ ok: false, code: "forbidden" });
    expect((await history.list(userId, RUNDOWN, null, 20)).ok).toBe(true);
  }

  // Dana (edit + edit_rundowns) can save and name rundown versions
  expect(
    (
      await finish(
        history.save("dana", {
          docId: RUNDOWN,
          key: key(20),
          kind: "saved",
        }),
      )
    ).ok,
  ).toBe(true);
  expect(
    (
      await finish(
        history.name("dana", {
          docId: RUNDOWN,
          key: key(21),
          name: "Rehearsal",
          fromVersionId: null,
        }),
      )
    ).ok,
  ).toBe(true);

  // Priya (edit without edit_rundowns) can still write script history
  expect(
    (
      await finish(
        history.save("priya", {
          docId: SCRIPT,
          key: key(30),
          kind: "saved",
        }),
      )
    ).ok,
  ).toBe(true);
});

test("all 4 history write routes re-check authorization inside inChain after revocation while queued", async () => {
  const { clock, storage, history, file, finish } = setupWorld();

  const scSeed = await finish(
    history.save("sam", {
      docId: SCRIPT,
      key: key(100),
      kind: "saved",
    }),
  );
  expect(scSeed.ok).toBe(true);
  if (!scSeed.ok) throw new Error("expected script seed");
  const scriptVersionId = scSeed.value.version.id;

  // Sam's restore holds inChain(SCRIPT) until writePath commits on runDeferred
  const blockingScriptRestore = history.restore("sam", {
    docId: SCRIPT,
    key: key(101),
    versionId: scriptVersionId,
    scope: { kind: "script" },
    clientId: null,
  });

  // Queue all 4 write routes by dana while dana still holds edit access on SCRIPT
  const queuedSave = history.save("dana", {
    docId: SCRIPT,
    key: key(102),
    kind: "saved",
  });
  const queuedName = history.name("dana", {
    docId: SCRIPT,
    key: key(103),
    name: "Late draft",
    fromVersionId: null,
  });
  const queuedUpload = history.upload("dana", {
    docId: SCRIPT,
    version: {
      id: "queued-upload-1",
      kind: "saved",
      name: null,
      deviceId: "dev-1",
      content: UPLOAD_CONTENT,
      schemaVersion: 1,
    },
  });
  const queuedRestore = history.restore("dana", {
    docId: SCRIPT,
    key: key(104),
    versionId: scriptVersionId,
    scope: { kind: "script" },
    clientId: null,
  });

  // Revoke dana's edit role BEFORE the in-flight restore completes and releases the chain
  storage.directory.setRole(SCRIPT, "dana", "view", []);

  for (let i = 0; i < 6; i++) {
    clock.runDeferred();
    await new Promise((resolve) => setImmediate(resolve));
  }

  expect((await blockingScriptRestore).ok).toBe(true);
  expect(await queuedSave).toEqual({ ok: false, code: "forbidden" });
  expect(await queuedName).toEqual({ ok: false, code: "forbidden" });
  expect(await queuedUpload).toEqual({ ok: false, code: "forbidden" });
  expect(await queuedRestore).toEqual({ ok: false, code: "forbidden" });
  expect(
    file.history
      .page(SCRIPT, null, 20)
      .filter((row) => row.createdByUserId === "dana"),
  ).toEqual([]);
});

test("revoking edit_rundowns while a rundown history write is queued inside inChain rejects all 4 routes", async () => {
  const { clock, storage, history, file, finish } = setupWorld();
  const rdSeed = await finish(
    history.save("sam", {
      docId: RUNDOWN,
      key: key(200),
      kind: "saved",
    }),
  );
  expect(rdSeed.ok).toBe(true);
  if (!rdSeed.ok) throw new Error("expected rundown seed");
  const rundownVersionId = rdSeed.value.version.id;

  // Sam's restore holds inChain(RUNDOWN) until deferred flush
  const blockingRestore = history.restore("sam", {
    docId: RUNDOWN,
    key: key(201),
    versionId: rundownVersionId,
    scope: { kind: "script" },
    clientId: null,
  });

  // Dana currently has edit + edit_rundowns; queue all 4 write routes behind sam
  const queuedSave = history.save("dana", {
    docId: RUNDOWN,
    key: key(202),
    kind: "saved",
  });
  const queuedName = history.name("dana", {
    docId: RUNDOWN,
    key: key(203),
    name: "Broadcast lock",
    fromVersionId: null,
  });
  const queuedUpload = history.upload("dana", {
    docId: RUNDOWN,
    version: {
      id: "queued-rd-upload",
      kind: "saved",
      name: null,
      deviceId: "dev-1",
      content: UPLOAD_CONTENT,
      schemaVersion: 1,
    },
  });
  const queuedRestore = history.restore("dana", {
    docId: RUNDOWN,
    key: key(204),
    versionId: rundownVersionId,
    scope: { kind: "script" },
    clientId: null,
  });

  // Strip edit_rundowns from dana while keeping role "edit"
  storage.directory.setRole(RUNDOWN, "dana", "edit", []);

  for (let i = 0; i < 6; i++) {
    clock.runDeferred();
    await new Promise((resolve) => setImmediate(resolve));
  }

  await blockingRestore;
  expect(await queuedSave).toEqual({ ok: false, code: "forbidden" });
  expect(await queuedName).toEqual({ ok: false, code: "forbidden" });
  expect(await queuedUpload).toEqual({ ok: false, code: "forbidden" });
  expect(await queuedRestore).toEqual({ ok: false, code: "forbidden" });
  expect(
    file.history
      .page(RUNDOWN, null, 20)
      .filter((row) => row.createdByUserId === "dana"),
  ).toEqual([]);
});
