// Lanternfield Studios' series tables, nightly drafts, animation ladder, past seasons and 212 open comment threads.
import { scriptBody } from "@manent/crdt";
import type { EpisodeEntry } from "@manent/crdt";
import { blockText, blocksOf, isBlockType, textAnchorAt } from "@manent/schema";
import type { BlockJSON, FlatBlock, FormatId } from "@manent/schema";
import {
  EMBER_FLEET_GROUPS,
  EMBER_FLEET_STUDIO_ROUND,
} from "../../content/heavy/film-threads.ts";
import type {
  HeavyThreadSpec,
  RoundThreadSpec,
} from "../../content/heavy/film-threads.ts";
import { LARCH_ROAD_305_SENDS } from "../../content/heavy/larch-and-moss.ts";
import {
  ALL_HEAVY_OPEN_THREADS,
  HEAVY_SERIES_CONFIGS,
} from "../../content/heavy/series-configs.ts";
import type { SeriesIndexConfig } from "../../content/heavy/series-configs.ts";
import { WARD_NINE_406_ROUND_THREADS } from "../../content/heavy/series-threads.ts";
import {
  WARD_NINE_S5_CARDS,
  WARD_NINE_S5_OUTLINES,
  WARD_NINE_S5_STORYLINES,
} from "../../content/heavy/ward-nine-s5.ts";
import { WARD_NINE_403_CUT } from "../../content/heavy/ward-nine-series.ts";
import type { SeedBlock } from "../../content/markup.ts";
import type { PageMeter } from "../../generate/fit.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import type { SeedComments } from "../capabilities/comments.ts";
import type { SeedProjectRef, SeedSeries } from "../capabilities/series.ts";
import type { SeedSharing } from "../capabilities/sharing.ts";
import type { SeedWritersMaterial } from "../capabilities/writers-material.ts";
import { SeedDriverError } from "../driver.ts";
import type { SeedDriver } from "../driver.ts";
import type { SeedContext, SeedStep } from "../seed.ts";
import type { SeedTime } from "../time.ts";

const ANCHOR_SPAN_CHARS = 48;

interface Drivers {
  readonly driver: SeedDriver;
  readonly comments: SeedComments;
  readonly material: SeedWritersMaterial;
  readonly sharing: SeedSharing;
  readonly series: SeedSeries;
  readonly meter: PageMeter;
  readonly time: SeedTime;
  readonly ids: () => string;
}

function requireDrivers(context: SeedContext): Drivers {
  const { driver, meter, time, ids } = context;
  if (driver === null || meter === null)
    throw new RangeError("heavy-series requires a driver and page meter");
  const { comments, writersMaterial: material, sharing, series } = driver;
  if (
    comments === null ||
    material === null ||
    sharing === null ||
    series === null
  )
    throw new SeedDriverError(
      "unavailable",
      "required seed capabilities are off",
    );
  return { driver, comments, material, sharing, series, meter, time, ids };
}

const projectRef = (projectKey: string): SeedProjectRef => ({
  projectId: seedProject(projectKey).projectId,
  workspaceId: "heavy",
});

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

async function measurePages(
  d: Drivers,
  docId: string,
  format: FormatId,
): Promise<number> {
  const blocks: SeedBlock[] = (await readBlocks(d.driver, docId)).map(
    (block) => ({
      element: isBlockType(block.attrs.type) ? block.attrs.type : "general",
      text: blockText(block),
      marks: [],
      kind: block.attrs.kind,
    }),
  );
  return (await d.meter.pages(blocks, { format, settings: {}, anchors: null }))
    .length;
}

async function versionIdByName(
  driver: SeedDriver,
  docId: string,
  name: string,
): Promise<string> {
  const found = (await driver.versions("dana", docId)).find(
    (v) => v.name === name,
  );
  if (found === undefined)
    throw new RangeError(`${docId} has no version named ${name}`);
  return found.id;
}

async function seedSeriesIndex(
  d: Drivers,
  config: SeriesIndexConfig,
): Promise<void> {
  const project = projectRef(config.projectKey);
  await d.driver.setTime(d.time.at(config.at));
  await d.series.setSettings("dana", project, config.settings);
  await d.sharing.setGroups("dana", project, config.groups);
  await d.series.setNames("dana", project, config.names);
  await d.series.setSeasons("dana", project, config.seasons);
  const episodes: EpisodeEntry[] = [];
  for (const spec of config.episodes) {
    const docId = seedDoc(spec.docKey).docId;
    const pages =
      spec.pages ??
      (config.measureFormat !== null && spec.stage !== "Outline"
        ? await measurePages(d, docId, config.measureFormat)
        : null);
    episodes.push({
      id: spec.id,
      seasonId: spec.seasonId,
      number: spec.number,
      title: spec.title,
      writerUserId: spec.writerUserId,
      stage: spec.stage,
      dueAt: spec.dueAt === null ? null : d.time.at(spec.dueAt),
      pages,
      openCount: null,
      locked: spec.locked,
      docIds:
        spec.docSlot === "outline"
          ? { script: null, outline: docId, roomLog: null }
          : { script: docId, outline: null, roomLog: null },
    });
  }
  await d.series.setEpisodes("dana", project, episodes);
}

async function seedDocThreads(
  d: Drivers,
  docKey: string,
  roundId: string | null,
  threads: readonly RoundThreadSpec[],
): Promise<void> {
  const docId = seedDoc(docKey).docId;
  const usable = (await readBlocks(d.driver, docId)).filter(
    (b) => b.attrs.id !== null && blockText(b).trim().length > 0,
  );
  if (usable.length === 0)
    throw new RangeError(`seeded document holds no anchorable text: ${docKey}`);
  for (const [i, spec] of threads.entries()) {
    const block =
      usable[
        Math.min(
          usable.length - 1,
          Math.floor(((i + 0.5) * usable.length) / threads.length),
        )
      ]!;
    const text = blockText(block);
    const anchor = textAnchorAt(
      { id: block.attrs.id!, text },
      0,
      Math.min(text.length, ANCHOR_SPAN_CHARS),
    );
    await d.driver.setTime(d.time.at(spec.at));
    const { threadId } = await d.comments.startThread(
      spec.authorUserId,
      docId,
      { anchor, roundId, body: spec.body },
    );
    if (spec.reply !== null) {
      await d.driver.setTime(d.time.at(spec.reply.at));
      await d.comments.reply(spec.reply.authorUserId, docId, {
        threadId,
        body: spec.reply.body,
      });
    }
    if (spec.resolved !== null) {
      await d.driver.setTime(d.time.at(spec.resolved.at));
      await d.comments.resolve(spec.resolved.byUserId, docId, {
        threadId,
        outcome: spec.resolved.outcome,
        reason: spec.resolved.reason,
      });
    }
  }
}

async function sendDraftRound(
  d: Drivers,
  spec: {
    docKey: string;
    draftName: string;
    againstName: string;
    groupId: string;
    sentAt: string;
  },
): Promise<string> {
  const docId = seedDoc(spec.docKey).docId;
  const againstId = await versionIdByName(d.driver, docId, spec.againstName);
  const versionId = await versionIdByName(d.driver, docId, spec.draftName);
  await d.driver.setTime(d.time.at(spec.sentAt));
  await d.sharing.sendVersion("dana", {
    docId,
    versionId,
    name: spec.draftName,
    what: "whole_script",
    againstVersionId: againstId,
    files: ["pdf", "pdf_asterisks"],
    groupIds: [spec.groupId],
    recipientUserIds: [],
    watermark: false,
    link: null,
  });
  const round = (await d.comments.rounds("dana", docId)).find(
    (r) => r.versionId === versionId,
  );
  if (round === undefined)
    throw new RangeError(`${spec.docKey} has no round for ${versionId}`);
  return round.roundId;
}

async function seedWardNineExtras(d: Drivers): Promise<void> {
  await d.driver.setTime(d.time.at("D−5 14:15"));
  await d.series.setBoard("dana", projectRef("heavy/h24"), {
    storylines: WARD_NINE_S5_STORYLINES,
    cards: WARD_NINE_S5_CARDS,
  });
  for (const [userId, key, at] of [
    ["declan-furey", "heavy/h24/501", "D−5 14:30"],
    ["yusuf-demirel", "heavy/h24/502", "D−5 15:00"],
    ["saoirse-galvin", "heavy/h24/503", "D−5 15:30"],
  ] as const) {
    await d.driver.setTime(d.time.at(at));
    const blocks: BlockJSON[] = WARD_NINE_S5_OUTLINES[key]!.map((beat) => ({
      type: "block",
      attrs: { id: d.ids(), type: "scene_heading", synopsis: beat.synopsis },
      content: [{ type: "text", text: beat.heading }],
    }));
    const session = await d.driver.open(userId, seedDoc(key).docId);
    try {
      await session.change((doc) =>
        scriptBody(doc).write((w) => void w.insertBlocks(null, blocks)),
      );
    } finally {
      await session.close();
    }
  }
  await d.driver.setTime(d.time.at("D−40 16:00"));
  await d.material.addCut("saoirse-galvin", seedDoc("heavy/h24/403").docId, {
    blocks: WARD_NINE_403_CUT.map((line) => ({
      type: "block",
      attrs: { id: d.ids(), type: line.element, kind: null },
      content: [{ type: "text", text: line.text }],
    })),
    afterBlockId: null,
    sceneHeadingId: null,
  });
  const roundId = await sendDraftRound(d, {
    docKey: "heavy/h24/406",
    draftName: "Network draft",
    againstName: "Studio draft",
    groupId: "network",
    sentAt: "D−2 22:15",
  });
  await seedDocThreads(
    d,
    "heavy/h24/406",
    roundId,
    WARD_NINE_406_ROUND_THREADS.map(([at, authorUserId, body]) => ({
      at,
      authorUserId,
      body,
      reply: null,
      resolved: null,
    })),
  );
}

async function seedLarchRoadNightlyDrafts(d: Drivers): Promise<void> {
  const docId = seedDoc("heavy/h25/305").docId;
  const versionIds = new Map<string, string>();
  for (const send of LARCH_ROAD_305_SENDS)
    versionIds.set(
      send.draftName,
      await versionIdByName(d.driver, docId, send.draftName),
    );
  for (const send of LARCH_ROAD_305_SENDS) {
    await d.driver.setTime(d.time.at(send.sentAt));
    const sent = await d.sharing.sendVersion("dana", {
      docId,
      versionId: versionIds.get(send.draftName)!,
      name: send.draftName,
      what: "full_draft",
      againstVersionId:
        send.againstName === null ? null : versionIds.get(send.againstName)!,
      files: send.files,
      groupIds: send.groupIds,
      recipientUserIds: [],
      watermark: false,
      link: null,
    });
    if (sent.recipientToken !== null)
      for (const opened of send.openedBy) {
        await d.driver.setTime(d.time.at(opened.at));
        await d.sharing.openDraftLink(opened.userId, sent.recipientToken);
      }
  }
}

async function seedOpenThreads(
  d: Drivers,
  threads: readonly HeavyThreadSpec[],
): Promise<void> {
  const byDoc = new Map<string, RoundThreadSpec[]>();
  for (const { docKey, at, authorUserId, body } of threads) {
    const list = byDoc.get(docKey) ?? [];
    list.push({ at, authorUserId, body, reply: null, resolved: null });
    byDoc.set(docKey, list);
  }
  for (const [docKey, list] of byDoc)
    await seedDocThreads(d, docKey, null, list);
}

export const HEAVY_SERIES: SeedStep = {
  id: "heavy-series",
  workspace: "heavy",
  background: true,
  async run(context) {
    if (context.driver === null) return [];
    const drivers = requireDrivers(context);
    for (const config of HEAVY_SERIES_CONFIGS)
      await seedSeriesIndex(drivers, config);
    await seedWardNineExtras(drivers);
    await seedLarchRoadNightlyDrafts(drivers);
    await drivers.driver.setTime(drivers.time.at("D−12 22:10"));
    await drivers.sharing.setGroups(
      "dana",
      projectRef("heavy/h03"),
      EMBER_FLEET_GROUPS,
    );
    const h03RoundId = await sendDraftRound(drivers, {
      docKey: "heavy/h03/script",
      draftName: "Studio draft",
      againstName: "Writer's First",
      groupId: "studio",
      sentAt: "D−12 22:15",
    });
    await seedDocThreads(
      drivers,
      "heavy/h03/script",
      h03RoundId,
      EMBER_FLEET_STUDIO_ROUND,
    );
    await seedOpenThreads(drivers, ALL_HEAVY_OPEN_THREADS);
    return [];
  },
};
