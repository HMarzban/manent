// Lanternfield Studios' live-show and news rundowns: Good Evening, Lannick (D-9..D+4) and Lannick Today (D-7..D+7).
import { insertRows, setCell, setRowUnnumbered } from "@manent/crdt";
import type { CrdtDoc, NewRow } from "@manent/crdt";
import { projectHome } from "@manent/sync-protocol";
import { GOOD_EVENING_AIRED } from "../../content/heavy/rundowns/good-evening-aired.ts";
import { GOOD_EVENING_CURRENT } from "../../content/heavy/rundowns/good-evening-current.ts";
import { LANNICK_TODAY_EVENING_EARLY } from "../../content/heavy/rundowns/lannick-today-evening-early.ts";
import { LANNICK_TODAY_EVENING_RECENT } from "../../content/heavy/rundowns/lannick-today-evening-recent.ts";
import { LANNICK_TODAY_MIDDAY_EARLY } from "../../content/heavy/rundowns/lannick-today-midday-early.ts";
import { LANNICK_TODAY_MIDDAY_RECENT } from "../../content/heavy/rundowns/lannick-today-midday-recent.ts";
import { LANNICK_TODAY_UPCOMING } from "../../content/heavy/rundowns/lannick-today-upcoming.ts";
import type {
  NewsRowSpec,
  NewsRundownSpec,
  ShowRowSpec,
  ShowRundownSpec,
} from "../../content/heavy/rundowns/spec.ts";
import type { SeedRundowns } from "../capabilities/rundowns.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import type { SeedDriver } from "../driver.ts";
import type { SeedContext, SeedStep } from "../seed.ts";
import { DAY_MS } from "../time.ts";
import type { SeedTime } from "../time.ts";

const SHOW_TARGET_MS = 1_650_000;
const MIDDAY_TARGET_MS = 900_000;
const EVENING_TARGET_MS = 1_800_000;
const SHOW_CREATOR = "hugo-marchetti";
// long enough after a rundown push for both duration (500 ms) and automatic prompter send (2 000 ms) timers to fire
const SETTLE_MS = 3_000;

interface PlannedRundown {
  readonly order: number;
  readonly createdAt: number;
  readonly creatorUserId: string;
  readonly projectKey: "heavy/h30" | "heavy/h31";
  readonly docKey: string;
  readonly airDate: string;
  readonly airAt: number;
  readonly targetMs: number;
  readonly write: (
    doc: CrdtDoc,
    ids: () => string,
    by: { userId: string; now: () => number },
  ) => string[];
}

function writeShowRows(
  doc: CrdtDoc,
  rows: readonly ShowRowSpec[],
  ids: () => string,
  by: { userId: string; now: () => number },
): string[] {
  const rowIds = rows.map(() => ids());
  const storyDocIds: string[] = [];
  const newRows: NewRow[] = rows.map((row, i) => {
    const linkedDocId = row.docKey === null ? null : seedDoc(row.docKey).docId;
    if (linkedDocId !== null) storyDocIds.push(linkedDocId);
    return {
      id: rowIds[i]!,
      kind: row.kind,
      docId: linkedDocId,
      blockId: null,
    };
  });
  insertRows(doc, newRows, null);
  for (const [i, row] of rows.entries()) {
    const rowId = rowIds[i]!;
    setCell(doc, rowId, "segment", row.segment, by);
    if (row.writer !== null) setCell(doc, rowId, "writer", row.writer, by);
    if (row.kind === "item" && row.durMs !== null)
      setCell(doc, rowId, "dur", row.durMs, by);
  }
  return storyDocIds;
}

function writeNewsRows(
  doc: CrdtDoc,
  rows: readonly NewsRowSpec[],
  ids: () => string,
  by: { userId: string; now: () => number },
): string[] {
  const rowIds = rows.map(() => ids());
  const storyDocIds: string[] = [];
  const newRows: NewRow[] = rows.map((row, i) => {
    const linkedDocId = row.docKey === null ? null : seedDoc(row.docKey).docId;
    if (linkedDocId !== null) storyDocIds.push(linkedDocId);
    return {
      id: rowIds[i]!,
      kind: row.kind,
      docId: linkedDocId,
      blockId: null,
    };
  });
  insertRows(doc, newRows, null);
  for (const [i, row] of rows.entries()) {
    const rowId = rowIds[i]!;
    setCell(doc, rowId, "story", row.story, by);
    if (row.presenter !== null)
      setCell(doc, rowId, "presenter", row.presenter, by);
    setCell(doc, rowId, "type", row.type, by);
    if (row.kind === "item" && row.durMs !== null)
      setCell(doc, rowId, "dur", row.durMs, by);
    if (row.unnumbered) setRowUnnumbered(doc, rowId, true);
  }
  return storyDocIds;
}

function planShowRundown(
  spec: ShowRundownSpec,
  time: SeedTime,
  order: number,
): PlannedRundown {
  return {
    order,
    createdAt: time.at(spec.createdSpec),
    creatorUserId: SHOW_CREATOR,
    projectKey: "heavy/h30",
    docKey: spec.docKey,
    airDate: time.day(time.nowAt + spec.dayOffset * DAY_MS),
    airAt: time.at("N+1:30") + spec.dayOffset * DAY_MS,
    targetMs: SHOW_TARGET_MS,
    write: (doc, ids, by) => writeShowRows(doc, spec.rows, ids, by),
  };
}

function planNewsRundown(
  spec: NewsRundownSpec,
  time: SeedTime,
  order: number,
): PlannedRundown {
  const isMidday = spec.edition === "1300";
  const baseAirAt = time.at(isMidday ? "N-5:00" : "N+0:30");
  return {
    order,
    createdAt: time.at(spec.createdSpec),
    creatorUserId: spec.creatorUserId,
    projectKey: "heavy/h31",
    docKey: spec.docKey,
    airDate: time.day(time.nowAt + spec.dayOffset * DAY_MS),
    airAt: baseAirAt + spec.dayOffset * DAY_MS,
    targetMs: isMidday ? MIDDAY_TARGET_MS : EVENING_TARGET_MS,
    write: (doc, ids, by) => writeNewsRows(doc, spec.rows, ids, by),
  };
}

function buildPlan(time: SeedTime): PlannedRundown[] {
  const shows = [...GOOD_EVENING_AIRED, ...GOOD_EVENING_CURRENT];
  const news = [
    ...LANNICK_TODAY_MIDDAY_EARLY,
    ...LANNICK_TODAY_MIDDAY_RECENT,
    ...LANNICK_TODAY_EVENING_EARLY,
    ...LANNICK_TODAY_EVENING_RECENT,
    ...LANNICK_TODAY_UPCOMING,
  ];
  const planned: PlannedRundown[] = [
    ...shows.map((spec, i) => planShowRundown(spec, time, i)),
    ...news.map((spec, i) => planNewsRundown(spec, time, shows.length + i)),
  ];
  return planned.toSorted(
    (a, b) => a.createdAt - b.createdAt || a.order - b.order,
  );
}

async function seedOneRundown(
  driver: SeedDriver,
  rundowns: SeedRundowns,
  task: PlannedRundown,
  ids: () => string,
): Promise<void> {
  const docId = seedDoc(task.docKey).docId;
  const home = projectHome(seedProject(task.projectKey).projectId);
  await driver.setTime(task.createdAt);
  await rundowns.create(task.creatorUserId, {
    docId,
    workspaceId: "heavy",
    home,
    airDate: task.airDate,
    airAt: task.airAt,
    targetMs: task.targetMs,
  });
  let storyDocIds: string[] = [];
  const session = await driver.open(task.creatorUserId, docId);
  try {
    await session.change((doc) => {
      storyDocIds = task.write(doc, ids, {
        userId: task.creatorUserId,
        now: () => task.createdAt,
      });
    });
  } finally {
    await session.close();
  }
  if (storyDocIds.length > 0)
    await rundowns.link(task.creatorUserId, "heavy", {
      rundownId: docId,
      storyDocIds,
    });
}

async function seedAllRundowns(
  context: SeedContext,
  driver: SeedDriver,
  rundowns: SeedRundowns,
): Promise<void> {
  const tasks = buildPlan(context.time);
  for (const [i, task] of tasks.entries()) {
    await seedOneRundown(driver, rundowns, task, context.ids);
    const next = tasks[i + 1];
    if (next === undefined || next.createdAt > task.createdAt)
      await driver.setTime(task.createdAt + SETTLE_MS);
  }
}

export const HEAVY_RUNDOWNS_STEP: SeedStep = {
  id: "heavy-rundowns",
  workspace: "heavy",
  background: true,
  async run(context) {
    const { driver } = context;
    if (driver === null) return [];
    if (driver.rundowns === null) {
      context.skip("rundowns", "Lanternfield Studios rundowns");
      return [];
    }
    await seedAllRundowns(context, driver, driver.rundowns);
    return [];
  },
};
