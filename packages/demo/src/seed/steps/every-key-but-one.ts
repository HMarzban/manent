// Every Key But One, from its first draft to the scene put back.
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import { parseSeedText } from "../../content/markup.ts";
import {
  EKBO_SCENE_14_FIRST,
  EKBO_SCENE_14_SECOND,
} from "../../content/small/index.ts";
import { sessionsBetween } from "../../generate/drafts.ts";
import { fitToPages } from "../../generate/fit.ts";
import type { PageMeter, SeedLayout } from "../../generate/fit.ts";
import { LINES_PER_PAGE } from "../../generate/grammar.ts";
import {
  EKBO_GUIDE,
  SeedBuildError,
  checkGenerated,
  createUsedLines,
  generateScenes,
} from "../../generate/index.ts";
import type { UsedLines } from "../../generate/index.ts";
import type { Rng } from "../rng.ts";
import type { SeedStep } from "../seed.ts";
import {
  checkPassages,
  createProject,
  createStory,
  ownPages,
  projectEntry,
  replayChanges,
  replaySessions,
  sessionTimes,
} from "../story.ts";
import type { StoryDoc } from "../story.ts";

const PROJECT = "small/every-key-but-one";
const SCRIPT = `${PROJECT}/script`;
const LAYOUT: SeedLayout = {
  format: "screenplay",
  settings: {},
  anchors: null,
};
const WORKING_PAGES = 99;
const FIRST_DRAFT_PAGES = 104;
// the two voicemail scenes the second draft cut, each a copy of the van's beat, stood before these scenes
const CUT_BEFORE_SCENES: readonly number[] = [18, 27];
const CUT_PAGES = 2;
const VAN_BEAT = `${SCRIPT}#22`;

/** The script as each draft holds it, and its fixed scene 14 in each. */
interface Drafts {
  first: SeedBlock[];
  /** Working with scene 14 as the first draft has it: the second draft before Nell's comment was answered. */
  beforeAnswer: SeedBlock[];
  working: SeedBlock[];
  sceneFirst: readonly SeedBlock[];
  sceneSecond: SeedPassage;
}

/** A cut scene and the heading it stood before. */
interface Cut {
  before: SeedBlock;
  blocks: SeedBlock[];
}

/** `blocks` with the run `from` replaced by `to`, found by identity. */
function swapped(
  blocks: readonly SeedBlock[],
  from: readonly SeedBlock[],
  to: readonly SeedBlock[],
): SeedBlock[] {
  const at = blocks.indexOf(from[0]!);
  return [...blocks.slice(0, at), ...to, ...blocks.slice(at + from.length)];
}

/** `blocks` with each cut put back before its heading. */
function withCuts(
  blocks: readonly SeedBlock[],
  cuts: readonly Cut[],
): SeedBlock[] {
  const longer = [...blocks];
  for (const cut of cuts) {
    const at = longer.indexOf(cut.before);
    if (at === -1)
      throw new RangeError(
        `the script no longer holds the heading "${cut.before.text}"`,
      );
    longer.splice(at, 0, ...cut.blocks);
  }
  return longer;
}

/** Throws SeedBuildError "rules_broken" on the first generator rule `draft` breaks outside the `fixed` blocks. */
function checkDraft(
  draft: readonly SeedBlock[],
  name: string,
  fixed: readonly SeedBlock[],
): void {
  const issue = checkGenerated(
    draft,
    EKBO_GUIDE,
    LINES_PER_PAGE.screenplay,
  ).find((found) => !fixed.includes(draft[found.blockIndex]!));
  if (issue !== undefined)
    throw new SeedBuildError(
      "rules_broken",
      `${EKBO_GUIDE.project}: ${name}, block ${issue.blockIndex}: ${issue.code}`,
    );
}

async function buildDrafts(meter: PageMeter, rng: Rng): Promise<Drafts> {
  const guide = EKBO_GUIDE;
  const used = createUsedLines();
  // a cut scene is drawn where it stands without moving the current line on, so what follows it is no nearer to
  // what came before it in Working, which lacks it, and only further in the first draft, which holds it
  const inPlace: UsedLines = { ...used, pass: () => {} };
  const sceneSecond = parseSeedText(EKBO_SCENE_14_SECOND);
  const sceneFirst = parseSeedText(EKBO_SCENE_14_FIRST).blocks;
  const beats = guide.beats.filter((b) => b.id.startsWith(`${SCRIPT}#`));
  const van = beats.find((b) => b.id === VAN_BEAT);
  if (van === undefined)
    throw new RangeError(
      `the guide of ${guide.project} has no beat ${VAN_BEAT}`,
    );
  const generated: SeedBlock[] = [];
  const cuts: Cut[] = [];
  for (const [i, beat] of beats.entries()) {
    if (beat.id === `${SCRIPT}#14`) {
      generated.push(...sceneSecond.blocks);
      for (const block of sceneSecond.blocks) used.pass(block);
      continue;
    }
    const cut = CUT_BEFORE_SCENES.includes(beat.scenes[0])
      ? generateScenes(guide, { ...van, pages: [1, CUT_PAGES] }, rng, inPlace)
      : null;
    const scenes = generateScenes(guide, ownPages(beats, i), rng, used);
    if (cut !== null) cuts.push({ before: scenes[0]!, blocks: cut });
    generated.push(...scenes);
  }
  const after = generated.indexOf(sceneSecond.blocks.at(-1)!) + 1;
  const working = await fitToPages(
    generated,
    [{ generated: [after, generated.length], mustStart: null }],
    {
      meter,
      guide,
      rng,
      used,
      totals: [{ layout: LAYOUT, pages: WORKING_PAGES }],
    },
  );
  const beforeAnswer = swapped(working, sceneSecond.blocks, sceneFirst);
  const longer = withCuts(beforeAnswer, cuts);
  // only the script's end makes the first draft its length: units Working has that were not yet written, or actions it lost
  const end = longer.indexOf(sceneFirst.at(-1)!) + 1;
  const first = await fitToPages(
    longer,
    [{ generated: [end, longer.length], mustStart: null }],
    {
      meter,
      guide,
      rng,
      used,
      totals: [{ layout: LAYOUT, pages: FIRST_DRAFT_PAGES }],
    },
  );
  checkDraft(first, "First draft", sceneFirst);
  checkDraft(beforeAnswer, "the second draft before scene 14", sceneFirst);
  checkDraft(working, "Working", sceneSecond.blocks);
  return { first, beforeAnswer, working, sceneFirst, sceneSecond };
}

export const EVERY_KEY_BUT_ONE: SeedStep = {
  id: "every-key-but-one",
  workspace: "small",
  background: false,
  async run(context) {
    const entries = [projectEntry(PROJECT)];
    const { driver, rng, ids } = context;
    if (driver === null) return entries;
    const story = createStory(context, "every-key-but-one");
    const drafts = await buildDrafts(story.meter, rng);
    const doc: StoryDoc = { blocks: [], ids: [] };
    const writing = { userId: "sam", key: SCRIPT, doc, ids };
    // Sam's outline: the first draft's scene headings
    await story.at("D−60");
    await createProject(driver, {
      userId: "sam",
      projectKey: PROJECT,
      at: context.time.at("D−60"),
    });
    const outline = drafts.first.filter((b) => b.element === "scene_heading");
    await story.sessionWith("sam", SCRIPT, async (s) => {
      doc.ids.push(...(await story.write(s, outline, null, ids)));
      doc.blocks.push(...outline);
    });
    await replaySessions(
      story,
      writing,
      drafts.first,
      sessionTimes(58, 32, 11),
    );
    await story.at("D−31 18:10");
    await story.name("sam", SCRIPT, "First draft");
    // the second draft: eight of its twelve sessions, then scene 14 rewritten for Nell on D−12, then the last four
    const secondRuns = sessionsBetween(drafts.first, drafts.beforeAnswer, 12);
    for (const [i, at] of sessionTimes(26, 13, 8).entries()) {
      await story.at(at);
      await story.sessionWith("sam", SCRIPT, (s) =>
        replayChanges(s, doc, secondRuns[i]!, ids),
      );
    }
    const answered = swapped(
      doc.blocks,
      drafts.sceneFirst,
      drafts.sceneSecond.blocks,
    );
    await replaySessions(story, writing, answered, ["D−12 14:40"]);
    await replaySessions(
      story,
      writing,
      drafts.working,
      sessionTimes(10, 4, 4),
    );
    await story.at("D−3 18:00");
    await story.name("sam", SCRIPT, "Second draft — Act One (for Nell)");
    await checkPassages(
      driver,
      { key: SCRIPT, doc, where: EKBO_GUIDE.project },
      [drafts.sceneSecond],
    );
    return entries;
  },
};
