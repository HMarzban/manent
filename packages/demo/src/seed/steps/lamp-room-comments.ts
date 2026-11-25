// The Lamp Room: Room group, First draft send and Dana's three resolved comments.
import { scriptBody } from "@manent/crdt";
import { blockText, blocksOf, isBlockType, textAnchorAt } from "@manent/schema";
import type { FlatBlock, TextAnchor } from "@manent/schema";
import type { SeedBlock } from "../../content/markup.ts";
import {
  LAMP_ROOM_GROUPS,
  LAMP_ROOM_THREADS,
} from "../../content/medium/lamp-room-comments.ts";
import type { LampRoomThread } from "../../content/medium/lamp-room-comments.ts";
import type { PageMeter } from "../../generate/fit.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import type { SeedComments } from "../capabilities/comments.ts";
import type { SeedSharing } from "../capabilities/sharing.ts";
import { SeedDriverError } from "../driver.ts";
import type { SeedDriver } from "../driver.ts";
import type { SeedContext, SeedStep } from "../seed.ts";
import type { SeedTime } from "../time.ts";

const PROJECT_KEY = "medium/the-lamp-room";
const DOC_KEY = `${PROJECT_KEY}/script`;
const ANCHOR_SPAN_CHARS = 48;

interface Drivers {
  readonly driver: SeedDriver;
  readonly comments: SeedComments;
  readonly sharing: SeedSharing;
  readonly meter: PageMeter;
  readonly time: SeedTime;
}

function requireDrivers(context: SeedContext): Drivers {
  const { driver, meter, time } = context;
  if (driver === null || meter === null)
    throw new RangeError("lamp-room-comments requires a driver and page meter");
  const { comments, sharing } = driver;
  if (comments === null || sharing === null)
    throw new SeedDriverError(
      "unavailable",
      "required seed capabilities are off",
    );
  return { driver, comments, sharing, meter, time };
}

const blockIdOf = (block: FlatBlock): string => {
  if (block.attrs.id === null) throw new RangeError("seeded block has no id");
  return block.attrs.id;
};

const toSeedBlocks = (blocks: readonly FlatBlock[]): SeedBlock[] =>
  blocks.map((block) => ({
    element: isBlockType(block.attrs.type) ? block.attrs.type : "general",
    text: blockText(block),
    marks: [],
    kind: block.attrs.kind,
  }));

async function readBlocks(
  driver: SeedDriver,
  docId: string,
): Promise<readonly FlatBlock[]> {
  const session = await driver.open("sam", docId);
  try {
    return blocksOf(scriptBody(session.doc).materialize());
  } finally {
    await session.close();
  }
}

function anchorOfTarget(
  blocks: readonly FlatBlock[],
  pages: readonly { label: string; blockIndex: number }[],
  target: LampRoomThread["target"],
): TextAnchor {
  if (target.kind === "quote") {
    for (const block of blocks) {
      const text = blockText(block);
      const start = text.indexOf(target.quote);
      if (start >= 0)
        return textAnchorAt(
          { id: blockIdOf(block), text },
          start,
          start + target.quote.length,
        );
    }
    throw new RangeError(`quote not found in ${DOC_KEY}: ${target.quote}`);
  }
  const clamped = Math.max(1, Math.min(target.page, pages.length));
  const start = pages[clamped - 1]?.blockIndex ?? 0;
  const end = pages[clamped]?.blockIndex ?? blocks.length;
  for (let i = start; i < end; i += 1) {
    const block = blocks[i];
    if (block !== undefined && blockText(block).trim().length > 0) {
      const text = blockText(block);
      return textAnchorAt(
        { id: blockIdOf(block), text },
        0,
        Math.min(text.length, ANCHOR_SPAN_CHARS),
      );
    }
  }
  const fallback = blocks[Math.min(start, blocks.length - 1)];
  if (fallback === undefined)
    throw new RangeError(`no block on page ${target.page} of ${DOC_KEY}`);
  const text = blockText(fallback);
  return textAnchorAt(
    { id: blockIdOf(fallback), text },
    0,
    Math.min(text.length, ANCHOR_SPAN_CHARS),
  );
}

async function seedLampRoomComments(d: Drivers): Promise<void> {
  const { projectId } = seedProject(PROJECT_KEY);
  const { docId } = seedDoc(DOC_KEY);
  const blocks = await readBlocks(d.driver, docId);
  const pages = await d.meter.pages(toSeedBlocks(blocks), {
    format: "screenplay",
    settings: { "script.paper": "letter", "script.sceneContinued": true },
    anchors: null,
  });
  const firstDraft = (await d.driver.versions("sam", docId)).find(
    (v) => v.name === "First draft",
  );
  if (firstDraft === undefined)
    throw new RangeError(`${DOC_KEY} has no version named First draft`);

  await d.driver.setTime(d.time.at("D−12 16:30"));
  await d.sharing.setGroups(
    "dana",
    { projectId, workspaceId: "medium" },
    LAMP_ROOM_GROUPS,
  );
  await d.sharing.sendVersion("sam", {
    docId,
    versionId: firstDraft.id,
    name: "First draft",
    what: "full",
    againstVersionId: null,
    files: ["pdf"],
    groupIds: ["room"],
    recipientUserIds: [],
    watermark: false,
    link: null,
  });
  const round = (await d.comments.rounds("sam", docId)).find(
    (r) => r.versionId === firstDraft.id && r.name === "Room",
  );
  if (round === undefined)
    throw new RangeError(`${DOC_KEY} has no Room round on First draft`);

  for (const spec of LAMP_ROOM_THREADS) {
    await d.driver.setTime(d.time.at(spec.at));
    const { threadId } = await d.comments.startThread(
      spec.authorUserId,
      docId,
      {
        anchor: anchorOfTarget(blocks, pages, spec.target),
        roundId: round.roundId,
        body: spec.body,
      },
    );
    await d.driver.setTime(d.time.at(spec.reply.at));
    await d.comments.reply(spec.reply.authorUserId, docId, {
      threadId,
      body: spec.reply.body,
    });
    await d.driver.setTime(d.time.at(spec.resolvedAt));
    await d.comments.resolve("dana", docId, {
      threadId,
      outcome: "addressed",
      reason: null,
    });
  }
}

export const LAMP_ROOM_COMMENTS: SeedStep = {
  id: "lamp-room-comments",
  workspace: "medium",
  background: false,
  async run(context) {
    if (context.driver === null) return [];
    await seedLampRoomComments(requireDrivers(context));
    return [];
  },
};
