// Harbour Lights Season 2 series state: settings, groups, episodes, names, facts, Board, 206 outline and 205 room log.
import { scriptBody } from "@manent/crdt";
import type { EpisodeEntry } from "@manent/crdt";
import { blockText, blocksOf, textAnchorAt } from "@manent/schema";
import type { BlockJSON, FlatBlock, TextAnchor } from "@manent/schema";
import { HARBOUR_LIGHTS_205_ROOM_LOG } from "../../content/medium/harbour-lights-log.ts";
import { HARBOUR_LIGHTS_206_OUTLINE } from "../../content/medium/harbour-lights-outline.ts";
import {
  HARBOUR_LIGHTS_CARDS,
  HARBOUR_LIGHTS_GROUPS,
  HARBOUR_LIGHTS_NAMES,
  HARBOUR_LIGHTS_SETTINGS,
  HARBOUR_LIGHTS_STORYLINES,
} from "../../content/medium/harbour-lights-series.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import type {
  SeedBoardCard,
  SeedFact,
  SeedSeries,
} from "../capabilities/series.ts";
import type { SeedSharing } from "../capabilities/sharing.ts";
import { SeedDriverError } from "../driver.ts";
import type { SeedDriver } from "../driver.ts";
import type { SeedContext, SeedStep } from "../seed.ts";
import type { SeedTime } from "../time.ts";

const PROJECT_KEY = "medium/harbour-lights";
const SEASON_ID = "s2";
const ANCHOR_SPAN_CHARS = 64;

interface Drivers {
  readonly driver: SeedDriver;
  readonly series: SeedSeries;
  readonly sharing: SeedSharing;
  readonly time: SeedTime;
  readonly ids: () => string;
}

function requireDrivers(context: SeedContext): Drivers {
  const { driver, time, ids } = context;
  if (driver === null)
    throw new RangeError("harbour-lights-series requires a driver");
  const { series, sharing } = driver;
  if (series === null || sharing === null)
    throw new SeedDriverError(
      "unavailable",
      "required seed capabilities are off",
    );
  return { driver, series, sharing, time, ids };
}

const blockIdOf = (block: FlatBlock): string => {
  if (block.attrs.id === null) throw new RangeError("seeded block has no id");
  return block.attrs.id;
};

async function readBlocks(
  driver: SeedDriver,
  docId: string,
): Promise<readonly FlatBlock[]> {
  const session = await driver.open("dana", docId);
  try {
    return blocksOf(scriptBody(session.doc).materialize());
  } finally {
    await session.close();
  }
}

const sceneHeadingsOf = (blocks: readonly FlatBlock[]): readonly FlatBlock[] =>
  blocks.filter((block) => block.attrs.type === "scene_heading");

function sceneHeadingIdAt(
  headings: readonly FlatBlock[],
  sceneNumber: number,
  label: string,
): string {
  const heading = headings[sceneNumber - 1];
  if (heading === undefined)
    throw new RangeError(`${label} has no scene ${sceneNumber}`);
  return blockIdOf(heading);
}

function anchorOfQuote(
  blocks: readonly FlatBlock[],
  quote: string,
): { anchor: TextAnchor; sceneHeadingId: string | null } {
  for (const [index, block] of blocks.entries()) {
    const text = blockText(block);
    const start = text.indexOf(quote);
    if (start < 0) continue;
    let sceneHeadingId: string | null = null;
    for (let i = index; i >= 0; i -= 1) {
      if (blocks[i]?.attrs.type === "scene_heading") {
        sceneHeadingId = blockIdOf(blocks[i]!);
        break;
      }
    }
    return {
      anchor: textAnchorAt(
        { id: blockIdOf(block), text },
        start,
        start + quote.length,
      ),
      sceneHeadingId,
    };
  }
  throw new RangeError(`quote not found in Harbour Lights: ${quote}`);
}

function firstSceneLineAnchor(
  blocks: readonly FlatBlock[],
  sceneNumber: number,
): { anchor: TextAnchor; sceneHeadingId: string } {
  let seen = 0;
  let headingIndex = -1;
  for (const [i, block] of blocks.entries()) {
    if (block.attrs.type === "scene_heading" && ++seen === sceneNumber) {
      headingIndex = i;
      break;
    }
  }
  if (headingIndex === -1)
    throw new RangeError(`201 has no scene ${sceneNumber}`);
  const next = blocks.findIndex(
    (b, i) => i > headingIndex && b.attrs.type === "scene_heading",
  );
  const target =
    blocks
      .slice(headingIndex + 1, next === -1 ? blocks.length : next)
      .find((b) => b.attrs.type === "action" || b.attrs.type === "dialogue") ??
    blocks[headingIndex]!;
  const text = blockText(target);
  return {
    anchor: textAnchorAt(
      { id: blockIdOf(target), text },
      0,
      Math.min(text.length, ANCHOR_SPAN_CHARS),
    ),
    sceneHeadingId: blockIdOf(blocks[headingIndex]!),
  };
}

const episodeDocId = (suffix: string): string =>
  seedDoc(`${PROJECT_KEY}/${suffix}`).docId;

function buildEpisodes(time: SeedTime): readonly EpisodeEntry[] {
  const ep = (
    number: number,
    title: string,
    writerUserId: string,
    stage: string,
    dueSpec: string | null,
    pages: number | null,
    opts: {
      locked?: boolean;
      openCount?: { round: string; open: number };
      outline?: string;
      roomLog?: string;
    } = {},
  ): EpisodeEntry => ({
    id: `ep-${number}`,
    seasonId: SEASON_ID,
    number,
    title,
    writerUserId,
    stage,
    dueAt: dueSpec === null ? null : time.at(dueSpec),
    pages,
    openCount: opts.openCount ?? null,
    locked: opts.locked ?? false,
    docIds: {
      script: episodeDocId(String(number)),
      outline: opts.outline === undefined ? null : episodeDocId(opts.outline),
      roomLog: opts.roomLog === undefined ? null : episodeDocId(opts.roomLog),
    },
  });
  return [
    ep(201, "Low Tide", "sam", "Blue", null, 58, { locked: true }),
    ep(202, "Salt", "dana", "White", null, 56, { locked: true }),
    ep(203, "Undertow", "dana", "Network", "D+2 18:00", 61, {
      openCount: { round: "Network", open: 4 },
    }),
    ep(204, "The Ferry", "sam", "Studio", "D+6 18:00", 52),
    ep(205, "Slack Water", "sam", "Writer's First", "D+13 18:00", 31, {
      roomLog: "205-room-log",
    }),
    ep(206, "The Bar", "dana", "Outline", "D+20 18:00", null, {
      outline: "206-outline",
    }),
  ];
}

async function writeBlocks(
  d: Drivers,
  docId: string,
  at: string,
  blocks: readonly BlockJSON[],
): Promise<void> {
  await d.driver.setTime(d.time.at(at));
  const session = await d.driver.open("dana", docId);
  try {
    await session.change((doc) =>
      scriptBody(doc).write((writer) => {
        writer.insertBlocks(null, [...blocks]);
      }),
    );
  } finally {
    await session.close();
  }
}

async function write206Outline(d: Drivers): Promise<void> {
  const blocks: BlockJSON[] = [];
  for (const act of HARBOUR_LIGHTS_206_OUTLINE) {
    blocks.push({
      type: "block",
      attrs: { id: d.ids(), type: "act_break", kind: "new_act" },
      content: [{ type: "text", text: act.heading }],
    });
    for (const beat of act.beats) {
      blocks.push({
        type: "block",
        attrs: { id: d.ids(), type: "scene_heading", synopsis: beat.synopsis },
        content: [{ type: "text", text: beat.title }],
      });
    }
  }
  await writeBlocks(
    d,
    seedDoc(`${PROJECT_KEY}/206-outline`).docId,
    "D−18 14:20",
    blocks,
  );
}

async function write205RoomLog(
  d: Drivers,
  headings205: readonly FlatBlock[],
): Promise<void> {
  const blocks: BlockJSON[] = HARBOUR_LIGHTS_205_ROOM_LOG.map((entry) => ({
    type: "block",
    attrs: {
      id: d.ids(),
      type: "general",
      tags: [...entry.tags],
      linkTo:
        entry.scene === null
          ? null
          : {
              kind: "scene",
              blockId: sceneHeadingIdAt(headings205, entry.scene, "205"),
            },
    },
    content: [{ type: "text", text: entry.text }],
  }));
  await writeBlocks(
    d,
    seedDoc(`${PROJECT_KEY}/205-room-log`).docId,
    "D−2 16:40",
    blocks,
  );
}

async function seedHarbourLightsSeries(d: Drivers): Promise<void> {
  const { projectId } = seedProject(PROJECT_KEY);
  const project = { projectId, workspaceId: "medium" as const };
  const epNums = [201, 202, 203, 204, 205] as const;
  const docIds = Object.fromEntries(
    epNums.map((n) => [n, seedDoc(`${PROJECT_KEY}/${n}`).docId]),
  ) as Record<(typeof epNums)[number], string>;
  const blocksByEp = {
    201: await readBlocks(d.driver, docIds[201]),
    202: await readBlocks(d.driver, docIds[202]),
    203: await readBlocks(d.driver, docIds[203]),
    204: await readBlocks(d.driver, docIds[204]),
    205: await readBlocks(d.driver, docIds[205]),
  };
  const headingsByEp = {
    201: sceneHeadingsOf(blocksByEp[201]),
    202: sceneHeadingsOf(blocksByEp[202]),
    203: sceneHeadingsOf(blocksByEp[203]),
    204: sceneHeadingsOf(blocksByEp[204]),
    205: sceneHeadingsOf(blocksByEp[205]),
  };

  await d.driver.setTime(d.time.at("D−32 10:05"));
  await d.sharing.setGroups("dana", project, HARBOUR_LIGHTS_GROUPS);
  await d.series.setSettings("dana", project, HARBOUR_LIGHTS_SETTINGS);
  await d.series.setSeasons("dana", project, [
    { id: SEASON_ID, number: 2, title: null },
  ]);
  await d.series.setEpisodes("dana", project, buildEpisodes(d.time));
  await d.series.setNames("dana", project, HARBOUR_LIGHTS_NAMES);

  const fact201 = firstSceneLineAnchor(blocksByEp[201], 3);
  const factChannel = anchorOfQuote(
    blocksByEp[204],
    "Dad dredged the East Channel the year you left.",
  );
  const factPike = anchorOfQuote(
    blocksByEp[204],
    "the Marguerite's engineer since before she had that name",
  );
  const factFinn = anchorOfQuote(blocksByEp[204], "Twelve on foot.");
  const fact = (
    ep: 201 | 204,
    sceneLabel: string,
    found: { anchor: TextAnchor; sceneHeadingId: string | null },
    at: string,
  ): SeedFact => ({
    docId: docIds[ep],
    episodeId: `ep-${ep}`,
    sceneHeadingId: found.sceneHeadingId,
    sceneLabel,
    anchor: found.anchor,
    byUserId: "sam",
    at: d.time.at(at),
  });
  await d.driver.setTime(d.time.at("D−1 16:18"));
  await d.series.setFacts("dana", project, [
    fact(201, "3", fact201, "D−28 17:00"),
    fact(204, "10", factChannel, "D−4 17:30"),
    fact(204, "11", factPike, "D−4 17:40"),
    fact(204, "11", factFinn, "D−1 16:18"),
  ]);

  const cards: SeedBoardCard[] = HARBOUR_LIGHTS_CARDS.map((card) => ({
    id: card.id,
    storylineId: card.storylineId,
    episodeId: `ep-${card.episodeNumber}`,
    text: card.text,
    linkBlockId:
      card.scene === null || card.episodeNumber === 206
        ? null
        : sceneHeadingIdAt(
            headingsByEp[card.episodeNumber],
            card.scene,
            String(card.episodeNumber),
          ),
  }));
  await d.driver.setTime(d.time.at("D−3 15:00"));
  await d.series.setBoard("dana", project, {
    storylines: HARBOUR_LIGHTS_STORYLINES,
    cards,
  });

  await write206Outline(d);
  await write205RoomLog(d, headingsByEp[205]);
}

export const HARBOUR_LIGHTS_SERIES: SeedStep = {
  id: "harbour-lights-series",
  workspace: "medium",
  background: false,
  async run(context) {
    if (context.driver === null) return [];
    await seedHarbourLightsSeries(requireDrivers(context));
    return [];
  },
};
