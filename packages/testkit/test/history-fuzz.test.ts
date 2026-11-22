import { test } from "bun:test";
import { isSceneHeading } from "@manent/revisions";
import fc from "fast-check";
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
  const blocks = content.content?.[0]?.content ?? [];
  const headings = blocks.filter(isSceneHeading);
  const headingId = headings[op.scene % headings.length]?.attrs?.id;
  if (typeof headingId !== "string") return;
  await restoreAs(w, userId, version.id, { kind: "scene", headingId });
}

async function applyHistoryOp(w: HistoryWorld, op: HistoryOp): Promise<void> {
  if (isRestore(op)) return restore(w, op);
  applyOp(w, op);
}

test("every character typed is in the script or in Recovered text, with restores in the mix", async () => {
  await fc.assert(
    fc.asyncProperty(arbRunWithRestores, async (run) => {
      const w = await worldOf(run);
      for (const op of run.ops) await applyHistoryOp(w, op);
      await w.settle();
      w.check();
    }),
    { numRuns: Number(process.env.MANENT_FUZZ_RUNS ?? 100) },
  );
}, 300_000);
