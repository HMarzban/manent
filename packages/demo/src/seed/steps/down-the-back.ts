// Down the Back of Everything, the play made from the book.
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock } from "../../content/markup.ts";
import {
  DOWN_THE_BACK_FRONT,
  DOWN_THE_BACK_HEADINGS,
  DOWN_THE_BACK_SCENES_1_2,
} from "../../content/small/index.ts";
import type { SeedStep } from "../seed.ts";
import {
  checkPassages,
  createProject,
  createStory,
  projectEntry,
  replaySessions,
  setFormat,
} from "../story.ts";
import type { StoryDoc } from "../story.ts";

const PROJECT = "small/down-the-back";
const PLAY = `${PROJECT}/script`;

// Gran's three speeches in scene 1 before Sam trimmed them, by the text each was trimmed to
const UNTRIMMED: Readonly<Record<string, string>> = {
  "Spark. Feet.":
    "dialogue Spark. Feet. Both of them, on the floor, in shoes, where feet go.",
  "Your socks are on. Your feet are somewhere else entirely. Your mother's been asleep an hour, so anything you rescue comes in the back way.": `
dialogue Your socks are on. Your feet are somewhere else entirely.
parenthetical (lower)
dialogue Your mother's been asleep an hour, so anything you rescue comes in the back way.
parenthetical (before Spark can ask)
dialogue The back way, Spark. Not through my front door with the bell going.`,
  "People don't look, that's the trouble. They see a thing's broken and they stop looking.": `
dialogue People don't look, that's the trouble.
parenthetical (half to herself)
dialogue They see a thing's broken and they stop looking.
parenthetical (turning back to the shop)
dialogue Forty-one years I've watched them do it.`,
};

const PAGE_BREAK: SeedBlock = {
  element: "page_break",
  text: "",
  marks: [],
  kind: null,
};

/** The scenes as Sam first wrote them, before Gran's lines were trimmed. */
function untrimmed(scenes: readonly SeedBlock[]): SeedBlock[] {
  return scenes.flatMap((block) => {
    const before = UNTRIMMED[block.text];
    return before === undefined ? [block] : parseSeedText(before).blocks;
  });
}

export const DOWN_THE_BACK: SeedStep = {
  id: "down-the-back",
  workspace: "small",
  background: false,
  async run(context) {
    const entries = [projectEntry(PROJECT)];
    const { driver, ids } = context;
    if (driver === null) return entries;
    const story = createStory(context, "down-the-back");
    const doc: StoryDoc = { blocks: [], ids: [] };
    const writing = { userId: "sam", key: PLAY, doc, ids };
    // the front pages are three: the title page, the cast of characters and the setting, each ending its page
    const front = DOWN_THE_BACK_FRONT.trim()
      .split("\n\n")
      .map((page) => parseSeedText(page));
    const scenes = parseSeedText(DOWN_THE_BACK_SCENES_1_2);
    // the outline's ACT ONE is the one the written scenes open with
    const [, ...headings] = parseSeedText(DOWN_THE_BACK_HEADINGS).blocks;
    const [actOne, sceneOne, ...written] = scenes.blocks;
    const sceneTwo = written.find((b) => b.text === "Scene 2: The Box")!;
    const frontPages = front.flatMap((page) => [...page.blocks, PAGE_BREAK]);
    await story.at("D−6 10:12");
    await createProject(driver, {
      userId: "sam",
      projectKey: PROJECT,
      at: context.time.at("D−6 10:12"),
    });
    await story.sessionWith("sam", PLAY, async (s) => {
      await setFormat(context, s, PLAY);
      const outline = [actOne!, ...headings];
      doc.ids.push(...(await story.write(s, outline, null, ids)));
      doc.blocks.push(...outline);
    });
    await replaySessions(
      story,
      writing,
      [...frontPages, ...doc.blocks],
      ["D−6 10:58"],
    );
    // chapter one split at its break into the play's first two scenes
    const opening = doc.blocks.indexOf(actOne!);
    const split = [...doc.blocks];
    split.splice(opening + 1, 0, sceneOne!, sceneTwo);
    await replaySessions(story, writing, split, ["D−6 16:50", "D−5 10:20"]);
    const draft = [...frontPages, ...untrimmed(scenes.blocks), ...headings];
    await replaySessions(story, writing, draft, [
      "D−5 14:40",
      "D−4 14:40",
      "D−3 14:40",
    ]);
    await replaySessions(
      story,
      writing,
      [...frontPages, ...scenes.blocks, ...headings],
      ["D−1 19:05"],
    );
    await checkPassages(driver, { key: PLAY, doc, where: "down-the-back" }, [
      ...front,
      scenes,
    ]);
    return entries;
  },
};
