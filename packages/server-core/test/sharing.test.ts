import { expect, test } from "bun:test";
import { createDoc, writeGroup } from "@manent/crdt";
import type { CrdtDoc, GroupEntry, TransactionReport } from "@manent/crdt";
import { indexDocId } from "@manent/sync-protocol";
import { createSharingService } from "../src/index.ts";
import { findGroups, readProjectGroups } from "../src/sharing/index.ts";
import type { Directory, Room } from "../src/index.ts";
import type { SharingService } from "../src/sharing/service.ts";
import { DOC, HOME, PROJECT } from "./seed.ts";
import { createServiceWorld } from "./service-world.ts";
import type { ServiceWorld } from "./service-world.ts";

const INDEX = indexDocId("project", PROJECT);

/** Sam and Rob work in the studio; Eve works elsewhere; anyone else is unknown. */
const USERS: Directory = {
  user: (userId) =>
    ["sam", "rob", "eve"].includes(userId) ? { userId, name: userId } : null,
  workspacesOf: (userId) => {
    if (userId === "eve")
      return [{ id: "elsewhere", name: "Elsewhere", seeding: null }];
    return ["sam", "rob"].includes(userId)
      ? [{ id: "studio", name: "Studio", seeding: null }]
      : [];
  },
};

const room = (members: readonly string[]): GroupEntry => ({
  id: "room",
  name: "Room",
  role: "edit",
  memberUserIds: members,
  watermark: false,
});

/** Writes the group into the index and appends the index's state to its log, as a commit of the index would. */
function writeGroups(
  world: ServiceWorld,
  index: CrdtDoc,
  group: GroupEntry,
): Uint8Array {
  writeGroup(index, group);
  const update = index.encodeState();
  world.storage.open(HOME).log.append({
    docId: INDEX,
    generation: 1,
    update,
    userId: "sam",
    origin: "edit",
    clocks: [],
  });
  return update;
}

/** DOC, owned by Sam, in a project whose index holds the Room group. */
function sharingWorld(members: readonly string[]): {
  world: ServiceWorld;
  index: CrdtDoc;
  sharing: SharingService;
  logged: unknown[];
} {
  const world = createServiceWorld();
  world.storage.directory.place(INDEX, HOME, "index", "sam");
  world.storage.open(HOME).log.create({
    id: INDEX,
    kind: "index",
    ownerUserId: null,
    schemaVersion: 1,
    engineVersion: 0,
  });
  const index = createDoc();
  writeGroups(world, index, room(members));
  const logged: unknown[] = [];
  let links = 0;
  const sharing = createSharingService({
    storage: world.storage,
    users: USERS,
    sync: () => world.service,
    clock: world.clock.clock,
    ids: () => `link-${++links}`,
    tokens: () => "t".repeat(43),
    log: (error) => logged.push(error),
  });
  return { world, index, sharing, logged };
}

const roleOf = (world: ServiceWorld, userId: string): string | null =>
  world.storage.directory.roleOf(DOC, userId)?.role ?? null;

test("a group member outside the workspace gets no role", () => {
  const { world, sharing } = sharingWorld(["rob", "eve", "ghost"]);
  const granted = sharing.grantGroup("sam", DOC, "room");
  expect([
    granted.ok && granted.value.skipped,
    roleOf(world, "rob"),
    roleOf(world, "eve"),
    roleOf(world, "ghost"),
  ]).toEqual([["eve", "ghost"], "edit", null, null]);
});

test("a failed reconciliation is retried before access is decided", () => {
  const { world, index, sharing, logged } = sharingWorld(["rob"]);
  sharing.grantGroup("sam", DOC, "room");
  const update = writeGroups(world, index, room([]));
  const report: TransactionReport = {
    update,
    origin: null,
    inserted: [],
    changed: [],
    removed: [],
    maps: ["groups"],
    touched: () => [],
    before: () => undefined,
  };
  const file = world.storage.open(HOME);
  const indexRoom: Room = {
    docId: INDEX,
    home: HOME,
    file,
    kind: "index",
    mode: "authority",
    row: file.log.get(INDEX)!,
    doc: null,
    sizeBytes: 0,
    sinceCheckpoint: 0,
    editors: new Map(),
    viewers: new Map(),
    owners: new Map(),
    colors: new Map(),
  };
  world.storage.failNextCommit();
  sharing.committed?.({
    room: indexRoom,
    sender: null,
    seq: 2,
    update,
    report,
    echo: false,
  });
  const kept = roleOf(world, "rob");
  expect([kept, logged.length, sharing.people("rob", DOC)]).toEqual([
    "edit",
    1,
    { ok: false, code: "forbidden" },
  ]);
});

test("a Can view caller gets no links", () => {
  const { sharing } = sharingWorld([]);
  sharing.createLink("sam", DOC, "view", null);
  const asLeo = sharing.people("leo", DOC);
  const asSam = sharing.people("sam", DOC);
  expect([
    asLeo.ok && asLeo.value.links.length,
    asSam.ok && asSam.value.links.length,
  ]).toEqual([0, 1]);
});

test("sharing barrel exports findGroups and readProjectGroups", () => {
  const { world } = sharingWorld(["sam", "rob"]);
  expect([
    typeof findGroups,
    typeof readProjectGroups,
    findGroups(world.storage, DOC, ["room"]).length,
    readProjectGroups(world.storage, DOC).size,
  ]).toEqual(["function", "function", 1, 1]);
});

test("committed throttles markActive to once per 30 s per user and resets on remove", () => {
  const { world, sharing } = sharingWorld([]);
  sharing.grant("sam", DOC, "rob", "edit");
  const file = world.storage.open(HOME);
  const docRoom: Room = {
    docId: DOC,
    home: HOME,
    file,
    kind: "script",
    mode: "authority",
    row: file.log.get(DOC)!,
    doc: null,
    sizeBytes: 0,
    sinceCheckpoint: 0,
    editors: new Map(),
    viewers: new Map(),
    owners: new Map(),
    colors: new Map(),
  };
  const report: TransactionReport = {
    update: new Uint8Array([1]),
    origin: null,
    inserted: [],
    changed: [],
    removed: [],
    maps: [],
    touched: () => [],
    before: () => undefined,
  };
  const sender = {
    userId: "rob",
    name: "rob",
    deviceId: "dev-rob",
    versions: { protocol: 1, schema: 1, engine: 0, table: 0 },
    address: "127.0.0.1",
    send() {},
    close() {},
  };

  let markCalls = 0;
  const origMarkActive = world.storage.shareLinks.markActive.bind(
    world.storage.shareLinks,
  );
  world.storage.shareLinks.markActive = (docId, userId) => {
    markCalls += 1;
    origMarkActive(docId, userId);
  };

  const emit = (seq: number) =>
    sharing.committed?.({
      room: docRoom,
      sender,
      seq,
      update: new Uint8Array([1]),
      report,
      echo: false,
    });

  emit(1);
  world.clock.advance(5_000);
  emit(2);
  world.clock.advance(24_999);
  emit(3);
  expect(markCalls).toBe(1);

  world.clock.advance(1);
  emit(4);
  expect(markCalls).toBe(2);

  // Removing and re-granting clears the throttle for that user
  sharing.remove("sam", DOC, "rob");
  sharing.grant("sam", DOC, "rob", "edit");
  emit(5);
  expect(markCalls).toBe(3);
});
