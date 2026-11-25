// The Late Desk rundowns for days D-1, D and D+1, with row 8's previous duration on day D.
import { insertRows, readRundown, setCell } from "@manent/crdt";
import type { CrdtDoc, NewRow } from "@manent/crdt";
import { projectHome } from "@manent/sync-protocol";
import {
  LATE_DESK_DAY_ROWS,
  LATE_DESK_NEXT_DAY_ROWS,
  LATE_DESK_PREVIOUS_DAY_ROWS,
  LATE_DESK_ROW_8_FINAL_DUR_MS,
  LATE_DESK_ROW_8_SEGMENT,
  LATE_DESK_TARGET_MS,
} from "../../content/medium/rundowns/show-rows.ts";
import type { ShowRowSpec } from "../../content/medium/rundowns/show-rows.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import type { SeedDriver, SeedSession } from "../driver.ts";
import type { SeedContext, SeedStep } from "../seed.ts";
import { DAY_MS } from "../time.ts";

const PROJECT_KEY = "medium/the-late-desk";
const DURATION_SETTLE_MS = 500;
const AUTO_SEND_SETTLE_MS = 2_000;
const SETTLE_TICKS = 500;

/** Waits on microtasks until `ready` holds on `doc`, up to a bounded tick count. */
export async function drainUntil(
  doc: CrdtDoc,
  ready: (doc: CrdtDoc) => boolean,
): Promise<boolean> {
  for (let i = 0; i < SETTLE_TICKS; i += 1) {
    if (ready(doc)) return true;
    await Promise.resolve();
  }
  return ready(doc);
}

const allScriptDurationsReady = (doc: CrdtDoc): boolean =>
  readRundown(doc).rows.every(
    (row) => row.kind !== "script" || row.durationMs !== null,
  );

const allScriptPrompterOn = (doc: CrdtDoc): boolean =>
  readRundown(doc).rows.every(
    (row) => row.kind !== "script" || row.prompter?.state === "on",
  );

/** Advances past the server's duration coalesce and auto-send timers so script rows settle. */
export async function settleScriptRows(
  driver: SeedDriver,
  session: SeedSession,
  createdAt: number,
  options: { expectAutoSend: boolean },
): Promise<void> {
  await driver.setTime(createdAt + DURATION_SETTLE_MS);
  await drainUntil(session.doc, allScriptDurationsReady);
  if (!options.expectAutoSend) return;
  await driver.setTime(createdAt + AUTO_SEND_SETTLE_MS);
  const sent = await drainUntil(
    session.doc,
    (doc) => allScriptDurationsReady(doc) && allScriptPrompterOn(doc),
  );
  if (!sent) {
    await driver.setTime(createdAt + AUTO_SEND_SETTLE_MS * 2);
    await drainUntil(
      session.doc,
      (doc) => allScriptDurationsReady(doc) && allScriptPrompterOn(doc),
    );
  }
}

interface ShowRundownInput {
  readonly docKey: string;
  readonly createdAtSpec: string;
  readonly dayOffset: number;
  readonly rows: readonly ShowRowSpec[];
}

function writeShowCells(
  doc: CrdtDoc,
  rows: readonly { id: string; spec: ShowRowSpec }[],
  createdAt: number,
): void {
  const by = { userId: "ana", now: () => createdAt };
  for (const { id, spec } of rows) {
    if (spec.kind === "header") {
      setCell(doc, id, "segment", spec.title, by);
      continue;
    }
    setCell(doc, id, "segment", spec.segment, by);
    if (spec.writer !== null) setCell(doc, id, "writer", spec.writer, by);
    if (spec.kind === "item") setCell(doc, id, "dur", spec.durMs, by);
  }
}

async function seedShowRundown(
  context: SeedContext,
  driver: SeedDriver,
  home: string,
  input: ShowRundownInput,
): Promise<Map<string, string>> {
  const { time, ids } = context;
  const rundowns = driver.rundowns!;
  const createdAt = time.at(input.createdAtSpec);
  const airAt = time.at("N+5:35") + input.dayOffset * DAY_MS;
  const airDate = time.day(time.nowAt + input.dayOffset * DAY_MS);
  const { docId } = seedDoc(input.docKey);
  await driver.setTime(createdAt);
  await rundowns.create("ana", {
    docId,
    workspaceId: "medium",
    home,
    airDate,
    airAt,
    targetMs: LATE_DESK_TARGET_MS,
  });
  const planned = input.rows.map((spec) => ({ id: ids(), spec }));
  const storyDocIds = planned.flatMap(({ spec }) =>
    spec.kind === "script" ? [seedDoc(spec.docKey).docId] : [],
  );
  if (storyDocIds.length > 0)
    await rundowns.link("ana", "medium", { rundownId: docId, storyDocIds });
  const newRows: NewRow[] = planned.map(({ id, spec }) => ({
    id,
    kind: spec.kind,
    docId: spec.kind === "script" ? seedDoc(spec.docKey).docId : null,
    blockId: null,
  }));
  const session = await driver.open("ana", docId);
  try {
    await session.change((doc) => {
      insertRows(doc, newRows, null);
      writeShowCells(doc, planned, createdAt);
    });
    if (storyDocIds.length > 0)
      await settleScriptRows(driver, session, createdAt, {
        expectAutoSend: driver.prompter !== null,
      });
  } finally {
    await session.close();
  }
  const bySegment = new Map<string, string>();
  for (const { id, spec } of planned)
    if (spec.kind !== "header") bySegment.set(spec.segment, id);
  return bySegment;
}

async function updateRowEightDuration(
  context: SeedContext,
  driver: SeedDriver,
  rowId: string,
): Promise<void> {
  const updatedAt = context.time.at("N−1:08");
  await driver.setTime(updatedAt);
  const session = await driver.open(
    "ana",
    seedDoc(`${PROJECT_KEY}/rundowns/day`).docId,
  );
  try {
    await session.change((doc) => {
      setCell(doc, rowId, "dur", LATE_DESK_ROW_8_FINAL_DUR_MS, {
        userId: "ana",
        now: () => updatedAt,
      });
    });
  } finally {
    await session.close();
  }
}

export const THE_LATE_DESK_RUNDOWNS: SeedStep = {
  id: "the-late-desk-rundowns",
  workspace: "medium",
  background: false,
  async run(context) {
    const { driver } = context;
    if (driver === null) return [];
    if (driver.rundowns === null) {
      context.skip("rundowns", "The Late Desk rundowns");
      return [];
    }
    const home = projectHome(seedProject(PROJECT_KEY).projectId);
    await seedShowRundown(context, driver, home, {
      docKey: `${PROJECT_KEY}/rundowns/day-minus-1`,
      createdAtSpec: "D−1 14:00",
      dayOffset: -1,
      rows: LATE_DESK_PREVIOUS_DAY_ROWS,
    });
    const dayRows = await seedShowRundown(context, driver, home, {
      docKey: `${PROJECT_KEY}/rundowns/day`,
      createdAtSpec: "N−9:00",
      dayOffset: 0,
      rows: LATE_DESK_DAY_ROWS,
    });
    await seedShowRundown(context, driver, home, {
      docKey: `${PROJECT_KEY}/rundowns/day-plus-1`,
      createdAtSpec: "N−1:50",
      dayOffset: 1,
      rows: LATE_DESK_NEXT_DAY_ROWS,
    });
    const rowEightId = dayRows.get(LATE_DESK_ROW_8_SEGMENT);
    if (rowEightId === undefined)
      throw new RangeError("The Late Desk day rundown has no row 8");
    await updateRowEightDuration(context, driver, rowEightId);
    return [];
  },
};
