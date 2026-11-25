// Sam's desk working together: Nell's groups, watermarked drafts, comments, Sam's Notes and the play's source.
import { scriptBody } from "@manent/crdt";
import { blockText, blocksOf, isBlockType, textAnchorAt } from "@manent/schema";
import type { FlatBlock, TextAnchor } from "@manent/schema";
import type { SeedBlock } from "../../content/markup.ts";
import {
  EKBO_FIRST_DRAFT_THREADS,
  EKBO_SCENE_14_QUOTE,
  EKBO_SCENE_14_THREAD,
  JUMPOX_FIRST_DRAFT_THREADS,
  JUMPOX_NOTES,
  PLAY_NOTE_QUOTE,
  PLAY_NOTE_TEXT,
  PLAY_SCENE_CHAPTERS,
  SMALL_PROJECT_GROUPS,
} from "../../content/small/sams-desk-together.ts";
import type { SeededThread } from "../../content/small/sams-desk-together.ts";
import type { PageMeter } from "../../generate/fit.ts";
import { seedDoc, seedProject } from "../catalogue.ts";
import type { SeedComments } from "../capabilities/comments.ts";
import type { SeedSharing } from "../capabilities/sharing.ts";
import type { SeedStartFrom } from "../capabilities/start-from.ts";
import type { SeedWritersMaterial } from "../capabilities/writers-material.ts";
import { SeedDriverError } from "../driver.ts";
import type { SeedDriver } from "../driver.ts";
import type { SeedContext, SeedStep } from "../seed.ts";
import type { SeedTime } from "../time.ts";

const EKBO_PROJECT = "small/every-key-but-one";
const JUMPOX_PROJECT = "small/jumpox";
const PLAY_PROJECT = "small/down-the-back";
const ANCHOR_SPAN_CHARS = 48;

interface Drivers {
  readonly driver: SeedDriver;
  readonly comments: SeedComments;
  readonly material: SeedWritersMaterial;
  readonly sharing: SeedSharing;
  readonly startFrom: SeedStartFrom;
  readonly meter: PageMeter;
  readonly time: SeedTime;
}

function requireDrivers(context: SeedContext): Drivers {
  const { driver, meter, time } = context;
  if (driver === null || meter === null)
    throw new RangeError("sams-desk-together requires a driver and page meter");
  const { comments, writersMaterial: material, sharing, startFrom } = driver;
  if (
    comments === null ||
    material === null ||
    sharing === null ||
    startFrom === null
  )
    throw new SeedDriverError(
      "unavailable",
      "required seed capabilities are off",
    );
  return { driver, comments, material, sharing, startFrom, meter, time };
}

const blockIdOf = (block: FlatBlock): string => {
  if (block.attrs.id === null) throw new RangeError("seeded block has no id");
  return block.attrs.id;
};

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

const anchorOfBlock = (block: FlatBlock): TextAnchor => {
  const text = blockText(block);
  return textAnchorAt(
    { id: blockIdOf(block), text },
    0,
    Math.min(text.length, ANCHOR_SPAN_CHARS),
  );
};

function anchorOfQuote(
  blocks: readonly FlatBlock[],
  quote: string,
): TextAnchor {
  for (const block of blocks) {
    const text = blockText(block);
    const start = text.indexOf(quote);
    if (start >= 0)
      return textAnchorAt(
        { id: blockIdOf(block), text },
        start,
        start + quote.length,
      );
  }
  throw new RangeError(`quote not found in seeded document: ${quote}`);
}

const toSeedBlocks = (blocks: readonly FlatBlock[]): SeedBlock[] =>
  blocks.map((block) => ({
    element: isBlockType(block.attrs.type) ? block.attrs.type : "general",
    text: blockText(block),
    marks: [],
    kind: block.attrs.kind,
  }));

async function versionIdByName(
  driver: SeedDriver,
  docId: string,
  name: string,
): Promise<string> {
  const found = (await driver.versions("sam", docId)).find(
    (v) => v.name === name,
  );
  if (found === undefined)
    throw new RangeError(`${docId} has no version named ${name}`);
  return found.id;
}

async function sendToNell(
  d: Drivers,
  spec: {
    docId: string;
    versionId: string;
    name: string;
    againstVersionId: string | null;
    sentAt: string;
    openedAt: string;
  },
): Promise<string> {
  await d.driver.setTime(d.time.at(spec.sentAt));
  const sent = await d.sharing.sendVersion("sam", {
    docId: spec.docId,
    versionId: spec.versionId,
    name: spec.name,
    what: "full",
    againstVersionId: spec.againstVersionId,
    files: ["pdf"],
    groupIds: ["guests"],
    recipientUserIds: [],
    watermark: true,
    link: null,
  });
  if (sent.recipientToken !== null) {
    await d.driver.setTime(d.time.at(spec.openedAt));
    await d.sharing.openDraftLink("nell-varga", sent.recipientToken);
  }
  const round = (await d.comments.rounds("sam", spec.docId)).find(
    (r) => r.versionId === spec.versionId,
  );
  if (round === undefined)
    throw new RangeError(`${spec.docId} has no round for ${spec.versionId}`);
  return round.roundId;
}

async function seedThread(
  d: Drivers,
  docId: string,
  roundId: string | null,
  anchor: TextAnchor | null,
  spec: SeededThread,
): Promise<void> {
  await d.driver.setTime(d.time.at(spec.at));
  const { threadId } = await d.comments.startThread(spec.authorUserId, docId, {
    anchor,
    roundId,
    body: spec.body,
  });
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

function blockOnPage(
  blocks: readonly FlatBlock[],
  pages: readonly { label: string; blockIndex: number }[],
  targetPage: number,
): FlatBlock {
  const clamped = Math.max(1, Math.min(targetPage, pages.length));
  const start = pages[clamped - 1]?.blockIndex ?? 0;
  const end = pages[clamped]?.blockIndex ?? blocks.length;
  for (let i = start; i < end; i += 1) {
    const block = blocks[i];
    if (block !== undefined && blockText(block).trim().length > 0) return block;
  }
  const fallback = blocks[Math.min(start, blocks.length - 1)];
  if (fallback === undefined)
    throw new RangeError(`no block available for page ${targetPage}`);
  return fallback;
}

function chaptersOf(blocks: readonly FlatBlock[]) {
  const headings: FlatBlock[] = [];
  const firstBody: FlatBlock[] = [];
  for (const block of blocks) {
    if (block.attrs.type === "chapter") {
      headings.push(block);
      firstBody.push(block);
    } else if (
      headings.length > 0 &&
      firstBody[headings.length - 1] === headings[headings.length - 1] &&
      block.attrs.type === "body" &&
      blockText(block).trim().length > 0
    ) {
      firstBody[headings.length - 1] = block;
    }
  }
  return { headings, firstBody };
}

function chapterAt(list: readonly FlatBlock[], chapter: number): FlatBlock {
  const target = list[chapter - 1];
  if (target === undefined)
    throw new RangeError(`Jumpox has no chapter ${chapter}`);
  return target;
}

async function grantGuests(
  d: Drivers,
  projectKey: string,
  docId: string,
  at: string,
): Promise<void> {
  const { projectId } = seedProject(projectKey);
  await d.driver.setTime(d.time.at(at));
  await d.sharing.setGroups(
    "sam",
    { projectId, workspaceId: "small" },
    SMALL_PROJECT_GROUPS,
  );
  await d.sharing.remove("sam", docId, "nell-varga");
  await d.sharing.grantGroup("sam", docId, "guests");
}

async function seedEveryKeyButOne(d: Drivers): Promise<void> {
  const { docId } = seedDoc(`${EKBO_PROJECT}/script`);
  const blocks = await readBlocks(d.driver, docId);
  const pages = await d.meter.pages(toSeedBlocks(blocks), {
    format: "screenplay",
    settings: {},
    anchors: null,
  });
  const firstDraftId = await versionIdByName(d.driver, docId, "First draft");
  const actOneName = "Second draft — Act One (for Nell)";
  const secondActOneId = await versionIdByName(d.driver, docId, actOneName);
  await grantGuests(d, EKBO_PROJECT, docId, "D−31 18:10");
  const firstRoundId = await sendToNell(d, {
    docId,
    versionId: firstDraftId,
    name: "First draft",
    againstVersionId: null,
    sentAt: "D−31 18:10",
    openedAt: "D−29 09:00",
  });
  for (const spec of EKBO_FIRST_DRAFT_THREADS) {
    const anchor = anchorOfBlock(blockOnPage(blocks, pages, spec.page));
    await seedThread(d, docId, firstRoundId, anchor, spec);
  }
  const secondRoundId = await sendToNell(d, {
    docId,
    versionId: secondActOneId,
    name: actOneName,
    againstVersionId: firstDraftId,
    sentAt: "D−3 18:00",
    openedAt: "D−2 19:00",
  });
  await seedThread(
    d,
    docId,
    secondRoundId,
    anchorOfQuote(blocks, EKBO_SCENE_14_QUOTE),
    EKBO_SCENE_14_THREAD,
  );
}

async function seedJumpox(d: Drivers): Promise<readonly FlatBlock[]> {
  const { docId } = seedDoc(`${JUMPOX_PROJECT}/manuscript`);
  const { headings, firstBody } = chaptersOf(await readBlocks(d.driver, docId));
  if (headings.length < 24)
    throw new RangeError(`expected 24 Jumpox chapters, got ${headings.length}`);
  const openingName = "Opening chapters (for Nell)";
  const openingId = await versionIdByName(d.driver, docId, openingName);
  const firstDraftId = await versionIdByName(d.driver, docId, "First draft");
  await grantGuests(d, JUMPOX_PROJECT, docId, "D−60 18:00");
  await sendToNell(d, {
    docId,
    versionId: openingId,
    name: openingName,
    againstVersionId: null,
    sentAt: "D−60 18:00",
    openedAt: "D−58 10:00",
  });
  const firstRoundId = await sendToNell(d, {
    docId,
    versionId: firstDraftId,
    name: "First draft",
    againstVersionId: openingId,
    sentAt: "D−8 18:00",
    openedAt: "D−7 10:00",
  });
  for (const spec of JUMPOX_FIRST_DRAFT_THREADS) {
    const anchor = anchorOfBlock(chapterAt(firstBody, spec.chapter));
    await seedThread(d, docId, firstRoundId, anchor, spec);
  }
  // written on D−2 so the book's history keeps no version from D−6 when the play was started
  await d.driver.setTime(d.time.at("D−2 11:00"));
  await d.material.addNotes(
    "sam",
    docId,
    JUMPOX_NOTES.map((note) => ({
      anchor: anchorOfBlock(chapterAt(firstBody, note.chapter)),
      text: note.text,
      writerName: "Sam Okafor",
    })),
  );
  return headings;
}

async function seedDownTheBack(
  d: Drivers,
  jumpoxChapters: readonly FlatBlock[],
): Promise<void> {
  const { projectId } = seedProject(PLAY_PROJECT);
  const playDocId = seedDoc(`${PLAY_PROJECT}/script`).docId;
  const jumpoxDocId = seedDoc(`${JUMPOX_PROJECT}/manuscript`).docId;
  const playBlocks = await readBlocks(d.driver, playDocId);
  const chapters: Record<string, string> = {};
  for (const block of playBlocks) {
    if (block.attrs.type !== "scene_heading") continue;
    const chapterNumber = PLAY_SCENE_CHAPTERS[blockText(block)];
    if (chapterNumber === undefined)
      throw new RangeError(`unmapped play scene heading: ${blockText(block)}`);
    chapters[blockIdOf(block)] = blockIdOf(
      chapterAt(jumpoxChapters, chapterNumber),
    );
  }
  const expected = Object.keys(PLAY_SCENE_CHAPTERS).length;
  if (Object.keys(chapters).length !== expected)
    throw new RangeError(
      `expected ${expected} mapped play scenes, got ${Object.keys(chapters).length}`,
    );
  const copiedAt = d.time.at("D−6 10:12");
  const versionId = await d.startFrom.latestVersionAt(
    "sam",
    jumpoxDocId,
    copiedAt,
  );
  await d.driver.setTime(copiedAt);
  await d.startFrom.linkSource(
    "sam",
    { projectId, workspaceId: "small", docId: playDocId },
    { docId: jumpoxDocId, versionId, copiedAt, chapters },
  );
  await d.driver.setTime(d.time.at("D−3 21:15"));
  await d.material.addNotes("sam", playDocId, [
    {
      anchor: anchorOfQuote(playBlocks, PLAY_NOTE_QUOTE),
      text: PLAY_NOTE_TEXT,
      writerName: "Sam Okafor",
    },
  ]);
}

export const SAMS_DESK_TOGETHER: SeedStep = {
  id: "sams-desk-together",
  workspace: "small",
  background: false,
  async run(context) {
    if (context.driver === null) return [];
    const drivers = requireDrivers(context);
    await seedEveryKeyButOne(drivers);
    const jumpoxChapters = await seedJumpox(drivers);
    await seedDownTheBack(drivers, jumpoxChapters);
    return [];
  },
};
