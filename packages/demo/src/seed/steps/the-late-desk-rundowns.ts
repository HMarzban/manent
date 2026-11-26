// The Late Desk rundowns for days D-1, D and D+1, with version history, Leo's Can view role and row 8's previous duration on day D.
import {
  insertRows,
  moveRows,
  readRundown,
  removeRows,
  setCell,
} from "@manent/crdt";
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

const WARM_UP_SPEC: Extract<ShowRowSpec, { kind: "item" }> = Object.freeze({
  kind: "item",
  segment: "Warm-up: audience Q&A",
  writer: null,
  durMs: 60_000,
});
const TEASE_SEGMENT = "Tease guest one";
const BAND_INTRO_SEGMENT = "Band intro";
const MONOLOGUE_SEGMENT = "Monologue";
const MAILBAG_SEGMENT = "Benny's Mailbag";

/** Initial day D rows before the afternoon reshuffle: extra warm-up row, Band intro before Monologue, and no Tease guest one yet. */
function morningDayRows(): readonly ShowRowSpec[] {
  const withoutTease = LATE_DESK_DAY_ROWS.filter(
    (spec) => spec.kind === "header" || spec.segment !== TEASE_SEGMENT,
  );
  const bandIndex = withoutTease.findIndex(
    (spec) => spec.kind !== "header" && spec.segment === BAND_INTRO_SEGMENT,
  );
  const monoIndex = withoutTease.findIndex(
    (spec) => spec.kind !== "header" && spec.segment === MONOLOGUE_SEGMENT,
  );
  if (bandIndex === -1 || monoIndex === -1)
    throw new RangeError("The Late Desk day rows lack Band intro or Monologue");
  const reordered = [...withoutTease];
  const [band] = reordered.splice(bandIndex, 1);
  reordered.splice(monoIndex, 0, band!);
  // insert the temporary warm-up row directly after ACT ONE so removing it later shows a removed row in History
  reordered.splice(1, 0, WARM_UP_SPEC);
  return reordered;
}

async function refineDayLineup(
  context: SeedContext,
  driver: SeedDriver,
  dayRows: ReadonlyMap<string, string>,
): Promise<void> {
  const dayDocId = seedDoc(`${PROJECT_KEY}/rundowns/day`).docId;
  if (driver.capabilities.has("history")) {
    await driver.setTime(context.time.at("N−8:55"));
    await driver.nameDraft("ana", dayDocId, "Morning lineup");
  }
  const warmUpId = dayRows.get(WARM_UP_SPEC.segment);
  const bandIntroId = dayRows.get(BAND_INTRO_SEGMENT);
  const monologueId = dayRows.get(MONOLOGUE_SEGMENT);
  const mailbagId = dayRows.get(MAILBAG_SEGMENT);
  const teaseSpec = LATE_DESK_DAY_ROWS.find(
    (spec) => spec.kind === "item" && spec.segment === TEASE_SEGMENT,
  );
  if (
    warmUpId === undefined ||
    bandIntroId === undefined ||
    monologueId === undefined ||
    mailbagId === undefined ||
    teaseSpec === undefined ||
    teaseSpec.kind !== "item"
  )
    throw new RangeError(
      "The Late Desk day rundown lacks expected Act One rows",
    );
  const teaseId = context.ids();
  const updatedAt = context.time.at("N−4:30");
  await driver.setTime(updatedAt);
  const session = await driver.open("ana", dayDocId);
  try {
    const by = { userId: "ana", now: () => updatedAt };
    await session.change((doc) => {
      removeRows(doc, [warmUpId]);
      moveRows(doc, [bandIntroId], monologueId);
      insertRows(
        doc,
        [{ id: teaseId, kind: "item", docId: null, blockId: null }],
        mailbagId,
      );
      setCell(doc, teaseId, "segment", teaseSpec.segment, by);
      setCell(doc, teaseId, "dur", teaseSpec.durMs, by);
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
      rows: morningDayRows(),
    });
    await refineDayLineup(context, driver, dayRows);
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
    if (driver.sharing !== null) {
      await driver.sharing.grant(
        "ana",
        seedDoc(`${PROJECT_KEY}/rundowns/day`).docId,
        "leo",
        "view",
      );
    }
    return [];
  },
};
