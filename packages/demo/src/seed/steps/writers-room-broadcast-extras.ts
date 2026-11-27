// Broadcast showcase enrichments in Writers' room:
// - Live broadcast chyrons (lower_third, ots with uploaded PNG card, full_screen) on Lannick One News story 07
//   and The Late Desk segment 4 (leaving stories/01 untouched for the write-inline-graphics Tour).
// - Reusable workspace-shared Show & News templates plus Lannick One News' project default rundown template
//   and The Late Desk's project default script template (leaving The Late Desk's rundown default unset for the
//   rundown-show-template Tour).
import {
  PROJECT_RUNDOWN_SKELETON_KEY,
  PROJECT_SCRIPT_SKELETON_KEY,
  readRundown,
  scriptBody,
  stripRundownForTemplate,
  stripScriptForTemplate,
  writeWorkspaceTemplate,
} from "@manent/crdt";
import { blocksOf } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { indexDocId, seedDocId } from "@manent/sync-protocol";
import { seedDoc, seedProject } from "../catalogue.ts";
import { makeStormCardPng } from "../png.ts";
import type { SeedContext, SeedStep } from "../seed.ts";

const NEWS_PROJECT = "medium/lannick-one-news";
const NEWS_STORY_07 = `${NEWS_PROJECT}/stories/07`;
const NEWS_RUNDOWN_DAY = `${NEWS_PROJECT}/rundowns/day`;

const SHOW_PROJECT = "medium/the-late-desk";
const SHOW_SEGMENT_4 = `${SHOW_PROJECT}/segments/4`;

const WORKSPACE_NEWS_TEMPLATE_ID = seedDocId(
  "template:medium/evening-news-bulletin",
);
const WORKSPACE_SHOW_SCRIPT_TEMPLATE_ID = seedDocId(
  "template:medium/late-show-segment",
);

async function seedNewsChyrons(context: SeedContext): Promise<void> {
  const { driver, ids, time } = context;
  if (driver === null) return;
  const { projectId } = seedProject(NEWS_PROJECT);
  const { docId } = seedDoc(NEWS_STORY_07);

  await driver.setTime(time.at("N−2:10"));
  const storm = await driver.uploadAsset(
    "ana",
    { projectId, workspaceId: "medium" },
    makeStormCardPng(),
  );
  const session = await driver.open("ana", docId);
  try {
    const blocks = blocksOf(scriptBody(session.doc).materialize());
    const firstSlug = blocks.find((b) => b.attrs.type === "slug");
    const firstDialogue = blocks.find((b) => b.attrs.type === "dialogue");
    const lastBlock = blocks.at(-1);
    const otsBlock: BlockJSON = {
      type: "block",
      attrs: {
        id: ids(),
        type: "graphic",
        graphic: {
          kind: "ots",
          assetId: storm.assetId,
          heightLines: 6,
          label: "Over the shoulder",
          alt: "Coastal gale warning isobar graphic for Wrenna Channel",
          aspectWidth: storm.width,
          aspectHeight: storm.height,
        },
      },
      content: [
        {
          type: "text",
          text: "GALE WARNING · WRENNA FERRIES CANCELLED AFTER 20:00",
        },
      ],
    };
    const lowerThirdBlock: BlockJSON = {
      type: "block",
      attrs: {
        id: ids(),
        type: "graphic",
        graphic: {
          kind: "lower_third",
          assetId: null,
          heightLines: 4,
          label: "Lower third",
          alt: "",
          aspectWidth: null,
          aspectHeight: null,
        },
      },
      content: [
        {
          type: "text",
          text: "CAPTAIN MARA KERR · HARBOURMASTER, ARDLE QUAY",
        },
      ],
    };
    const fullScreenBlock: BlockJSON = {
      type: "block",
      attrs: {
        id: ids(),
        type: "graphic",
        graphic: {
          kind: "full_screen",
          assetId: null,
          heightLines: 6,
          label: "Full screen",
          alt: "",
          aspectWidth: null,
          aspectHeight: null,
        },
      },
      content: [
        {
          type: "text",
          text: "COASTAL TRANSIT DISRUPTIONS · CHECK LANNICK.TRANSIT BEFORE TRAVEL",
        },
      ],
    };
    await session.change((doc) =>
      scriptBody(doc).write((w) => {
        w.insertBlocks(firstSlug?.attrs.id ?? null, [otsBlock]);
        if (
          firstDialogue?.attrs.id !== null &&
          firstDialogue?.attrs.id !== undefined
        )
          w.insertBlocks(firstDialogue.attrs.id, [lowerThirdBlock]);
        if (lastBlock?.attrs.id !== null && lastBlock?.attrs.id !== undefined)
          w.insertBlocks(lastBlock.attrs.id, [fullScreenBlock]);
      }),
    );
  } finally {
    await session.close();
  }
}

async function seedShowChyrons(context: SeedContext): Promise<void> {
  const { driver, ids, time } = context;
  if (driver === null) return;
  const { docId } = seedDoc(SHOW_SEGMENT_4);
  await driver.setTime(time.at("N−2:00"));
  const session = await driver.open("ana", docId);
  try {
    const blocks = blocksOf(scriptBody(session.doc).materialize());
    const firstSlug = blocks.find((b) => b.attrs.type === "slug");
    const lowerThird: BlockJSON = {
      type: "block",
      attrs: {
        id: ids(),
        type: "graphic",
        graphic: {
          kind: "lower_third",
          assetId: null,
          heightLines: 4,
          label: "Lower third",
          alt: "",
          aspectWidth: null,
          aspectHeight: null,
        },
      },
      content: [{ type: "text", text: "BENNY COLLINS · THINGS WE LEARNED" }],
    };
    await session.change((doc) =>
      scriptBody(doc).write((w) => {
        w.insertBlocks(firstSlug?.attrs.id ?? null, [lowerThird]);
      }),
    );
  } finally {
    await session.close();
  }
}

async function seedBroadcastTemplates(context: SeedContext): Promise<void> {
  const { driver, time } = context;
  if (driver === null) return;
  const at = time.at("N−1:40");
  await driver.setTime(at);

  // Strip Lannick One News day rundown into a clean reusable rundown template
  let newsSkeleton = null;
  if (driver.rundowns !== null) {
    const newsSession = await driver.open(
      "ana",
      seedDoc(NEWS_RUNDOWN_DAY).docId,
    );
    try {
      newsSkeleton = stripRundownForTemplate(readRundown(newsSession.doc));
    } finally {
      await newsSession.close();
    }
  }

  // Strip The Late Desk segment 4 into a clean reusable script template
  const segSession = await driver.open("ana", seedDoc(SHOW_SEGMENT_4).docId);
  let showScriptSkeleton;
  try {
    showScriptSkeleton = stripScriptForTemplate(
      scriptBody(segSession.doc).materialize(),
    );
  } finally {
    await segSession.close();
  }

  // Store workspace-shared templates in medium's "templates" map
  const wsSession = await driver.open(
    "dana",
    indexDocId("workspace", "medium"),
  );
  try {
    await wsSession.change((doc) => {
      if (newsSkeleton !== null) {
        writeWorkspaceTemplate(doc, {
          id: WORKSPACE_NEWS_TEMPLATE_ID,
          name: "Evening 18:30 News Bulletin",
          kind: "rundown",
          createdAt: at,
          createdByUserId: "ana",
          updatedAt: at,
          skeleton: newsSkeleton,
        });
      }
      writeWorkspaceTemplate(doc, {
        id: WORKSPACE_SHOW_SCRIPT_TEMPLATE_ID,
        name: "Standard Late Show Segment",
        kind: "script",
        createdAt: at,
        createdByUserId: "ana",
        updatedAt: at,
        skeleton: showScriptSkeleton,
      });
    });
  } finally {
    await wsSession.close();
  }

  // Store project-default templates (News rundown default + Show script default)
  if (driver.series !== null) {
    if (newsSkeleton !== null) {
      await driver.series.setSettings(
        "dana",
        {
          projectId: seedProject(NEWS_PROJECT).projectId,
          workspaceId: "medium",
        },
        { [PROJECT_RUNDOWN_SKELETON_KEY]: newsSkeleton },
      );
    }
    await driver.series.setSettings(
      "dana",
      { projectId: seedProject(SHOW_PROJECT).projectId, workspaceId: "medium" },
      { [PROJECT_SCRIPT_SKELETON_KEY]: showScriptSkeleton },
    );
  }
}

export const WRITERS_ROOM_BROADCAST_EXTRAS: SeedStep = {
  id: "writers-room-broadcast-extras",
  workspace: "medium",
  background: false,
  async run(context) {
    if (context.driver === null) return [];
    await seedNewsChyrons(context);
    await seedShowChyrons(context);
    await seedBroadcastTemplates(context);
    return [];
  },
};
