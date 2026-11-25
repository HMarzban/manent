// As Ana, ensures Lannick One News day D is inside its air window with story 01 changed after being sent.
import { readRundown, scriptBody, setRundownFields } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import type { RundownJSON } from "@manent/schema";
import { seedDoc } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { SeedDriver } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

const ANA = "ana";
const RUNDOWN_KEY = "medium/lannick-one-news/rundowns/day";
const STORY_01_KEY = "medium/lannick-one-news/stories/01";
const FORTY_MINUTES_MS = 40 * 60_000;
const EARLIER_PHRASE = "thirty-one votes to nine";
const FINAL_PHRASE = "thirty-one votes to eight, with one abstention";

function isInsideAirWindow(rundown: RundownJSON, now: number): boolean {
  const { airAt, targetMs, windowLeadMs } = rundown.rundown;
  if (airAt === null) return false;
  let totalMs = 0;
  for (const row of rundown.rows) {
    if (row.kind === "header") continue;
    const typed = row.cells.dur?.value;
    const durMs = typeof typed === "number" ? typed : row.durationMs;
    totalMs += durMs ?? 0;
  }
  return (
    now >= airAt - windowLeadMs &&
    now <= airAt + Math.max(targetMs ?? 0, totalMs)
  );
}

function replaceBlockText(
  doc: CrdtDoc,
  blockId: string,
  from: string,
  to: string,
): void {
  let start = 0;
  while (start < from.length && from[start] === to[start]) start += 1;
  let end = 0;
  while (
    end < from.length - start &&
    end < to.length - start &&
    from[from.length - 1 - end] === to[to.length - 1 - end]
  )
    end += 1;
  scriptBody(doc).write((writer) => {
    writer.deleteText(blockId, start, from.length - start - end);
    writer.insertText(blockId, start, to.slice(start, to.length - end));
  });
}

async function rewriteStoryPhrase(
  driver: SeedDriver,
  storyDocId: string,
  fromPhrase: string,
  toPhrase: string,
): Promise<void> {
  const session = await driver.open(ANA, storyDocId);
  try {
    const blocks = blocksOf(scriptBody(session.doc).materialize());
    const target = blocks.find((block) =>
      blockText(block).includes(fromPhrase),
    );
    const blockId = target?.attrs.id ?? null;
    if (target === undefined || blockId === null) return;
    const currentText = blockText(target);
    const nextText = currentText.replace(fromPhrase, toPhrase);
    await session.change((doc) =>
      replaceBlockText(doc, blockId, currentText, nextText),
    );
  } finally {
    await session.close();
  }
}

export const NEWS_STORY_01_CHANGED: TourPreparation = {
  id: "news-story-01-changed",
  async run(driver, time) {
    const now = time.seedAt;
    const rundownDocId = seedDoc(RUNDOWN_KEY).docId;
    const storyDocId = seedDoc(STORY_01_KEY).docId;

    let row01Id: string | null = null;
    const rundownSession = await driver.open(ANA, rundownDocId);
    try {
      const rundown = readRundown(rundownSession.doc);
      if (isInsideAirWindow(rundown, now)) return READY;
      const row01 = rundown.rows.find(
        (row) => row.kind === "script" && row.docId === storyDocId,
      );
      if (row01 === undefined)
        throw new SeedDriverError(
          "unavailable",
          `${RUNDOWN_KEY} has no row for ${STORY_01_KEY}`,
        );
      row01Id = row01.id;
      await rundownSession.change((doc) =>
        setRundownFields(doc, { airAt: now + FORTY_MINUTES_MS }),
      );
    } finally {
      await rundownSession.close();
    }

    if (driver.prompter === null)
      throw new SeedDriverError("unavailable", "the server has no prompter");

    await rewriteStoryPhrase(driver, storyDocId, FINAL_PHRASE, EARLIER_PHRASE);
    await driver.prompter.send(ANA, rundownDocId, row01Id);
    await rewriteStoryPhrase(driver, storyDocId, EARLIER_PHRASE, FINAL_PHRASE);
    return READY;
  },
};
