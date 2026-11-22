// The Long Night, from first draft to its revisions in production; first, the Writers' room's index and roles.
import { projectHome } from "@manent/sync-protocol";
import type { SeedBlock } from "../../content/markup.ts";
import { sessionsBetween } from "../../generate/drafts.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import type { SeedStep } from "../seed.ts";
import { createStory } from "../story.ts";
import { earlierDrafts, whiteDraft } from "./long-night-drafts.ts";
import { inProduction } from "./long-night-revisions.ts";
import {
  KEY,
  draftToward,
  isHeading,
  readTexts,
  replaced,
  replay,
  sceneOf,
  sit,
  writeTo,
} from "./long-night-telling.ts";
import type { Sitting, Telling } from "./long-night-telling.ts";

const PROJECT = seedProject("medium/the-long-night");
const ROLES = [
  { userId: "sam", role: "edit", capabilities: [] },
  {
    userId: "priya",
    role: "edit",
    capabilities: ["issue_revisions", "lock_page_numbers"],
  },
  { userId: "leo", role: "comment", capabilities: [] },
  {
    userId: "ana",
    role: "edit",
    capabilities: ["send_to_prompter", "edit_rundowns"],
  },
] as const;

const by = (userId: string, ats: readonly string[]): Sitting[] =>
  ats.map((at) => [userId, at] as const);
const ACTS_ONE_TWO = by("dana", [
  "D−84 15:40",
  "D−83 10:15",
  "D−82 11:30",
  "D−81 09:50",
  "D−80 14:20",
  "D−78 10:40",
  "D−77 16:05",
  "D−75 11:10",
  "D−73 15:30",
]);
const ACT_THREE = by("sam", ["D−72 14:10", "D−71 11:45"]);
const NOTES_BEFORE_PACE = [
  ...by("dana", ["D−64 10:20"]),
  ...by("sam", ["D−62 14:35"]),
  ...by("dana", ["D−60 09:40"]),
];
/** Sam shortens scene 61, Mr. Adeyemi's song, for pace. */
const PACE: Sitting = ["sam", "D−58 15:10"];
const NOTES_AFTER_PACE = [
  ...by("sam", ["D−57 11:25"]),
  ...by("dana", ["D−55 16:00"]),
  ...by("sam", ["D−54 10:50", "D−53 14:15"]),
  ...by("dana", ["D−51 11:35"]),
  ...by("sam", ["D−50 15:45"]),
];
const NETWORK_NOTES = by("dana", ["D−44 10:30", "D−42 14:50"]);
const DECLINED = by("sam", ["D−38 11:20", "D−34 15:35"]);
const TABLE_READ = by("dana", ["D−27 10:45"]);

/** Development: the outline's headings, three named drafts and the restore of scene 61, to the Shooting draft. */
async function development(t: Telling): Promise<void> {
  const white = await whiteDraft(t);
  const { first, second, tableRead, pace } = await earlierDrafts(t, white);
  const paced = (draft: readonly SeedBlock[]) =>
    draft.filter((b) => !pace.has(b));
  const actThree = first.indexOf(t.headings[74]!);
  let headingIds: string[] = [];
  await sit(t, ["dana", "D−84 10:02"], async (s) => {
    headingIds = await t.story.write(s, t.headings, null, t.context.ids);
    t.state.push(...t.headings);
  });
  const actsOneTwo = first.filter((b, i) => i < actThree || isHeading(b));
  await draftToward(t, ACTS_ONE_TWO, actsOneTwo, 0);
  await draftToward(t, ACT_THREE, first, 0);
  await t.story.at("D−71 18:30");
  await t.story.name("dana", KEY, "First draft");
  // the notes are shared out over every sitting to the Second draft, Sam's cut among them
  const afterPace = NOTES_AFTER_PACE.length;
  await draftToward(t, NOTES_BEFORE_PACE, second, afterPace + 1);
  await sit(t, PACE, async (s) => {
    await writeTo(t, s, paced(t.state));
    const shares = afterPace + 1;
    await replay(t, s, sessionsBetween(t.state, paced(second), shares)[0]!);
  });
  await draftToward(t, NOTES_AFTER_PACE, paced(second), 0);
  await t.story.at("D−49 17:50");
  await t.story.name("sam", KEY, "Second draft");
  const declined = DECLINED.length;
  await draftToward(t, NETWORK_NOTES, paced(tableRead), declined);
  await t.story.at("D−40 11:05");
  const song = t.headings[60]!;
  await t.story.restoreScene("dana", KEY, "First draft", headingIds[60]!);
  if (t.driver.capabilities.has("restore"))
    t.state = replaced(
      t.state,
      sceneOf(t.state, song),
      first.slice(...sceneOf(first, song)),
    );
  await draftToward(t, DECLINED, tableRead, 0);
  await t.story.at("D−32 16:00");
  await t.story.name("dana", KEY, "Table read draft");
  await draftToward(t, TABLE_READ, white, 0);
  await t.story.at("D−24 17:15");
  await t.story.name("dana", KEY, "Shooting draft");
}

export const THE_LONG_NIGHT: SeedStep = {
  id: "the-long-night",
  workspace: "medium",
  background: false,
  async run(context) {
    const entries = [{ project: PROJECT.title, documents: 1 }];
    const { driver } = context;
    if (driver === null) return entries;
    const story = createStory(context, "the-long-night");
    const doc = seedDoc(KEY);
    await story.at("D−84 10:02");
    await driver.workspace("dana", "medium", ROLES);
    await driver.create("dana", {
      docId: doc.docId,
      kind: doc.kind,
      home: projectHome(PROJECT.projectId),
      workspaceId: "medium",
    });
    await driver.index("dana", "medium", {
      projects: [PROJECT],
      documents: [doc],
      at: context.time.at("D−84 10:02"),
    });
    const t: Telling = {
      context,
      driver,
      story,
      texts: readTexts(),
      state: [],
      used: new Set(),
      fixed: new Set(),
      headings: [],
      omitted: new Set(),
    };
    await development(t);
    await inProduction(t);
    return entries;
  },
};
