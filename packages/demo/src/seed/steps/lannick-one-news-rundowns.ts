// Lannick One News rundowns for today and next week, with in-window sends and corrections on stories 01, 07 and 20.
import {
  insertRows,
  readRundown,
  scriptBody,
  setCell,
  setRowUnnumbered,
} from "@manent/crdt";
import type { CrdtDoc, NewRow } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import { projectHome } from "@manent/sync-protocol";
import {
  NEWS_CORRECTIONS,
  NEWS_DAY_ROWS,
  NEWS_NEXT_WEEK_ROWS,
  NEWS_TARGET_MS,
} from "../../content/medium/rundowns/news-rows.ts";
import type {
  NewsCorrection,
  NewsRowSpec,
} from "../../content/medium/rundowns/news-rows.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import type { SeedDriver } from "../driver.ts";
import type { SeedContext, SeedStep } from "../seed.ts";
import { DAY_MS } from "../time.ts";
import { replaceBlockText } from "./replace-block-text.ts";
import { drainUntil, settleScriptRows } from "./the-late-desk-rundowns.ts";

const PROJECT_KEY = "medium/lannick-one-news";
const DURATION_SETTLE_MS = 500;

interface NewsRundownInput {
  readonly docKey: string;
  readonly createdAtSpec: string;
  readonly dayOffset: number;
  readonly rows: readonly NewsRowSpec[];
}

function writeNewsCells(
  doc: CrdtDoc,
  rows: readonly { id: string; spec: NewsRowSpec }[],
  createdAt: number,
): void {
  const by = { userId: "ana", now: () => createdAt };
  for (const { id, spec } of rows) {
    if (spec.kind === "header") {
      setCell(doc, id, "story", spec.title, by);
      continue;
    }
    setCell(doc, id, "story", spec.story, by);
    if (spec.presenter !== null)
      setCell(doc, id, "presenter", spec.presenter, by);
    setCell(doc, id, "type", spec.type, by);
    if (spec.kind === "item") {
      setCell(doc, id, "dur", spec.durMs, by);
      if (spec.unnumbered) setRowUnnumbered(doc, id, true);
    }
  }
}

async function seedNewsRundown(
  context: SeedContext,
  driver: SeedDriver,
  home: string,
  input: NewsRundownInput,
): Promise<Map<string, string>> {
  const { time, ids } = context;
  const rundowns = driver.rundowns!;
  const createdAt = time.at(input.createdAtSpec);
  const airAt = time.at("N") + input.dayOffset * DAY_MS;
  const airDate = time.day(time.nowAt + input.dayOffset * DAY_MS);
  const { docId } = seedDoc(input.docKey);
  await driver.setTime(createdAt);
  await rundowns.create("ana", {
    docId,
    workspaceId: "medium",
    home,
    airDate,
    airAt,
    targetMs: NEWS_TARGET_MS,
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
      writeNewsCells(doc, planned, createdAt);
    });
    if (storyDocIds.length > 0)
      await settleScriptRows(driver, session, createdAt, {
        expectAutoSend: driver.prompter !== null,
      });
  } finally {
    await session.close();
  }
  const byRowKey = new Map<string, string>();
  for (const { id, spec } of planned)
    if (spec.kind === "script") byRowKey.set(spec.rowKey, id);
  return byRowKey;
}

interface SavedBlock {
  readonly docId: string;
  readonly blockId: string;
  readonly finalText: string;
  readonly earlierText: string;
}

async function stageEarlierWording(
  driver: SeedDriver,
  correction: NewsCorrection,
): Promise<SavedBlock> {
  const { docId } = seedDoc(`${PROJECT_KEY}/stories/${correction.rowKey}`);
  const session = await driver.open("ana", docId);
  try {
    const blocks = blocksOf(scriptBody(session.doc).materialize());
    const target =
      correction.finalPhrase === null
        ? blocks.at(-1)
        : blocks.find((b) => blockText(b).includes(correction.finalPhrase!));
    const blockId = target?.attrs.id ?? null;
    if (target === undefined || blockId === null)
      throw new RangeError(
        `story ${correction.rowKey} lacks expected text for correction`,
      );
    const finalText = blockText(target);
    const earlierText =
      correction.finalPhrase === null
        ? correction.earlierPhrase
        : finalText.replace(correction.finalPhrase, correction.earlierPhrase);
    await session.change((doc) =>
      replaceBlockText(doc, blockId, finalText, earlierText),
    );
    return { docId, blockId, finalText, earlierText };
  } finally {
    await session.close();
  }
}

async function applyCorrectionsInWindow(
  context: SeedContext,
  driver: SeedDriver,
  rundownId: string,
  rowIds: ReadonlyMap<string, string>,
): Promise<void> {
  const { time } = context;
  const prompter = driver.prompter;
  if (prompter === null) {
    context.skip("prompter", "Lannick One News in-window sends");
    return;
  }
  await driver.setTime(time.at("N−0:59"));
  const saved = new Map<string, SavedBlock>();
  for (const correction of NEWS_CORRECTIONS)
    saved.set(correction.rowKey, await stageEarlierWording(driver, correction));

  for (const correction of NEWS_CORRECTIONS) {
    const rowId = rowIds.get(correction.rowKey);
    if (rowId === undefined)
      throw new RangeError(`news rundown lacks row ${correction.rowKey}`);
    await driver.setTime(time.at(correction.sentAt));
    await prompter.send("ana", rundownId, rowId);
  }

  const watcher = await driver.open("ana", rundownId);
  try {
    for (const correction of NEWS_CORRECTIONS) {
      const rowId = rowIds.get(correction.rowKey)!;
      const block = saved.get(correction.rowKey)!;
      const changedAt = time.at(correction.changedAt);
      await driver.setTime(changedAt);
      const story = await driver.open("ana", block.docId);
      try {
        await story.change((doc) =>
          replaceBlockText(
            doc,
            block.blockId,
            block.earlierText,
            block.finalText,
          ),
        );
      } finally {
        await story.close();
      }
      await driver.setTime(changedAt + DURATION_SETTLE_MS);
      await drainUntil(
        watcher.doc,
        (doc) =>
          readRundown(doc).rows.find((row) => row.id === rowId)?.prompter
            ?.state === "changed",
      );
    }
  } finally {
    await watcher.close();
  }
}

export const LANNICK_ONE_NEWS_RUNDOWNS: SeedStep = {
  id: "lannick-one-news-rundowns",
  workspace: "medium",
  background: false,
  async run(context) {
    const { driver } = context;
    if (driver === null) return [];
    if (driver.rundowns === null) {
      context.skip("rundowns", "Lannick One News rundowns");
      return [];
    }
    const home = projectHome(seedProject(PROJECT_KEY).projectId);
    const dayRowIds = await seedNewsRundown(context, driver, home, {
      docKey: `${PROJECT_KEY}/rundowns/day`,
      createdAtSpec: "N−4:10",
      dayOffset: 0,
      rows: NEWS_DAY_ROWS,
    });
    await seedNewsRundown(context, driver, home, {
      docKey: `${PROJECT_KEY}/rundowns/day-plus-7`,
      createdAtSpec: "N−3:00",
      dayOffset: 7,
      rows: NEWS_NEXT_WEEK_ROWS,
    });
    const dayRundownId = seedDoc(`${PROJECT_KEY}/rundowns/day`).docId;
    await applyCorrectionsInWindow(context, driver, dayRundownId, dayRowIds);
    return [];
  },
};
