// Lannick One News: tonight's stories as Ana wrote them, story 01 through the vote and its corrected count.
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock } from "../../content/markup.ts";
import {
  NEWS_STORY_01,
  NEWS_STORY_01_STAGES,
  NEWS_STORY_07,
  NEWS_STORY_40,
} from "../../content/medium/lannick-one-news.ts";
import { NEWS_GUIDE } from "../../generate/banks/medium/lannick-one-news.ts";
import { seedDoc } from "../catalogue.ts";
import type { SeedSession } from "../driver.ts";
import type { SeedStep } from "../seed.ts";
import { createStory } from "../story.ts";
import { applyChanges } from "./the-lamp-room.ts";
import {
  append,
  beforeNow,
  checkPassages,
  createDocument,
  projectEntry,
  rewrite,
  runInOrder,
  storyBlocks,
} from "./the-late-desk.ts";
import type { Replica, StoryEvent, Telling } from "./the-late-desk.ts";

const PROJECT_KEY = "medium/lannick-one-news";
const storyKey = (row: string): string => `${PROJECT_KEY}/stories/${row}`;
// the stories written from the guide, one every five minutes from N−4:00
const FIRST_STORY_MINUTES = 240;
const STORY_GAP_MINUTES = 5;
// story 20's last line before the shelter asked for its website to be read instead of its phone number
const SHELTER_ROW = "20";
const SHELTER_BY_PHONE =
  "The shelter asks anyone who can help to ring its foster line. The number is on your screen now.";

/** At `at`, Ana creates the story `row` and writes `blocks` into it, and into `options.replica`. */
function written(
  telling: Telling,
  row: string,
  at: string,
  blocks: readonly SeedBlock[],
  options: { replica: Replica; withProject: boolean },
): StoryEvent {
  const doc = {
    key: storyKey(row),
    userId: "ana",
    at,
    withProject: options.withProject,
  };
  return {
    at,
    run: () =>
      createDocument(telling, doc, (session) =>
        append(telling, session, options.replica, blocks),
      ),
  };
}

/** A later session of Ana's on the story `row`. */
function changed(
  telling: Telling,
  row: string,
  at: string,
  fn: (session: SeedSession) => Promise<void>,
): StoryEvent {
  return { at, run: () => telling.story.sessionWith("ana", storyKey(row), fn) };
}

/** The 36 stories written from the guide, story 20 with its first last line, and that line's change at N−0:30. */
function guideEvents(telling: Telling): StoryEvent[] {
  return NEWS_GUIDE.stories.flatMap((story, i) => {
    const row = story.slug.slice("stories/".length);
    const at = beforeNow(FIRST_STORY_MINUTES - i * STORY_GAP_MINUTES);
    const blocks = storyBlocks(story, seedDoc(storyKey(row)).title);
    const replica: Replica = { ids: [], blocks: [] };
    const options = { replica, withProject: i === 0 };
    if (row !== SHELTER_ROW)
      return [written(telling, row, at, blocks, options)];
    const last = blocks.length - 1;
    const first = blocks.with(last, {
      ...blocks[last]!,
      text: SHELTER_BY_PHONE,
    });
    return [
      written(telling, row, at, first, options),
      changed(telling, row, "N−0:30", (s) =>
        rewrite(s, replica, last, blocks[last]!.text),
      ),
    ];
  });
}

/** Story 01 from the first copy to the clerk's count: the vote reported, the package cut, the count corrected. */
function voteEvents(telling: Telling, replica: Replica): StoryEvent[] {
  const final = parseSeedText(NEWS_STORY_01).blocks;
  const [expected, firstCount] = parseSeedText(NEWS_STORY_01_STAGES).blocks;
  const opening = final.findIndex((b) => b.element === "dialogue");
  const cues = final.findIndex((b) => b.text.startsWith("[VT:"));
  const cuesEnd = final.findIndex((b) => b.text.startsWith("[OUTCUE")) + 1;
  const early = [...final.slice(0, cues), ...final.slice(cuesEnd)].with(
    opening,
    expected!,
  );
  const options = { replica, withProject: false };
  const packaged = final
    .slice(cues, cuesEnd)
    .map((block, k) => ({ op: "insert" as const, at: cues + k, block }));
  return [
    written(telling, "01", "N−3:10", early, options),
    changed(telling, "01", "N−2:29", (s) =>
      rewrite(s, replica, opening, firstCount!.text),
    ),
    changed(telling, "01", "N−1:50", (s) =>
      applyChanges(telling, s, replica, packaged),
    ),
    changed(telling, "01", "N−0:44", (s) =>
      rewrite(s, replica, opening, final[opening]!.text),
    ),
  ];
}

/** Story 07 as first written, with the last sailing at nine, and the operator's change at N−0:39. */
function galeEvents(telling: Telling, replica: Replica): StoryEvent[] {
  const final = parseSeedText(NEWS_STORY_07).blocks;
  const sailing = final.findIndex((b) =>
    b.text.includes("leaves Ardle at eight tonight"),
  );
  const was = final[sailing]!;
  const early = final.with(sailing, {
    ...was,
    text: was.text.replace(
      "leaves Ardle at eight tonight",
      "leaves Ardle at nine",
    ),
  });
  return [
    written(telling, "07", "N−2:00", early, { replica, withProject: false }),
    changed(telling, "07", "N−0:39", (s) =>
      rewrite(s, replica, sailing, was.text),
    ),
  ];
}

async function tellNews(telling: Telling): Promise<void> {
  const vote: Replica = { ids: [], blocks: [] };
  const gale: Replica = { ids: [], blocks: [] };
  const closer: Replica = { ids: [], blocks: [] };
  const closing = parseSeedText(NEWS_STORY_40).blocks;
  await runInOrder(telling, [
    ...guideEvents(telling),
    ...voteEvents(telling, vote),
    ...galeEvents(telling, gale),
    written(telling, "40", "N−1:40", closing, {
      replica: closer,
      withProject: false,
    }),
  ]);
  await checkPassages(telling, NEWS_GUIDE.project, [
    {
      key: storyKey("01"),
      passage: parseSeedText(NEWS_STORY_01),
      firstBlockId: vote.ids[0]!,
    },
    {
      key: storyKey("07"),
      passage: parseSeedText(NEWS_STORY_07),
      firstBlockId: gale.ids[0]!,
    },
    {
      key: storyKey("40"),
      passage: parseSeedText(NEWS_STORY_40),
      firstBlockId: closer.ids[0]!,
    },
  ]);
}

export const LANNICK_ONE_NEWS: SeedStep = {
  id: "lannick-one-news",
  workspace: "medium",
  background: false,
  async run(context) {
    const { driver } = context;
    if (driver !== null)
      await tellNews({
        context,
        driver,
        story: createStory(context, "lannick-one-news"),
      });
    return projectEntry(PROJECT_KEY);
  },
};
