import { expect, test } from "bun:test";
import {
  ORIGIN_REVIEW,
  createUndoScope,
  scriptBody,
  undoManagerForBinding,
} from "@manent/crdt";
import { canonicalDoc } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { LockAnchorRecord, Message } from "@manent/sync-protocol";
import { tabMessage, uploadRequestOf } from "../src/index.ts";
import { memoryTabs } from "../src/testing/index.ts";
import type { MemoryTabs } from "../src/testing/index.ts";
import type { DeviceVersion, DocEvent, DocHandle } from "../src/index.ts";
import {
  B1,
  B2,
  DOC,
  block,
  fakeFrames,
  setup,
  textOf,
  typeIn,
  utf8,
} from "./scripted-server.ts";
import type { World } from "./scripted-server.ts";

const B3 = "block-three-0003";

function docOf(blocks: BlockJSON[]): DocJSON {
  return { type: "doc", content: [{ type: "section", content: blocks }] };
}

/** The script as the device held it before the restore: the seed, with a line typed into B1. */
const BEFORE = docOf([block(B1, "The lamp is lit."), block(B2, "")]);

/** The version restored: B1 rewritten, B2 kept, and B3 brought back. */
const TARGET = docOf([
  block(B1, "The lamp is out."),
  block(B2, ""),
  block(B3, "Dana waits by the door."),
]);

function materialize(h: DocHandle): DocJSON {
  return scriptBody(h.doc()).materialize();
}

test("restoring offline keeps the script as it was, then writes the version's blocks as this person's changes", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  client.setOnline(false);
  typeIn(h, B1, "The lamp is lit.");
  await w.settle();
  const out = await h.restoreLocally(TARGET, { kind: "script" });
  await w.settle();
  const kept = (await h.deviceVersions()).find(
    (v) => v.id === out.beforeVersionId,
  );
  expect([kept?.label, kept?.content]).toEqual([
    "before_restore",
    canonicalDoc(BEFORE),
  ]);
  expect([out.applied, materialize(h)]).toEqual([2, canonicalDoc(TARGET)]);
  expect(h.status.get()).toMatchObject({ saved: true, waiting: 2 });
});

test("an offline restore is not on the undo stack", async () => {
  const w = await setup();
  const client = w.makeClient();
  const h = await client.open(DOC);
  client.setOnline(false);
  const scope = createUndoScope(h.doc(), {
    trackedOrigins: ["typing", ORIGIN_REVIEW],
    roots: ["script"],
  });
  scriptBody(h.doc()).write((writer) => {
    writer.insertText(B2, 0, "Dana waits by the door.");
  }, "typing");
  await h.restoreLocally(
    docOf([
      block(B1, "The lamp is out."),
      block(B2, "Dana waits by the door."),
    ]),
    { kind: "script" },
  );
  undoManagerForBinding(scope).undo();
  expect(textOf(h.doc())).toBe("The lamp is out.\n");
});

test("naming a draft offline keeps it on the device until it uploads", async () => {
  const w = await setup();
  const offered: DeviceVersion[] = [];
  const client = w.makeClient({
    uploadVersion: async (version) => {
      offered.push(version);
      return true;
    },
  });
  const h = await client.open(DOC);
  client.setOnline(false);
  const named = await h.nameVersion("Studio draft");
  const stored = async () =>
    (await h.deviceVersions()).map((v) => [v.label, v.name, v.uploaded]);
  expect([named.label, named.name, offered, await stored()]).toEqual([
    "named",
    "Studio draft",
    [],
    [["named", "Studio draft", false]],
  ]);
  client.setOnline(true);
  await w.online();
  const sent = offered.map((v) => uploadRequestOf(v, "device-1", 1).version);
  expect([sent, await stored()]).toEqual([
    [
      {
        id: named.id,
        kind: "named",
        name: "Studio draft",
        deviceId: "device-1",
        content: named.content,
        schemaVersion: 1,
      },
    ],
    [["named", "Studio draft", true]],
  ]);
});

const V: DeviceVersion = {
  id: "version-0001",
  docId: DOC,
  kind: "device",
  label: "manual",
  name: null,
  createdAt: 1,
  content: canonicalDoc(BEFORE),
  uploaded: false,
};

const LABELS: DeviceVersion["label"][] = [
  "session_end",
  "hourly",
  "before_reconnect",
  "manual",
  "rejected",
  "past_window",
  "named",
  "before_restore",
];

test("each device label uploads as its kind", () => {
  expect(
    LABELS.map(
      (label) => uploadRequestOf({ ...V, label }, "dev1", 1).version.kind,
    ),
  ).toEqual([
    "device",
    "device",
    "pre_merge",
    "saved",
    "recovered",
    "recovered",
    "named",
    "pre_restore",
  ]);
});

const REVISION = { setId: "set-1", baselineVersionId: "version-1" };

const ANCHOR: LockAnchorRecord = {
  level: 1,
  order: 0,
  label: "1",
  blockId: B1,
  offset: 0,
  quote: "The lamp",
  fallbackIds: [],
  source: "lock",
};

/** SUBSCRIBED for DOC with page numbers locked at level 2, its anchors as given, in a revision set. */
function lockedSubscribed(
  lockAnchors: { table: LockAnchorRecord[] } | { hash: Uint8Array },
): Message {
  return {
    type: "SUBSCRIBED",
    docId: DOC,
    generation: 1,
    role: "edit",
    capabilities: [],
    headSeq: 4,
    minSchemaVersion: 1,
    engineVersion: 0,
    lockLevel: 2,
    lockAnchors,
    revision: REVISION,
    airWindow: null,
  };
}

test("every CONTROL frame and every subscription reaches the handle as an event", async () => {
  const w = await setup();
  w.server.answer.subscribe = false;
  const client = w.makeClient();
  const h = await client.open(DOC);
  const events: DocEvent[] = [];
  h.on((event) => events.push(event));
  await w.online();
  w.server.send(lockedSubscribed({ hash: new Uint8Array([1, 2, 3]) }));
  w.server.answer.subscribe = true;
  await w.settle();
  const data = utf8('{"kind":"restored"}');
  w.server.send({
    type: "CONTROL",
    docId: DOC,
    generation: 1,
    seq: 4,
    kind: "restored",
    data,
  });
  await w.settle();
  const before = h.lastServerSeq();
  typeIn(h, B1, "a");
  await w.settle();
  w.server.ack(DOC, 1, 9);
  await w.settle();
  w.server.send(lockedSubscribed({ table: [ANCHOR] }));
  await w.settle();
  const locked = {
    type: "subscribed" as const,
    lockLevel: 2,
    revision: REVISION,
  };
  expect([events, before, h.lastServerSeq()]).toEqual([
    [
      { ...locked, lockAnchors: null },
      { type: "control", kind: "restored", data },
      { ...locked, lockAnchors: [ANCHOR] },
    ],
    1,
    9,
  ]);
});

/** Two tabs of one user on DOC, online: the events the second, following tab's handle hears from now on. */
async function followingTab(): Promise<{
  w: World;
  tabs: MemoryTabs;
  leads: boolean;
  events: DocEvent[];
}> {
  const w = await setup();
  const tabs = memoryTabs();
  const tab = (id: string) =>
    w.makeClient({ leader: tabs.port(id), frames: fakeFrames() });
  await tab("a").open(DOC);
  const following = tab("b");
  const h = await following.open(DOC);
  await w.online();
  const events: DocEvent[] = [];
  h.on((event) => events.push(event));
  return { w, tabs, leads: following.link.get().leader, events };
}

test("a following tab hears every CONTROL frame and every subscription the leading tab hears", async () => {
  const { w, leads, events } = await followingTab();
  const data = utf8('{"kind":"restored"}');
  w.server.send({
    type: "CONTROL",
    docId: DOC,
    generation: 1,
    seq: 4,
    kind: "restored",
    data,
  });
  w.server.send(lockedSubscribed({ table: [ANCHOR] }));
  await w.settle();
  expect([leads, events]).toEqual([
    false,
    [
      { type: "control", kind: "restored", data },
      {
        type: "subscribed",
        lockLevel: 2,
        lockAnchors: [ANCHOR],
        revision: REVISION,
      },
    ],
  ]);
});

test("a following tab hears no CONTROL frame or subscription passed on in the wrong shape", async () => {
  const { w, tabs, events } = await followingTab();
  const subscribed: DocEvent = {
    type: "subscribed",
    lockLevel: 2,
    lockAnchors: null,
    revision: null,
  };
  const other = tabs.port("c");
  for (const event of [
    { type: "control", kind: "shouted", data: new Uint8Array() },
    { type: "control", kind: "restored", data: [1, 2] },
    { ...subscribed, lockLevel: "2" },
    { ...subscribed, lockAnchors: [{ ...ANCHOR, source: "guess" }] },
    { ...subscribed, lockAnchors: { table: [ANCHOR] } },
    { ...subscribed, revision: { setId: "set-1" } },
    subscribed,
  ])
    other.post(tabMessage("c", { t: "event", docId: DOC, event }));
  await w.settle();
  expect(events).toEqual([subscribed]);
});
