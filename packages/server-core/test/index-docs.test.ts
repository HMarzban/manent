import { beforeEach, expect, test } from "bun:test";
import { applyInspecting, createDoc, jsonMap } from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import { createMemoryStorage } from "@manent/storage/testing";
import type { MemoryStorage } from "@manent/storage/testing";
import { indexDocId, projectHome, workspaceHome } from "@manent/sync-protocol";
import {
  OWNER_CAPABILITIES,
  createDocumentAccess,
  validateIndexPush,
} from "../src/index.ts";
import type { DocumentAccess } from "../src/index.ts";
import { BLOCK, createTypist } from "./seed.ts";
import { ALICE_CLIENT, createWorld, pushOf } from "./write-world.ts";

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const DOC2 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7ce";
const DOC3 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cf";
const DOC4 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7d0";
const DOC5 = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7d1";
const PROJECT = "6f1c2d3e-4b5a-4c6d-8e7f-90a1b2c3d4e5";
const WS = indexDocId("workspace", "medium");
const V1 = {
  current: { protocol: 1, schema: 1, engine: 0, table: 0 },
  min: { protocol: 1, schema: 1, engine: 0, table: 0 },
};

let storage: MemoryStorage;
let access: DocumentAccess;
beforeEach(() => {
  storage = createMemoryStorage({ now: () => 1_000 });
  access = createDocumentAccess({ storage, versions: V1 });
});

const role = (docId: string, userId: string): string | null =>
  storage.directory.roleOf(docId, userId)?.role ?? null;

/** The name of the file a document lives in. */
function fileOf(docId: string): string | null {
  const place = storage.directory.placeOf(docId);
  return place === null ? null : `${place.home.kind}-${place.home.id}.sqlite`;
}

const indexDoc = (): CrdtDoc => createDoc({ clientId: 1 });

/** The update `write` makes on a fresh document of another client. */
function capture(write: (doc: CrdtDoc) => void): Uint8Array {
  const doc = createDoc({ clientId: 2 });
  const before = doc.encodeStateVector();
  write(doc);
  return doc.diff(before);
}

const aScriptBlock = (): Uint8Array =>
  createTypist(2).insertBlock(BLOCK, null, "Rain");

const inspect = (update: Uint8Array): TransactionReport => {
  const report = applyInspecting(indexDoc(), update);
  if (report === null) throw new RangeError("the update changed nothing");
  return report;
};

test("a person's private index is theirs alone, and a workspace index lives in its own home", () => {
  expect(
    access.create("sam", {
      docId: indexDocId("user", "sam"),
      kind: "index",
      home: "user",
    }),
  ).toMatchObject({ ok: true });
  expect(
    access.create("sam", {
      docId: indexDocId("user", "dana"),
      kind: "index",
      home: "user",
    }),
  ).toEqual({ ok: false, code: "bad_request" });
  expect(
    access.create("dana", { docId: WS, kind: "index", home: `project:${WS}` }),
  ).toMatchObject({ ok: true });
  expect(
    access.create("dana", {
      docId: WS,
      kind: "index",
      home: `project:${DOC2}`,
    }),
  ).toEqual({ ok: false, code: "bad_request" });
  expect(
    access.create("dana", {
      docId: WS,
      kind: "index",
      home: `project:${WS}`,
      workspaceId: "medium",
    }),
  ).toEqual({ ok: false, code: "bad_request" });
});

test("a script made in its project's home takes its roles from the workspace index", () => {
  access.create("dana", {
    docId: WS,
    kind: "index",
    home: workspaceHome("medium"),
  });
  storage.directory.setRole(WS, "sam", "edit", ["delete"]);
  storage.directory.setRole(WS, "leo", "comment", []);
  const script = {
    docId: DOC,
    kind: "script",
    home: projectHome(PROJECT),
    workspaceId: "medium",
  };
  expect(access.create("sam", script)).toMatchObject({ ok: true });
  expect([role(DOC, "sam"), role(DOC, "dana"), role(DOC, "leo")]).toEqual([
    "owner",
    "edit",
    "comment",
  ]);
  expect(storage.directory.roleOf(DOC, "dana")).toEqual({
    role: "edit",
    capabilities: [...OWNER_CAPABILITIES],
  });
  expect(fileOf(DOC)).toBe(`project-${PROJECT}.sqlite`);
  // asked again by its creator, nothing is copied again
  storage.directory.setRole(WS, "ana", "edit", []);
  expect(access.create("sam", script)).toMatchObject({
    ok: true,
    document: { created: false },
  });
  expect(role(DOC, "ana")).toBeNull();
  expect(
    access.create("leo", {
      docId: DOC3,
      kind: "script",
      home: projectHome(PROJECT),
      workspaceId: "medium",
    }),
  ).toEqual({ ok: false, code: "forbidden" });
  expect(
    access.create("sam", {
      docId: DOC4,
      kind: "script",
      home: workspaceHome("medium"),
      workspaceId: "medium",
    }),
  ).toEqual({ ok: false, code: "bad_request" });
  expect(
    access.create("sam", {
      docId: DOC5,
      kind: "script",
      home: projectHome(PROJECT),
    }),
  ).toMatchObject({ ok: true });
  expect(role(DOC5, "dana")).toBeNull();
});

test("an index push may write only its kind's maps and never a script body", () => {
  const ok = inspect(
    capture((d) =>
      jsonMap(d, "continue").set(DOC, { workspaceId: "medium", openedAt: 1 }),
    ),
  );
  const own = {
    docId: indexDocId("user", "sam"),
    home: { kind: "user", id: "sam" } as const,
  };
  const workspace = { docId: WS, home: { kind: "project", id: WS } as const };
  expect(validateIndexPush(ok, own)).toEqual([]);
  const projects = inspect(capture((d) => jsonMap(d, "projects").set("p", {})));
  expect(validateIndexPush(projects, own)).toEqual([
    {
      path: "maps.projects",
      code: "not_index",
      severity: "reject",
      message: "a push wrote the projects map, which this index does not hold",
    },
  ]);
  expect(
    validateIndexPush(inspect(aScriptBlock()), workspace).map(
      (issue) => issue.path,
    ),
  ).toEqual(["body"]);
  expect(validateIndexPush(projects, workspace)).toEqual([]);
});

test("a push of the wrong kind to an index is refused for good", () => {
  const world = createWorld();
  const home = { kind: "user" as const, id: "sam" };
  const docId = indexDocId("user", "sam");
  world.storage.directory.place(docId, home, "index", "sam");
  const file = world.storage.open(home);
  file.log.create({
    id: docId,
    kind: "index",
    ownerUserId: null,
    schemaVersion: 1,
    engineVersion: 0,
  });
  file.log.registerClients(docId, "sam", [ALICE_CLIENT]);
  const room = world.rooms.room(docId, home, "index");
  world.rooms.load(room);
  room.editors.set(world.subA.peer, world.subA);
  world.path.push(
    room,
    world.subA,
    pushOf(4, createTypist(ALICE_CLIENT).insertBlock(BLOCK, null, "Rain")),
  );
  world.clock.runDeferred();
  expect(world.refusals).toEqual([
    {
      code: 4422,
      message: "invalid",
      permanent: true,
      retryAfterMs: null,
      clientSeq: 4,
    },
  ]);
  expect(file.log.get(docId)!.headSeq).toBe(0);
});
