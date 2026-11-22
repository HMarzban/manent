// Every Key But One, from its first draft to the scene put back.
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import { parseSeedText } from "../../content/markup.ts";
import {
  EKBO_SCENE_14_FIRST,
  EKBO_SCENE_14_SECOND,
} from "../../content/small/index.ts";
import { deriveDrafts, sessionsBetween } from "../../generate/drafts.ts";
import { fitToPages } from "../../generate/fit.ts";
import type { PageMeter, SeedLayout } from "../../generate/fit.ts";
import {
  EKBO_GUIDE,
  createUsedLines,
  generateScenes,
} from "../../generate/index.ts";
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
// the two voicemail scenes the second draft cut, each a copy of the van's beat, put before these scenes
const CUT_BEFORE_SCENES = [18, 27] as const;
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

// the index of scene `scene`'s heading, counting from 1; the end of the script past its last scene
function headingAt(blocks: readonly SeedBlock[], scene: number): number {
  const headings = blocks.flatMap((b, i) =>
    b.element === "scene_heading" ? [i] : [],
  );
  return headings[scene - 1] ?? blocks.length;
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

async function buildDrafts(meter: PageMeter, rng: Rng): Promise<Drafts> {
  const guide = EKBO_GUIDE;
  const used = createUsedLines();
  const sceneSecond = parseSeedText(EKBO_SCENE_14_SECOND);
  const sceneFirst = parseSeedText(EKBO_SCENE_14_FIRST).blocks;
  const beats = guide.beats.filter((b) => b.id.startsWith(`${SCRIPT}#`));
  const generated: SeedBlock[] = [];
  for (const [i, beat] of beats.entries()) {
    if (beat.id === `${SCRIPT}#14`) {
      generated.push(...sceneSecond.blocks);
      for (const block of sceneSecond.blocks) used.pass(block);
    } else
      generated.push(...generateScenes(guide, ownPages(beats, i), rng, used));
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
  // the cut scenes make the first draft longer than it was named at, so deriving it only takes units out
  const short =
    FIRST_DRAFT_PAGES + 1 - (await meter.pages(beforeAnswer, LAYOUT)).length;
  const van = beats.find((b) => b.id === VAN_BEAT)!;
  const cutPages = Math.max(1, Math.ceil(short / CUT_BEFORE_SCENES.length));
  const longer = [...beforeAnswer];
  for (const scene of CUT_BEFORE_SCENES.toReversed()) {
    const cut = generateScenes(
      guide,
      { ...van, pages: [1, cutPages] },
      rng,
      used,
    );
    longer.splice(headingAt(longer, scene), 0, ...cut);
  }
  const at = longer.indexOf(sceneFirst[0]!);
  const fixed = new Set(sceneFirst.map((_, i) => at + i));
  const [first] = await deriveDrafts(
    longer,
    [
      { name: "First draft", pages: FIRST_DRAFT_PAGES },
      { name: null, pages: WORKING_PAGES },
    ],
    { fixed, guide, rng, meter, layout: LAYOUT },
  );
  return { first: first!, beforeAnswer, working, sceneFirst, sceneSecond };
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
