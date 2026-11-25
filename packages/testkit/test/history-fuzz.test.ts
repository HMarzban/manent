import { test } from "bun:test";
import { isSceneHeading } from "@manent/revisions";
import fc from "fast-check";
import { blocksOfDoc } from "../src/index.ts";
import { applyOp, arbRun } from "./fuzz-ops.ts";
import type { Op, Run } from "./fuzz-ops.ts";
import {
  answered,
  contentOf,
  historyWorld,
  nameDraft,
  restoreAs,
  restoreLocally,
} from "./history-world.ts";
import type { HistoryWorld } from "./history-world.ts";

/** A restore by a device's person: of the whole script or one scene on the server, or of the whole script on the device, offline. */
type RestoreOp = { device: number; version: number } & (
  | { kind: "restore_script" }
  | { kind: "restore_scene"; scene: number }
  | { kind: "restore_offline" }
);
type HistoryOp = Op | RestoreOp;
type HistoryRun = Omit<Run, "ops"> & { ops: HistoryOp[] };

const index = fc.nat({ max: 63 });

const arbRestoreOp: fc.Arbitrary<RestoreOp> = fc.oneof(
  fc.record({
    kind: fc.constant("restore_script"),
    device: index,
    version: index,
  }),
  fc.record({
    kind: fc.constant("restore_scene"),
    device: index,
    version: index,
    scene: index,
  }),
  fc.record({
    kind: fc.constant("restore_offline"),
    device: index,
    version: index,
  }),
);

/** The runs of fuzz-ops.ts with up to eight restores put in among their ops. */
const arbRunWithRestores: fc.Arbitrary<HistoryRun> = fc
  .tuple(arbRun, fc.array(fc.tuple(index, arbRestoreOp), { maxLength: 8 }))
  .map(([run, restores]) => {
    const ops: HistoryOp[] = [...run.ops];
    for (const [at, op] of restores) ops.splice(at % (ops.length + 1), 0, op);
    return { ...run, ops };
  });

const isRestore = (op: HistoryOp): op is RestoreOp => "version" in op;

/** The run's world, with its script named as a draft before the first op. */
async function worldOf(run: HistoryRun): Promise<HistoryWorld> {
  const w = await historyWorld(run.seed, {
    users: run.users,
    devicesPerUser: run.devices,
    faults: run.faults,
  });
  const [first] = run.users;
  if (first === undefined) throw new RangeError("a run has a user");
  await nameDraft(w, first, "First draft");
  return w;
}

/** A restore of one of the versions the server lists; a scene restore of a version without a scene restores nothing. */
async function restore(w: HistoryWorld, op: RestoreOp): Promise<void> {
  const device = w.clients[op.device % w.clients.length];
  if (device === undefined) throw new RangeError("a world has no device");
  const { userId } = device;
  const list = w.history.list(userId, w.docId, null, 500);
  const { versions } = await answered(w, list);
  const version = versions[op.version % versions.length];
  if (version === undefined) throw new RangeError("a draft is named first");
  if (op.kind === "restore_script") {
    await restoreAs(w, userId, version.id, { kind: "script" });
    return;
  }
  const content = await contentOf(w, userId, version.id);
  if (op.kind === "restore_offline") {
    device.online(false);
    await restoreLocally(w, device, content);
    return;
  }
  const headings = blocksOfDoc(content).filter(isSceneHeading);
  const headingId = headings[op.scene % headings.length]?.attrs?.id;
  if (typeof headingId !== "string") return;
  await restoreAs(w, userId, version.id, { kind: "scene", headingId });
}

async function applyHistoryOp(w: HistoryWorld, op: HistoryOp): Promise<void> {
  if (isRestore(op)) return restore(w, op);
  applyOp(w, op);
}

/** The run's ops in its world, then the invariants once the world has settled. */
async function play(run: HistoryRun): Promise<void> {
  const w = await worldOf(run);
  for (const op of run.ops) await applyHistoryOp(w, op);
  await w.settle();
  w.check();
}

test("every character typed is in the script or in Recovered text, with restores in the mix", async () => {
  await fc.assert(fc.asyncProperty(arbRunWithRestores, play), {
    numRuns: Number(process.env.MANENT_FUZZ_RUNS ?? 100),
  });
}, 300_000);

/**
 * Found with seed 890587692: a device moved a block offline before it held what someone else then
 * typed into it, and the rebuilt script took the move as a deletion of that text.
 */
const MOVED_BEFORE_TYPING_ARRIVED: HistoryRun = {
  seed: 890_587_692,
  users: ["dana", "sam"],
  devices: 2,
  faults: { duplicate: 0 },
  ops: [
    { device: 0, kind: "restore", block: 0, at: 0 },
    { device: 0, kind: "type", block: 0, at: 0 },
    { device: 0, kind: "split", block: 0, at: 0 },
    { device: 0, kind: "split", block: 0, at: 0 },
    { device: 0, kind: "element", block: 0, element: 0 },
    { device: 0, kind: "element", block: 0, element: 0 },
    { device: 0, kind: "deliver", frames: 1 },
    { device: 5, kind: "type", block: 7, at: 0 },
    { device: 3, kind: "split", block: 6, at: 0 },
    { device: 0, kind: "rebuild" },
    { device: 3, kind: "join", block: 0 },
    { device: 0, kind: "quiet" },
    { device: 0, kind: "delete", block: 0 },
    { device: 0, kind: "restore", block: 0, at: 0 },
    { device: 0, kind: "delete", block: 0 },
    { device: 0, kind: "insert", block: 0 },
    { device: 0, kind: "rebuild" },
    { device: 0, kind: "deliver", frames: 10 },
    { device: 0, kind: "offline" },
    { device: 0, kind: "join", block: 0 },
    { device: 0, kind: "delete", block: 0 },
    { device: 0, kind: "split", block: 0, at: 0 },
    { device: 0, kind: "quiet" },
    { device: 0, kind: "offline" },
    { device: 3, kind: "move", block: 0, length: 2, target: 0 },
    { device: 0, kind: "online" },
    { device: 0, kind: "split", block: 0, at: 0 },
    { device: 0, kind: "offline" },
    { device: 0, kind: "split", block: 0, at: 0 },
  ],
};

/**
 * Found with seeds 1040187384 and 405958027: a server update the device had not yet applied when
 * the script was rebuilt was taken, once applied, for typing on the device meanwhile, and written
 * over what others had typed since.
 */
const UPDATE_APPLIED_WHILE_MOVING: readonly HistoryRun[] = [
  {
    seed: 1_040_187_384,
    users: ["dana", "sam", "priya"],
    devices: 2,
    faults: { duplicate: 0 },
    ops: [
      { device: 0, kind: "join", block: 0 },
      { device: 1, kind: "insert", block: 0 },
      { device: 0, kind: "element", block: 0, element: 0 },
      { device: 0, kind: "element", block: 0, element: 0 },
      { device: 0, kind: "type", block: 0, at: 0 },
      { device: 0, kind: "delete", block: 0 },
      { device: 0, kind: "insert", block: 0 },
      { device: 0, kind: "delete", block: 0 },
      { device: 0, kind: "join", block: 0 },
      { device: 0, kind: "type", block: 0, at: 0 },
      { device: 0, kind: "rebuild" },
      { device: 0, kind: "deliver", frames: 32 },
      { device: 0, kind: "move", block: 22, length: 2, target: 0 },
      { device: 0, kind: "online" },
      { device: 0, kind: "quiet" },
      { device: 0, kind: "rebuild" },
      { device: 1, kind: "offline" },
      { device: 0, kind: "restore", block: 0, at: 0 },
      { device: 0, kind: "quiet" },
      { device: 0, kind: "join", block: 0 },
      { device: 2, kind: "type", block: 0, at: 0 },
      { device: 0, kind: "split", block: 0, at: 0 },
      { device: 0, kind: "insert", block: 0 },
      { device: 0, kind: "online" },
      { device: 0, kind: "element", block: 0, element: 0 },
      { device: 0, kind: "element", block: 0, element: 0 },
      { device: 0, kind: "online" },
      { device: 0, kind: "insert", block: 0 },
      { device: 0, kind: "join", block: 0 },
    ],
  },
  {
    seed: 405_958_027,
    users: ["dana", "sam"],
    devices: 2,
    faults: { duplicate: 0 },
    ops: [
      { kind: "restore_offline", device: 3, version: 0 },
      { device: 0, kind: "insert", block: 3 },
      { device: 2, kind: "join", block: 0 },
      { device: 0, kind: "quiet" },
      { device: 0, kind: "delete", block: 0 },
      { device: 0, kind: "split", block: 0, at: 0 },
      { device: 0, kind: "type", block: 0, at: 0 },
      { device: 0, kind: "join", block: 0 },
      { device: 0, kind: "deliver", frames: 4 },
      { device: 0, kind: "delete", block: 0 },
      { device: 0, kind: "rebuild" },
      { device: 0, kind: "element", block: 0, element: 0 },
      { device: 1, kind: "element", block: 0, element: 0 },
      { device: 0, kind: "move", block: 0, length: 2, target: 0 },
      { device: 1, kind: "restore", block: 0, at: 0 },
      { device: 0, kind: "quiet" },
      { device: 5, kind: "type", block: 46, at: 0 },
      { kind: "restore_offline", device: 0, version: 0 },
      { device: 0, kind: "rebuild" },
      { device: 0, kind: "offline" },
      { device: 0, kind: "quiet" },
      { device: 0, kind: "insert", block: 0 },
    ],
  },
];

/**
 * Found with seed 556917606 (path 64): an offline restore and a server restore both brought back
 * the same deleted block ID across a rebuild, and the server copy had new typing in it. Replaying
 * the offline restore must keep the server's block as an overlap, never overwrite it with mine.
 */
const CONCURRENT_RESTORE_OVERLAP: HistoryRun = {
  seed: 1,
  users: ["dana", "sam", "priya"],
  devices: 1,
  faults: { duplicate: 0 },
  ops: [
    { kind: "restore_offline", device: 0, version: 0 },
    { device: 0, kind: "split", block: 0, at: 0 },
    { device: 0, kind: "element", block: 0, element: 0 },
    { device: 0, kind: "join", block: 0 },
    { device: 0, kind: "online" },
    { device: 0, kind: "delete", block: 2 },
    { kind: "restore_offline", device: 35, version: 0 },
    { device: 0, kind: "rebuild" },
    { kind: "restore_script", device: 0, version: 0 },
    { device: 2, kind: "online" },
    { device: 0, kind: "type", block: 20, at: 0 },
    { device: 0, kind: "quiet" },
  ],
};

/**
 * Found with seed 549333125 (path 85, run seed 487950146): an offline join moved acknowledged text
 * from a deleted block into a block that overlapped with another device across a rebuild, so the
 * acknowledged text is kept in Recovered text with cause "overlap".
 */
const OFFLINE_JOIN_OVERLAP: HistoryRun = {
  seed: 487_950_146,
  users: ["dana", "sam"],
  devices: 1,
  faults: { duplicate: 0 },
  ops: [
    { kind: "restore_script", device: 52, version: 17 },
    { device: 5, kind: "offline" },
    { device: 1, kind: "quiet" },
    { device: 0, kind: "type", block: 29, at: 3 },
    { kind: "restore_offline", device: 43, version: 22 },
    { device: 5, kind: "quiet" },
    { device: 3, kind: "insert", block: 59 },
    { device: 3, kind: "quiet" },
    { device: 0, kind: "join", block: 10 },
    { device: 1, kind: "split", block: 4, at: 58 },
    { device: 4, kind: "rebuild" },
    { device: 3, kind: "online" },
    { device: 1, kind: "join", block: 4 },
    { device: 3, kind: "split", block: 5, at: 62 },
    { device: 1, kind: "quiet" },
  ],
};

test("text someone typed into a block a device moved offline, unseen, stays in the script across a rebuild", async () => {
  await play(MOVED_BEFORE_TYPING_ARRIVED);
});

test("text that reaches a device while its edits are carried into a rebuilt script is never undone as its typing", async () => {
  for (const run of UPDATE_APPLIED_WHILE_MOVING) await play(run);
});

test("replaying an offline restore never overwrites concurrent edits to the same restored block ID", async () => {
  await play(CONCURRENT_RESTORE_OVERLAP);
});

test("acknowledged text moved by an offline join into an overlapping block is kept as an overlap", async () => {
  await play(OFFLINE_JOIN_OVERLAP);
});
