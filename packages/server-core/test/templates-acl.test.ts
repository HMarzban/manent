import { expect, test } from "bun:test";
import {
  PROJECT_RUNDOWN_SKELETON_KEY,
  PROJECT_SCRIPT_SKELETON_KEY,
  TEMPLATE_MAX_BLOCKS,
  TEMPLATE_MAX_BYTES,
  applyInspecting,
  createDoc,
  jsonMap,
  stripRundownForTemplate,
  stripScriptForTemplate,
  writeProjectKey,
  writeWorkspaceTemplate,
} from "@manent/crdt";
import type { CrdtDoc, WorkspaceTemplateEntry } from "@manent/crdt";
import { SHOW_COLUMNS } from "@manent/schema";
import { indexDocId, projectHome, workspaceHome } from "@manent/sync-protocol";
import type { DocRole } from "@manent/sync-protocol";
import { createDocumentAccess, validateIndexPush } from "../src/index.ts";
import {
  ALICE_CLIENT,
  BOB_CLIENT,
  createWorld,
  pushOf,
} from "./write-world.ts";

const WS = indexDocId("workspace", "medium");
const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";
const PROJECT_INDEX = indexDocId("project", PROJECT);
const V1 = {
  current: { protocol: 1, schema: 1, engine: 0, table: 0 },
  min: { protocol: 1, schema: 1, engine: 0, table: 0 },
};

const VALID_SCRIPT_SKELETON = stripScriptForTemplate({
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: { id: "blk-1", type: "scene_heading" },
          content: [{ type: "text", text: "INT. DESK - NIGHT" }],
        },
      ],
    },
  ],
});

const VALID_RUNDOWN_SKELETON = stripRundownForTemplate({
  rundown: {
    airDate: "2026-11-25",
    airAt: 100_000,
    windowLeadMs: 3_600_000,
    targetMs: 1_800_000,
  },
  columns: [...SHOW_COLUMNS],
  rows: [
    {
      id: "row-1",
      order: "B",
      kind: "header",
      cells: {
        segment: {
          value: "A-BLOCK",
          userId: "sam",
          setAt: 1000,
          previous: null,
        },
      },
      docId: null,
      blockId: null,
      durationMs: null,
      prompter: null,
      unnumbered: true,
    },
  ],
});

const VALID_ENTRY: WorkspaceTemplateEntry = {
  id: "tpl-show-1",
  name: "Late Desk Default",
  kind: "rundown",
  createdAt: 1000,
  createdByUserId: "sam",
  updatedAt: 1000,
  skeleton: VALID_RUNDOWN_SKELETON,
};

function capture(clientId: number, write: (doc: CrdtDoc) => void): Uint8Array {
  const doc = createDoc({ clientId });
  const before = doc.encodeStateVector();
  write(doc);
  const update = doc.diff(before);
  doc.destroy();
  return update;
}

function setupWorkspaceIndex(samRole: DocRole, danaRole: DocRole) {
  const world = createWorld();
  const documents = createDocumentAccess({
    storage: world.storage,
    versions: V1,
  });
  documents.create("dana", {
    docId: WS,
    kind: "index",
    home: workspaceHome("medium"),
  });
  world.storage.directory.setRole(WS, "sam", samRole, []);
  world.storage.directory.setRole(WS, "dana", danaRole, []);
  const home = { kind: "project" as const, id: WS };
  const file = world.storage.open(home);
  file.log.registerClients(WS, "sam", [ALICE_CLIENT]);
  file.log.registerClients(WS, "dana", [BOB_CLIENT]);
  const room = world.rooms.room(WS, home, "index");
  world.rooms.load(room);
  for (const sub of [world.subA, world.subB]) {
    const resolved = documents.resolve(sub.peer.userId, WS);
    if (!resolved.ok) throw new RangeError("expected role");
    sub.access = resolved.access;
    room.editors.set(sub.peer, sub);
  }
  return { world, room, file };
}

test("workspace templates map allows owner and edit writes and rejects comment and view with 4422", () => {
  // owner (dana) and edit (sam) succeed
  const okWorld = setupWorkspaceIndex("edit", "owner");
  okWorld.world.path.push(
    okWorld.room,
    okWorld.world.subA,
    pushOf(
      1,
      capture(ALICE_CLIENT, (doc) => writeWorkspaceTemplate(doc, VALID_ENTRY)),
    ),
  );
  okWorld.world.path.push(
    okWorld.room,
    okWorld.world.subB,
    pushOf(
      2,
      capture(BOB_CLIENT, (doc) =>
        writeWorkspaceTemplate(doc, {
          ...VALID_ENTRY,
          id: "tpl-script-1",
          kind: "script",
          skeleton: VALID_SCRIPT_SKELETON,
        }),
      ),
    ),
  );
  okWorld.world.clock.runDeferred();
  expect(okWorld.world.refusals).toEqual([]);
  expect(okWorld.file.log.get(WS)!.headSeq).toBe(2);

  // comment (sam) and view (dana) are refused at writePath admission (4403 read_only_role)
  const deniedWorld = setupWorkspaceIndex("comment", "view");
  deniedWorld.world.path.push(
    deniedWorld.room,
    deniedWorld.world.subA,
    pushOf(
      1,
      capture(ALICE_CLIENT, (doc) => writeWorkspaceTemplate(doc, VALID_ENTRY)),
    ),
  );
  deniedWorld.world.path.push(
    deniedWorld.room,
    deniedWorld.world.subB,
    pushOf(
      2,
      capture(BOB_CLIENT, (doc) => writeWorkspaceTemplate(doc, VALID_ENTRY)),
    ),
  );
  deniedWorld.world.clock.runDeferred();
  expect(deniedWorld.world.refusals).toEqual([
    {
      code: 4403,
      message: "read_only_role",
      permanent: false,
      retryAfterMs: null,
      clientSeq: null,
    },
    {
      code: 4403,
      message: "read_only_role",
      permanent: false,
      retryAfterMs: null,
      clientSeq: null,
    },
  ]);
  expect(deniedWorld.file.log.get(WS)!.headSeq).toBe(0);

  // Defense-in-depth: validateIndexPush directly rejects comment and view writes to "templates"
  const inspectDoc = createDoc({ clientId: 99 });
  const update = capture(ALICE_CLIENT, (doc) =>
    writeWorkspaceTemplate(doc, VALID_ENTRY),
  );
  const report = applyInspecting(inspectDoc, update)!;
  const wsIndex = {
    docId: WS,
    home: { kind: "project" as const, id: WS },
    doc: inspectDoc,
  };
  for (const role of ["comment", "view"] as const) {
    expect(
      validateIndexPush(report, wsIndex, { role, capabilities: [] }),
    ).toEqual([
      {
        path: "maps.templates",
        code: "not_index",
        severity: "reject",
        message: `a push wrote the templates map, which a person of role ${role} may not write`,
      },
    ]);
  }
  expect(
    validateIndexPush(report, wsIndex, { role: "edit", capabilities: [] }),
  ).toEqual([]);
  inspectDoc.destroy();
});

test("workspace templates map enforces shape, <= 128 KB byte bound and <= 500 blocks bound", () => {
  // Oversized payload (> 128 KB)
  const overBytes = setupWorkspaceIndex("edit", "owner");
  overBytes.world.path.push(
    overBytes.room,
    overBytes.world.subA,
    pushOf(
      1,
      capture(ALICE_CLIENT, (doc) =>
        jsonMap(doc, "templates").set("tpl-big", {
          ...VALID_ENTRY,
          id: "tpl-big",
          kind: "script",
          skeleton: {
            v: 1,
            kind: "script",
            blocks: [
              {
                type: "block",
                attrs: { type: "action" },
                content: [
                  { type: "text", text: "x".repeat(TEMPLATE_MAX_BYTES) },
                ],
              },
            ],
          },
        }),
      ),
    ),
  );
  overBytes.world.clock.runDeferred();
  expect(overBytes.world.refusals).toMatchObject([
    { code: 4422, message: "invalid", clientSeq: 1 },
  ]);
  expect(overBytes.file.log.get(WS)!.headSeq).toBe(0);

  // Too many blocks (501)
  const overBlocks = setupWorkspaceIndex("edit", "owner");
  const blocks = Array.from({ length: TEMPLATE_MAX_BLOCKS + 1 }, () => ({
    type: "block" as const,
    attrs: { type: "action" },
    content: [{ type: "text" as const, text: "a" }],
  }));
  overBlocks.world.path.push(
    overBlocks.room,
    overBlocks.world.subA,
    pushOf(
      1,
      capture(ALICE_CLIENT, (doc) =>
        jsonMap(doc, "templates").set("tpl-many", {
          ...VALID_ENTRY,
          id: "tpl-many",
          kind: "script",
          skeleton: { v: 1, kind: "script", blocks },
        }),
      ),
    ),
  );
  overBlocks.world.clock.runDeferred();
  expect(overBlocks.world.refusals).toMatchObject([
    { code: 4422, message: "invalid", clientSeq: 1 },
  ]);
  expect(overBlocks.file.log.get(WS)!.headSeq).toBe(0);

  // Malformed entry (mismatched key vs id)
  const badKey = setupWorkspaceIndex("edit", "owner");
  badKey.world.path.push(
    badKey.room,
    badKey.world.subA,
    pushOf(
      1,
      capture(ALICE_CLIENT, (doc) =>
        jsonMap(doc, "templates").set("wrong-key", VALID_ENTRY),
      ),
    ),
  );
  badKey.world.clock.runDeferred();
  expect(badKey.world.refusals).toMatchObject([
    { code: 4422, message: "invalid", clientSeq: 1 },
  ]);
});

test("project template map stays owners-only for project default skeletons", () => {
  const world = createWorld();
  const documents = createDocumentAccess({
    storage: world.storage,
    versions: V1,
  });
  documents.create("dana", {
    docId: WS,
    kind: "index",
    home: workspaceHome("medium"),
  });
  world.storage.directory.setRole(WS, "sam", "edit", []);
  documents.create("dana", {
    docId: PROJECT_INDEX,
    kind: "index",
    home: projectHome(PROJECT),
    workspaceId: "medium",
  });
  const home = { kind: "project" as const, id: PROJECT };
  const file = world.storage.open(home);
  file.log.registerClients(PROJECT_INDEX, "sam", [ALICE_CLIENT]);
  file.log.registerClients(PROJECT_INDEX, "dana", [BOB_CLIENT]);
  const room = world.rooms.room(PROJECT_INDEX, home, "index");
  world.rooms.load(room);
  for (const sub of [world.subA, world.subB]) {
    const resolved = documents.resolve(sub.peer.userId, PROJECT_INDEX);
    if (!resolved.ok) throw new RangeError("expected role");
    sub.access = resolved.access;
    room.editors.set(sub.peer, sub);
  }

  // Editor (sam) writing project default skeleton to "template" map is refused 4422
  world.path.push(
    room,
    world.subA,
    pushOf(
      1,
      capture(ALICE_CLIENT, (doc) =>
        writeProjectKey(
          doc,
          "template",
          PROJECT_RUNDOWN_SKELETON_KEY,
          VALID_RUNDOWN_SKELETON,
        ),
      ),
    ),
  );
  // Owner (dana) writing both project default skeletons succeeds
  world.path.push(
    room,
    world.subB,
    pushOf(
      2,
      capture(BOB_CLIENT, (doc) => {
        writeProjectKey(
          doc,
          "template",
          PROJECT_SCRIPT_SKELETON_KEY,
          VALID_SCRIPT_SKELETON,
        );
        writeProjectKey(
          doc,
          "template",
          PROJECT_RUNDOWN_SKELETON_KEY,
          VALID_RUNDOWN_SKELETON,
        );
      }),
    ),
  );
  world.clock.runDeferred();
  expect(world.refusals).toEqual([
    {
      code: 4422,
      message: "invalid",
      permanent: true,
      retryAfterMs: null,
      clientSeq: 1,
    },
  ]);
  expect([world.subA.stalled, world.subB.stalled]).toEqual([true, false]);
  expect(file.log.get(PROJECT_INDEX)!.headSeq).toBe(1);
});
