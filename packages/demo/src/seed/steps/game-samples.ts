// Game samples: the first chapter of Twelve on Foot and its barks, and The Keeper's Logbook, as Sam wrote them.
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import {
  FOG_BELL_SCENE_4,
  KEEPERS_LOGBOOK,
} from "../../content/medium/game-samples.ts";
import { TWELVE_ON_FOOT_GUIDE } from "../../generate/banks/medium/twelve-on-foot.ts";
import { sessionsBetween } from "../../generate/drafts.ts";
import { fitToPages } from "../../generate/fit.ts";
import { generateScenes } from "../../generate/grammar.ts";
import type { SeedSession } from "../driver.ts";
import type { SeedStep } from "../seed.ts";
import { createStory } from "../story.ts";
import { applyChanges } from "./the-lamp-room.ts";
import {
  append,
  block,
  checkPassages,
  createDocument,
  projectEntry,
  rewrite,
  runInOrder,
} from "./the-late-desk.ts";
import type { Replica, StoryEvent, Telling } from "./the-late-desk.ts";

const PROJECT_KEY = "medium/game-samples";
const CHAPTER_KEY = `${PROJECT_KEY}/twelve-on-foot-1`;
const BARKS_KEY = `${PROJECT_KEY}/barks`;
const LOGBOOK_KEY = `${PROJECT_KEY}/keepers-logbook`;
const CHAPTER_PAGES = 22;
const FOG_BELL_SCENE = 4;
// Cal's knock line and Pike's reply as they read until Sam rewrote both on D−1, each keeping its block
const FIRST_WORDING: Readonly<Record<string, string>> = {
  "Ferry's full, whoever you are. I'll need to see a ticket.":
    "Anyone in there? Passengers ride up in the lounge.",
  "There's a light on in your head. Go up and read your sister the sounder.":
    "Vans have lights. Go up and see if Ida wants you.",
};
// what Sam added to Esme's line about the storm on D−5, after Dana asked who turned the handle with her
const DAUGHTER = ", and my daughter turning it with me";

const CHAPTER_CREATED_AT = "D−16 10:30";
const CHAPTER_SESSIONS = [
  "D−15 10:00",
  "D−14 11:30",
  "D−13 15:00",
  "D−12 10:30",
  "D−11 14:00",
  "D−10 15:30",
  "D−8 15:30",
  "D−6 10:00",
  "D−5 16:00",
] as const;
const BARKS_AT = "D−10 11:00";
// the Logbook: created and begun at D−9, two sessions more, and the line Dana asked for at D−5 12:10
const LOGBOOK_SESSIONS = ["D−9 10:00", "D−8 11:00", "D−6 14:30"] as const;
const DAUGHTER_AT = "D−5 12:10";
const FOR_THE_MUSEUM_AT = "D−4 14:00";
const REWRITE_AT = "D−1 16:40";

const INK_LINE = "ink_line";

/**
 * The Logbook's source, one `ink_line` block per line, its indentation and its blank lines kept: the story's
 * line numbers count the blank ones, which parseSeedText refuses.
 */
function logbookPassage(): SeedPassage {
  const lines = KEEPERS_LOGBOOK.split("\n").filter((line) =>
    line.startsWith(INK_LINE),
  );
  return {
    blocks: lines.map((line) =>
      block(INK_LINE, line.slice(INK_LINE.length + 1)),
    ),
    pageStarts: [],
    numbers: [],
    marked: [],
    omitted: [],
  };
}

/** The chapter's first pass: its scenes written, scene 4 as it read before D−1, fitted to its pages. */
async function firstPass(
  telling: Telling,
  scene: readonly SeedBlock[],
): Promise<SeedBlock[]> {
  const { rng } = telling.context;
  const guide = TWELVE_ON_FOOT_GUIDE;
  const used = new Set<string>();
  const blocks: SeedBlock[] = [];
  let fixedAt = 0;
  for (const beat of guide.beats.filter((b) =>
    b.id.startsWith(`${CHAPTER_KEY}#`),
  )) {
    if (beat.scenes[0] !== FOG_BELL_SCENE) {
      blocks.push(...generateScenes(guide, beat, rng, used));
      continue;
    }
    fixedAt = blocks.length;
    blocks.push(...scene);
  }
  const layout = { format: guide.format, settings: {}, anchors: null };
  return fitToPages(
    blocks,
    [
      { generated: [0, fixedAt], mustStart: null },
      { generated: [fixedAt + scene.length, blocks.length], mustStart: null },
    ],
    {
      meter: telling.driver.meter,
      guide,
      rng,
      used,
      totals: [{ layout, pages: CHAPTER_PAGES }],
    },
  );
}

const barkLine = (bark: { text: string }): SeedBlock =>
  block("dialogue", bark.text);

/** The barks as one list: those that play at any time, then, under their condition, those once Finn is found. */
function barkBlocks(): SeedBlock[] {
  const { barks } = TWELVE_ON_FOOT_GUIDE;
  return [
    block("scene_heading", "INT. CAR DECK - NIGHT"),
    ...barks.filter((bark) => !bark.gated).map(barkLine),
    block("general", "{finn_found}"),
    ...barks.filter((bark) => bark.gated).map(barkLine),
  ];
}

/** Scene 4's blocks as they read before D−1: the same blocks, but for the two lines Sam rewrote then. */
const firstWording = (scene: readonly SeedBlock[]): SeedBlock[] =>
  scene.map((b) => {
    const first = FIRST_WORDING[b.text];
    return first === undefined ? b : { ...b, text: first };
  });

async function chapterEvents(
  telling: Telling,
  replica: Replica,
  scene: { final: readonly SeedBlock[]; earlier: readonly SeedBlock[] },
): Promise<StoryEvent[]> {
  const { final, earlier } = scene;
  const pass = await firstPass(telling, earlier);
  const outline = pass.filter((b) => b.element === "scene_heading");
  const sessions = sessionsBetween(outline, pass, CHAPTER_SESSIONS.length);
  const created = {
    key: CHAPTER_KEY,
    userId: "sam",
    at: CHAPTER_CREATED_AT,
    withProject: true,
  };
  const later = (at: string, fn: (s: SeedSession) => Promise<void>) => ({
    at,
    run: () => telling.story.sessionWith("sam", CHAPTER_KEY, fn),
  });
  return [
    {
      at: CHAPTER_CREATED_AT,
      run: () =>
        createDocument(telling, created, (s) =>
          append(telling, s, replica, outline),
        ),
    },
    ...CHAPTER_SESSIONS.map((at, i) =>
      later(at, (s) => applyChanges(telling, s, replica, sessions[i]!)),
    ),
    later(REWRITE_AT, async (s) => {
      for (const [i, b] of final.entries())
        if (earlier[i] !== b)
          await rewrite(
            s,
            replica,
            replica.blocks.indexOf(earlier[i]!),
            b.text,
          );
    }),
  ];
}

function logbookEvents(telling: Telling, replica: Replica): StoryEvent[] {
  const final = logbookPassage().blocks;
  const storm = final.findIndex((b) => b.text.includes(DAUGHTER));
  const early = final.with(storm, {
    ...final[storm]!,
    text: final[storm]!.text.replace(DAUGHTER, ""),
  });
  const [first, ...sessions] = sessionsBetween(
    [],
    early,
    LOGBOOK_SESSIONS.length,
  );
  const [createdAt, ...sessionTimes] = LOGBOOK_SESSIONS;
  const created = {
    key: LOGBOOK_KEY,
    userId: "sam",
    at: createdAt,
    withProject: false,
  };
  const later = (at: string, fn: (s: SeedSession) => Promise<void>) => ({
    at,
    run: () => telling.story.sessionWith("sam", LOGBOOK_KEY, fn),
  });
  return [
    {
      at: createdAt,
      run: () =>
        createDocument(telling, created, (s) =>
          applyChanges(telling, s, replica, first!),
        ),
    },
    ...sessionTimes.map((at, i) =>
      later(at, (s) => applyChanges(telling, s, replica, sessions[i]!)),
    ),
    later(DAUGHTER_AT, (s) => rewrite(s, replica, storm, final[storm]!.text)),
    {
      at: FOR_THE_MUSEUM_AT,
      run: async () =>
        void (await telling.story.name("sam", LOGBOOK_KEY, "For the museum")),
    },
  ];
}

async function tellGameSamples(telling: Telling): Promise<void> {
  const scene = parseSeedText(FOG_BELL_SCENE_4);
  const earlier = firstWording(scene.blocks);
  const chapter: Replica = { ids: [], blocks: [] };
  const logbook: Replica = { ids: [], blocks: [] };
  const barks = {
    key: BARKS_KEY,
    userId: "sam",
    at: BARKS_AT,
    withProject: false,
  };
  await runInOrder(telling, [
    ...(await chapterEvents(telling, chapter, {
      final: scene.blocks,
      earlier,
    })),
    {
      at: BARKS_AT,
      run: () =>
        createDocument(telling, barks, (s) =>
          append(telling, s, { ids: [], blocks: [] }, barkBlocks()),
        ),
    },
    ...logbookEvents(telling, logbook),
  ]);
  const sceneAt = chapter.blocks.indexOf(earlier[0]!);
  await checkPassages(telling, "game-samples", [
    { key: CHAPTER_KEY, passage: scene, firstBlockId: chapter.ids[sceneAt]! },
    {
      key: LOGBOOK_KEY,
      passage: logbookPassage(),
      firstBlockId: logbook.ids[0]!,
    },
  ]);
}

export const GAME_SAMPLES: SeedStep = {
  id: "game-samples",
  workspace: "medium",
  background: false,
  async run(context) {
    const { driver } = context;
    if (driver !== null)
      await tellGameSamples({
        context,
        driver,
        story: createStory(context, "game-samples"),
      });
    return projectEntry(PROJECT_KEY);
  },
};
