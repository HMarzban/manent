// Multi-camera (Platform Two) and Animation (Tin Boat) showcase seed builders for Writers' room.
import type { EpisodeEntry } from "@manent/crdt";
import { parseSeedText } from "../../content/markup.ts";
import {
  PLATFORM_TWO_101_RUNTHROUGH_LINE,
  PLATFORM_TWO_101_TABLE,
  PLATFORM_TWO_102,
  PLATFORM_TWO_103_OUTLINE,
  PLATFORM_TWO_EARLY_PITCH,
  PLATFORM_TWO_NAMES,
  PLATFORM_TWO_SEASONS,
  PLATFORM_TWO_STORYLINES,
  TIN_BOAT_101_PICKUP_REWRITES,
  TIN_BOAT_101_RECORD,
  TIN_BOAT_102,
  TIN_BOAT_LADDER,
  TIN_BOAT_NAMES,
  TIN_BOAT_SEASONS,
  TIN_BOAT_STORYLINES,
  platformTwoBoardCards,
  tinBoatBoardCards,
} from "../../content/medium/writers-room-series.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import { makeStoryboardPng } from "../png.ts";
import type { SeedContext } from "../seed.ts";
import { createProject } from "../story.ts";
import {
  graphicBlock,
  replaceTextInSession,
  writeInitial,
} from "./writers-room-showcase-helpers.ts";

export const PLATFORM_TWO = "medium/platform-two";
export const TIN_BOAT = "medium/tin-boat";

export async function seedPlatformTwo(context: SeedContext): Promise<void> {
  const { driver, time } = context;
  if (driver === null) return;
  const { projectId } = seedProject(PLATFORM_TWO);
  const ep101Key = `${PLATFORM_TWO}/101`;
  const ep102Key = `${PLATFORM_TWO}/102`;
  const ep103Key = `${PLATFORM_TWO}/103-outline`;
  const pitchKey = `${PLATFORM_TWO}/100-early-pitch`;

  await driver.setTime(time.at("D−12 09:30"));
  await createProject(driver, {
    userId: "dana",
    projectKey: PLATFORM_TWO,
    at: time.at("D−12 09:30"),
  });
  await writeInitial(context, {
    userId: "dana",
    docKey: pitchKey,
    at: "D−12 10:00",
    blocks: parseSeedText(PLATFORM_TWO_EARLY_PITCH).blocks,
  });
  const ep101 = await writeInitial(context, {
    userId: "sam",
    docKey: ep101Key,
    at: "D−10 14:00",
    blocks: parseSeedText(PLATFORM_TWO_101_TABLE).blocks,
  });
  const ep101DocId = seedDoc(ep101Key).docId;
  if (driver.capabilities.has("history")) {
    await driver.setTime(time.at("D−9 17:00"));
    await driver.nameDraft("dana", ep101DocId, "Table draft");
  }
  const tannoyOriginal =
    "Attention platform two. The nine-fourteen is feeling shy today. Please step back from the yellow line while we coax it out.";
  const tannoyIdx = ep101.blocks.findIndex((b) => b.text === tannoyOriginal);
  await replaceTextInSession(context, {
    userId: "dana",
    docKey: ep101Key,
    at: "D−5 18:00",
    replacements: [
      {
        blockId: ep101.ids[tannoyIdx]!,
        from: tannoyOriginal,
        to: PLATFORM_TWO_101_RUNTHROUGH_LINE,
      },
    ],
  });
  if (driver.capabilities.has("history")) {
    await driver.setTime(time.at("D−5 18:30"));
    await driver.nameDraft("dana", ep101DocId, "Run-through");
  }
  const ep102 = await writeInitial(context, {
    userId: "dana",
    docKey: ep102Key,
    at: "D−6 14:00",
    blocks: parseSeedText(PLATFORM_TWO_102).blocks,
  });
  const ep103 = await writeInitial(context, {
    userId: "sam",
    docKey: ep103Key,
    at: "D−4 16:30",
    blocks: parseSeedText(PLATFORM_TWO_103_OUTLINE).blocks,
  });
  // Move the discarded early pitch to Writers' room Trash so Trash is immediately populated
  await driver.trash("dana", seedDoc(pitchKey).docId, time.at("D−2 17:00"));

  if (driver.series !== null) {
    const project = { projectId, workspaceId: "medium" as const };
    await driver.setTime(time.at("D−2 17:15"));
    await driver.series.setSettings("dana", project, {
      "project.template": "multi_camera",
    });
    await driver.series.setSeasons("dana", project, PLATFORM_TWO_SEASONS);
    const episodes: EpisodeEntry[] = [
      {
        id: "ep101",
        seasonId: "s1",
        number: 101,
        title: "The Nine-Fourteen",
        writerUserId: "sam",
        stage: "Run-through",
        dueAt: time.at("D+3 18:00"),
        pages: 5,
        openCount: null,
        locked: false,
        docIds: { script: ep101DocId, outline: null, roomLog: null },
      },
      {
        id: "ep102",
        seasonId: "s1",
        number: 102,
        title: "Lost Property",
        writerUserId: "dana",
        stage: "Table",
        dueAt: time.at("D+10 18:00"),
        pages: 3,
        openCount: null,
        locked: false,
        docIds: {
          script: seedDoc(ep102Key).docId,
          outline: null,
          roomLog: null,
        },
      },
      {
        id: "ep103",
        seasonId: "s1",
        number: 103,
        title: "Night Replacement",
        writerUserId: "sam",
        stage: "Outline",
        dueAt: time.at("D+17 18:00"),
        pages: null,
        openCount: null,
        locked: false,
        docIds: {
          script: null,
          outline: seedDoc(ep103Key).docId,
          roomLog: null,
        },
      },
    ];
    await driver.series.setEpisodes("dana", project, episodes);
    await driver.series.setNames("dana", project, PLATFORM_TWO_NAMES);
    const ep101Headings = ep101.blocks
      .map((b, i) => (b.element === "scene_heading" ? ep101.ids[i]! : null))
      .filter((id): id is string => id !== null);
    const ep102Heading =
      ep102.ids[ep102.blocks.findIndex((b) => b.element === "scene_heading")]!;
    const ep103Beat2 =
      ep103.ids[
        ep103.blocks.findIndex(
          (b) => b.element === "group" && b.text.includes("Beat 2"),
        )
      ]!;
    await driver.series.setBoard("dana", project, {
      storylines: PLATFORM_TWO_STORYLINES,
      cards: platformTwoBoardCards({
        ep101Scene1: ep101Headings[0]!,
        ep101Scene2: ep101Headings[1]!,
        ep102Scene1: ep102Heading,
        ep103Beat2,
      }),
    });
  }
}

export async function seedTinBoat(context: SeedContext): Promise<void> {
  const { driver, ids, time } = context;
  if (driver === null) return;
  const { projectId } = seedProject(TIN_BOAT);
  const ep101Key = `${TIN_BOAT}/101`;
  const ep102Key = `${TIN_BOAT}/102`;
  const ep101DocId = seedDoc(ep101Key).docId;

  await driver.setTime(time.at("D−11 10:00"));
  await createProject(driver, {
    userId: "dana",
    projectKey: TIN_BOAT,
    at: time.at("D−11 10:00"),
  });
  const ep101 = await writeInitial(context, {
    userId: "sam",
    docKey: ep101Key,
    at: "D−10 11:00",
    blocks: parseSeedText(TIN_BOAT_101_RECORD).blocks,
  });
  if (driver.capabilities.has("history")) {
    await driver.setTime(time.at("D−7 16:00"));
    await driver.nameDraft("dana", ep101DocId, "Record draft");
  }
  await driver.setTime(time.at("D−2 11:30"));
  const uploaded = await driver.uploadAsset(
    "dana",
    { projectId, workspaceId: "medium" },
    makeStoryboardPng(),
  );
  const replacements = Object.entries(TIN_BOAT_101_PICKUP_REWRITES).map(
    ([from, to]) => {
      const idx = ep101.blocks.findIndex((b) => b.text === from);
      if (idx < 0)
        throw new RangeError(`Tin Boat pickup line not found: ${from}`);
      return { blockId: ep101.ids[idx]!, from, to };
    },
  );
  const storyboardBlock = graphicBlock(
    ids(),
    {
      kind: "image",
      assetId: uploaded.assetId,
      heightLines: 8,
      label: "Storyboard 01A",
      alt: "Dusk cove storyboard showing Pip's tin boat by the headland",
      aspectWidth: uploaded.width,
      aspectHeight: uploaded.height,
    },
    "Shot 01A — Wide establish on Pebble Cove as Pip bobs beside the mossy bollard.",
  );
  await replaceTextInSession(context, {
    userId: "dana",
    docKey: ep101Key,
    at: "D−2 11:30",
    replacements,
    insertAfter: { afterId: ep101.ids[0]!, blocks: [storyboardBlock] },
  });
  const ep102 = await writeInitial(context, {
    userId: "sam",
    docKey: ep102Key,
    at: "D−4 14:30",
    blocks: parseSeedText(TIN_BOAT_102).blocks,
  });

  if (driver.series !== null) {
    const project = { projectId, workspaceId: "medium" as const };
    await driver.setTime(time.at("D−2 12:00"));
    await driver.series.setSettings("dana", project, {
      "project.template": "animation",
      "project.ladder": [...TIN_BOAT_LADDER],
    });
    await driver.series.setSeasons("dana", project, TIN_BOAT_SEASONS);
    const episodes: EpisodeEntry[] = [
      {
        id: "tb101",
        seasonId: "s1",
        number: 101,
        title: "The Brass Compass",
        writerUserId: "sam",
        stage: "Record",
        dueAt: time.at("D+5 17:00"),
        pages: 3,
        openCount: null,
        locked: false,
        docIds: { script: ep101DocId, outline: null, roomLog: null },
      },
      {
        id: "tb102",
        seasonId: "s1",
        number: 102,
        title: "Fog in the Cove",
        writerUserId: "sam",
        stage: "Script",
        dueAt: time.at("D+12 17:00"),
        pages: 2,
        openCount: null,
        locked: false,
        docIds: {
          script: seedDoc(ep102Key).docId,
          outline: null,
          roomLog: null,
        },
      },
    ];
    await driver.series.setEpisodes("dana", project, episodes);
    await driver.series.setNames("dana", project, TIN_BOAT_NAMES);
    await driver.series.setBoard("dana", project, {
      storylines: TIN_BOAT_STORYLINES,
      cards: tinBoatBoardCards({
        ep101Scene1: ep101.ids[0]!,
        ep102Scene1: ep102.ids[0]!,
      }),
    });
  }
}
