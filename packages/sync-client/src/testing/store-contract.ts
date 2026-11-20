// The tests every local store passes, registered through the test functions its caller hands in.
import type {
  DeviceVersion,
  DocMeta,
  LocalStore,
  RecoveredItem,
  StoredSetting,
  StoredUpdate,
} from "../ports/ports.ts";

/** The caller's `test` and `expect`; `expect` returns the runner's matchers, whose type cannot be named here. */
export interface TestApi {
  test(name: string, fn: () => void | Promise<void>): void;
  expect(value: unknown): any;
}

const DOC = "01a1e81d-c6f2-7301-a0f6-5c345eb6c7cd";
const DOC2 = "5b0c3f4e-2d71-4e8a-9c16-0f7d2a9e4b3c";
const KEY = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";

/** A document no server has named yet: generation 0, nothing synced, nothing set. */
export function blankMeta(docId: string): DocMeta {
  return {
    docId,
    generation: 0,
    lastServerSeq: 0,
    clientIds: [],
    ackedClocks: {},
    neverSynced: true,
    create: null,
    parked: null,
    recovering: null,
    lastDeviceVersionAt: 0,
    lastSyncedAt: null,
    moving: null,
  };
}

function bytes(n: number): Uint8Array {
  return new Uint8Array([n, n + 1, n + 2]);
}

function own(n: number): StoredUpdate {
  return {
    kind: "update",
    localSeq: n,
    update: bytes(n),
    own: true,
    acked: false,
    applied: true,
    elements: [`b${n}`],
  };
}

function remote(n: number): StoredUpdate {
  return {
    kind: "update",
    localSeq: n,
    update: bytes(n),
    own: false,
    acked: true,
    applied: false,
    elements: [],
  };
}

function setting(n: number): StoredSetting {
  return {
    kind: "set",
    localSeq: n,
    key: "script.paper",
    value: '"a4"',
    acked: false,
  };
}

function item(id: string): RecoveredItem {
  return {
    id,
    docId: DOC,
    blockId: "b1",
    nearBlockId: null,
    text: "kept",
    recoveredAt: 5,
    cause: "merge",
    mine: null,
    theirs: null,
    otherClientIds: [],
  };
}

function version(id: string, docId: string): DeviceVersion {
  return {
    id,
    docId,
    kind: "device",
    label: "manual",
    createdAt: 1,
    content: {
      type: "doc",
      content: [
        {
          type: "section",
          content: [
            {
              type: "block",
              attrs: { id: "b000000000000001", type: "action" },
              content: [{ type: "text", text: `The lamp flickers in ${id}.` }],
            },
          ],
        },
      ],
    },
    uploaded: false,
  };
}

/** The document holding one own update, one from the server and another own one, none acknowledged. */
async function seed(s: LocalStore): Promise<void> {
  await s.create(blankMeta(DOC));
  for (const e of [own(1), remote(2), own(3)]) await s.append(DOC, e);
}

/** Seeded, then 1 and 2 acknowledged and applied: only 3 is still waiting. */
async function seedSettled(s: LocalStore): Promise<void> {
  await seed(s);
  await s.acknowledge(DOC, 2, {});
  await s.markApplied(DOC, 2, []);
}

/** One case of the contract: the store under test is Dana's, freshly made. */
interface ContractCase {
  name: string;
  run(
    s: LocalStore,
    open: (userId: string) => Promise<LocalStore>,
    expect: TestApi["expect"],
  ): Promise<void>;
}

const CONTRACT: readonly ContractCase[] = [
  {
    name: "a document that was never opened is not there",
    async run(s, _open, expect) {
      expect(await s.load(DOC)).toBeNull();
      expect(await s.documents()).toEqual([]);
    },
  },
  {
    name: "what was appended comes back in order after a reload",
    async run(s, open, expect) {
      await seed(s);
      const again = await (await open("dana")).load(DOC);
      expect(again!.entries).toEqual([own(1), remote(2), own(3)]);
      expect(again!.checkpoint).toBeNull();
      expect(again!.syncedBase).toBeNull();
      expect(again!.meta).toEqual(blankMeta(DOC));
    },
  },
  {
    name: "an acknowledgement and its bookkeeping are one write",
    async run(s, _open, expect) {
      await seed(s);
      await s.acknowledge(DOC, 2, {
        lastServerSeq: 40,
        ackedClocks: { "7": 12 },
        neverSynced: false,
        lastSyncedAt: 5_000,
      });
      const loaded = (await s.load(DOC))!;
      expect(loaded.entries.map((u) => [u.localSeq, u.acked])).toEqual([
        [1, true],
        [2, true],
        [3, false],
      ]);
      expect(loaded.meta).toMatchObject({
        lastServerSeq: 40,
        ackedClocks: { "7": 12 },
        neverSynced: false,
        lastSyncedAt: 5_000,
      });
    },
  },
  {
    name: "applying a server update and keeping what it set aside are one write",
    async run(s, _open, expect) {
      await seed(s);
      const kept = item("r1");
      await s.markApplied(DOC, 2, [kept]);
      expect(
        (await s.load(DOC))!.entries.find((u) => u.localSeq === 2),
      ).toEqual({ ...remote(2), applied: true });
      expect(await s.recovered(DOC)).toEqual([kept]);
      await s.dismissRecovered("r1");
      expect(await s.recovered(DOC)).toEqual([]);
    },
  },
  {
    name: "an item filed again under its id takes the place of the one before",
    async run(s, _open, expect) {
      await seed(s);
      const wording = {
        type: "block" as const,
        attrs: { id: "b1", type: "action" },
        content: [{ type: "text" as const, text: "the other wording" }],
      };
      const again = { ...item("r1"), theirs: wording, otherClientIds: [7] };
      await s.markApplied(DOC, 0, [item("r1"), item("r2")]);
      await s.markApplied(DOC, 0, [again]);
      expect(await s.recovered(DOC)).toEqual([again, item("r2")]);
    },
  },
  {
    name: "a checkpoint drops what it covers, and never an edit that is still waiting",
    async run(s, _open, expect) {
      await seedSettled(s);
      await s.checkpoint(DOC, bytes(99), 3, true);
      const loaded = (await s.load(DOC))!;
      expect(loaded.checkpoint).toEqual({
        state: bytes(99),
        throughLocalSeq: 3,
      });
      expect(loaded.syncedBase).toEqual(bytes(99));
      expect(loaded.entries).toEqual([own(3)]);
      await s.checkpoint(DOC, bytes(98), 3, false);
      // not synced: the base stays
      expect((await s.load(DOC))!.syncedBase).toEqual(bytes(99));
    },
  },
  {
    name: "a waiting setting is an entry like any other, and a refused one is removed alone",
    async run(s, _open, expect) {
      await seedSettled(s);
      await s.checkpoint(DOC, bytes(99), 3, true);
      await s.append(DOC, setting(4));
      await s.append(DOC, own(5));
      await s.refuse(DOC, 4);
      expect(
        (await s.load(DOC))!.entries.map((e) => [e.kind, e.localSeq]),
      ).toEqual([
        ["update", 3],
        ["update", 5],
      ]);
      await s.append(DOC, setting(6));
      await s.acknowledge(DOC, 6, {});
      expect(
        (await s.load(DOC))!.entries.find((e) => e.localSeq === 6),
      ).toEqual({ ...setting(6), acked: true });
    },
  },
  {
    name: "a reset replaces the document and keeps its waiting settings, versions and recovered text",
    async run(s, _open, expect) {
      await seed(s);
      await s.append(DOC, setting(4));
      await s.acknowledge(DOC, 4, {});
      await s.addVersion(version("v1", DOC));
      await s.markApplied(DOC, 0, [item("r2")]);
      await s.append(DOC, setting(7));
      await s.reset(DOC, bytes(7), {
        ...blankMeta(DOC),
        clientIds: [11],
        neverSynced: false,
      });
      const loaded = (await s.load(DOC))!;
      expect(loaded.entries).toEqual([setting(7)]);
      expect(loaded.syncedBase).toEqual(bytes(7));
      // the highest localSeq ever held: local sequences never repeat
      expect(loaded.checkpoint).toEqual({
        state: bytes(7),
        throughLocalSeq: 7,
      });
      expect(loaded.meta.clientIds).toEqual([11]);
      expect((await s.versions(DOC)).map((v) => v.id)).toEqual(["v1"]);
      expect((await s.recovered(DOC)).map((r) => r.id)).toEqual(["r2"]);
    },
  },
  {
    name: "versions are kept whole and can be marked uploaded",
    async run(s, _open, expect) {
      await s.addVersion(version("v1", DOC));
      await s.addVersion(version("v2", DOC2));
      await s.addVersion(version("v3", DOC));
      expect(await s.versions(DOC)).toEqual([
        version("v1", DOC),
        version("v3", DOC),
      ]);
      await s.markUploaded("v1");
      expect(await s.versions(DOC)).toEqual([
        { ...version("v1", DOC), uploaded: true },
        version("v3", DOC),
      ]);
    },
  },
  {
    name: "two users on one device never see each other's documents",
    async run(s, open, expect) {
      await s.create(blankMeta(DOC));
      const sam = await open("sam");
      expect(await sam.load(DOC)).toBeNull();
      expect(await sam.documents()).toEqual([]);
      await sam.create(blankMeta(DOC2));
      expect((await s.documents()).map((m) => m.docId)).toEqual([DOC]);
      expect(sam.userId).toBe("sam");
      expect(s.userId).toBe("dana");
    },
  },
  {
    name: "meta can be patched without touching the log",
    async run(s, _open, expect) {
      await seed(s);
      await s.patchMeta(DOC, { parked: { reason: "deleted", parkedAt: 9 } });
      expect(await s.load(DOC)).toEqual({
        meta: { ...blankMeta(DOC), parked: { reason: "deleted", parkedAt: 9 } },
        checkpoint: null,
        syncedBase: null,
        entries: [own(1), remote(2), own(3)],
      });
    },
  },
  {
    name: "a move in progress is kept across a reload",
    async run(s, open, expect) {
      await seed(s);
      const moving = { from: 1, to: 2, key: KEY, throughLocalSeq: 9 };
      await s.patchMeta(DOC, { moving });
      const again = await open("dana");
      expect((await again.load(DOC))!.meta.moving).toEqual(moving);
      await again.reset(DOC, bytes(4), { ...blankMeta(DOC), moving: null });
      expect((await (await open("dana")).load(DOC))!.meta.moving).toBeNull();
    },
  },
  {
    name: "stored bytes are copies",
    async run(s, _open, expect) {
      await s.create(blankMeta(DOC));
      const entry = own(1);
      const state = bytes(9);
      await s.append(DOC, entry);
      await s.checkpoint(DOC, state, 0, true);
      entry.update.fill(200);
      state.fill(200);
      const first = (await s.load(DOC))!;
      for (const e of first.entries)
        if (e.kind === "update") e.update.fill(201);
      first.checkpoint!.state.fill(201);
      first.syncedBase!.fill(201);
      expect(await s.load(DOC)).toEqual({
        meta: blankMeta(DOC),
        checkpoint: { state: bytes(9), throughLocalSeq: 0 },
        syncedBase: bytes(9),
        entries: [own(1)],
      });
    },
  },
];

/**
 * Registers the tests every `LocalStore` passes. Each test calls `make` afresh,
 * opens Dana's store and disposes of what `make` gave when it ends; `open` called
 * twice with one user must give stores over the same data, as after a reload.
 */
export function localStoreContract(
  api: TestApi,
  make: () => Promise<{
    open(userId: string): Promise<LocalStore>;
    dispose(): Promise<void>;
  }>,
): void {
  for (const contractCase of CONTRACT) {
    api.test(contractCase.name, async () => {
      const made = await make();
      try {
        await contractCase.run(
          await made.open("dana"),
          (userId) => made.open(userId),
          api.expect,
        );
      } finally {
        await made.dispose();
      }
    });
  }
}
