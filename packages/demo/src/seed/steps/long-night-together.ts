// The Long Night working together: groups, draft links, Leo's last read at White, rounds and comments.
import { scriptBody } from "@manent/crdt";
import { blockText, blocksOf, isBlockType, textAnchorAt } from "@manent/schema";
import type { FlatBlock, TextAnchor } from "@manent/schema";
import type { SeedBlock } from "../../content/markup.ts";
import {
  LONG_NIGHT_FIRST_DRAFT_THREADS,
  LONG_NIGHT_NETWORK_THREADS,
  LONG_NIGHT_TABLE_READ_THREADS,
} from "../../content/medium/long-night-rounds.ts";
import {
  LONG_NIGHT_GROUPS,
  LONG_NIGHT_OPEN_THREADS,
  LONG_NIGHT_WHITE_NOTE,
} from "../../content/medium/long-night-together.ts";
import type {
  LongNightTarget,
  LongNightThread,
} from "../../content/medium/long-night-together.ts";
import type { PageMeter } from "../../generate/fit.ts";
import { seedDoc, seedDraftToken, seedProject } from "../catalogue.ts";
import type { SeedComments } from "../capabilities/comments.ts";
import type { SeedSharing } from "../capabilities/sharing.ts";
import { SeedDriverError } from "../driver.ts";
import type { SeedDriver, SeedProduction } from "../driver.ts";
import type { SeedContext, SeedStep } from "../seed.ts";
import type { SeedTime } from "../time.ts";

const PROJECT_KEY = "medium/the-long-night";
const DOC_KEY = `${PROJECT_KEY}/script`;
const ANCHOR_SPAN_CHARS = 48;
const PHARMACY_HEADING = "INT. CALLOW PARADE - PHARMACY";

interface Drivers {
  readonly driver: SeedDriver;
  readonly comments: SeedComments;
  readonly sharing: SeedSharing;
  readonly production: SeedProduction;
  readonly meter: PageMeter;
  readonly time: SeedTime;
}

interface ScriptIndex {
  readonly blocks: readonly FlatBlock[];
  readonly pages: readonly { label: string; blockIndex: number }[];
  readonly sceneStarts: readonly number[];
}

function requireDrivers(context: SeedContext): Drivers {
  const { driver, meter, time } = context;
  if (driver === null || meter === null)
    throw new RangeError(
      "long-night-together requires a driver and page meter",
    );
  const { comments, sharing, production } = driver;
  if (comments === null || sharing === null || production === null)
    throw new SeedDriverError(
      "unavailable",
      "required seed capabilities are off",
    );
  return { driver, comments, sharing, production, meter, time };
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

async function indexScript(d: Drivers, docId: string): Promise<ScriptIndex> {
  const session = await d.driver.open("dana", docId);
  let blocks: readonly FlatBlock[];
  try {
    blocks = blocksOf(scriptBody(session.doc).materialize());
  } finally {
    await session.close();
  }
  const pages = await d.meter.pages(toSeedBlocks(blocks), {
    format: "screenplay",
    settings: {},
    anchors: null,
  });
  // Exclude added Blue scene 26A so sceneStarts[n - 1] matches original White scene n (1..96).
  const sceneStarts = blocks.flatMap((block, index) =>
    block.attrs.type === "scene_heading" &&
    !blockText(block).startsWith(PHARMACY_HEADING)
      ? [index]
      : [],
  );
  return { blocks, pages, sceneStarts };
}

const anchorOfBlock = (block: FlatBlock): TextAnchor => {
  const text = blockText(block);
  return textAnchorAt(
    { id: blockIdOf(block), text },
    0,
    Math.min(text.length, ANCHOR_SPAN_CHARS),
  );
};

function blockOnPage(index: ScriptIndex, page: number): FlatBlock {
  const clamped = Math.max(1, Math.min(page, index.pages.length));
  const start = index.pages[clamped - 1]?.blockIndex ?? 0;
  const end = index.pages[clamped]?.blockIndex ?? index.blocks.length;
  for (let i = start; i < end; i += 1) {
    const block = index.blocks[i];
    if (block !== undefined && blockText(block).trim().length > 0) return block;
  }
  const fallback = index.blocks[Math.min(start, index.blocks.length - 1)];
  if (fallback === undefined)
    throw new RangeError(`no block on page ${page} of ${DOC_KEY}`);
  return fallback;
}

function sceneRange(index: ScriptIndex, sceneNumber: number): [number, number] {
  const start = index.sceneStarts[sceneNumber - 1];
  if (start === undefined)
    throw new RangeError(`${DOC_KEY} has no scene ${sceneNumber}`);
  const end =
    index.blocks.findIndex(
      (block, i) => i > start && block.attrs.type === "scene_heading",
    ) ?? -1;
  return [start, end === -1 ? index.blocks.length : end];
}

function anchorOfTarget(
  index: ScriptIndex,
  target: LongNightTarget,
): TextAnchor {
  if (target.kind === "page")
    return anchorOfBlock(blockOnPage(index, target.page));
  const [start, end] = sceneRange(index, target.scene);
  if (target.kind === "scene") {
    const chosen =
      index.blocks
        .slice(start + 1, end)
        .find((b) => blockText(b).trim().length > 0) ?? index.blocks[start]!;
    return anchorOfBlock(chosen);
  }
  if (target.kind === "removed") {
    const dialogue =
      index.blocks
        .slice(start + 1, end)
        .find((b) => b.attrs.type === "dialogue") ?? index.blocks[start]!;
    return textAnchorAt(
      { id: blockIdOf(dialogue), text: target.quote },
      0,
      target.quote.length,
    );
  }
  for (let i = start; i < end; i += 1) {
    const block = index.blocks[i]!;
    const text = blockText(block);
    const at = text.indexOf(target.quote);
    if (at >= 0)
      return textAnchorAt(
        { id: blockIdOf(block), text },
        at,
        at + target.quote.length,
      );
  }
  throw new RangeError(
    `quote not found in scene ${target.scene}: ${target.quote}`,
  );
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

async function roundIdFor(
  comments: SeedComments,
  docId: string,
  versionId: string,
  name: string,
): Promise<string> {
  const found = (await comments.rounds("dana", docId)).find(
    (r) => r.versionId === versionId && r.name === name,
  );
  if (found === undefined)
    throw new RangeError(`${docId} has no round ${name} on ${versionId}`);
  return found.roundId;
}

async function seedThread(
  d: Drivers,
  docId: string,
  index: ScriptIndex,
  roundId: string | null,
  spec: LongNightThread,
): Promise<void> {
  await d.driver.setTime(d.time.at(spec.at));
  const { threadId } = await d.comments.startThread(spec.authorUserId, docId, {
    anchor: anchorOfTarget(index, spec.target),
    roundId,
    body: spec.body,
  });
  for (const reply of spec.replies) {
    await d.driver.setTime(d.time.at(reply.at));
    await d.comments.reply(reply.authorUserId, docId, {
      threadId,
      body: reply.body,
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

async function seedLongNightTogether(d: Drivers): Promise<void> {
  const { projectId } = seedProject(PROJECT_KEY);
  const { docId } = seedDoc(DOC_KEY);
  const index = await indexScript(d, docId);
  const firstId = await versionIdByName(d.driver, docId, "First draft");
  const secondId = await versionIdByName(d.driver, docId, "Second draft");
  const tableReadId = await versionIdByName(
    d.driver,
    docId,
    "Table read draft",
  );
  const prod = await d.production.state("priya", docId);
  const whiteId = prod.sets.find((s) => s.ordinal === 0)?.issuedVersionId;
  const blueId = prod.sets.find((s) => s.ordinal === 1)?.issuedVersionId;
  if (whiteId === null || whiteId === undefined)
    throw new RangeError(`${DOC_KEY} has no White version`);
  if (blueId === null || blueId === undefined)
    throw new RangeError(`${DOC_KEY} has no Blue version`);

  await d.driver.setTime(d.time.at("D−70 09:15"));
  await d.sharing.setGroups(
    "dana",
    { projectId, workspaceId: "medium" },
    LONG_NIGHT_GROUPS,
  );
  const firstSent = await d.sharing.sendVersion("dana", {
    docId,
    versionId: firstId,
    name: "First draft",
    what: "full",
    againstVersionId: null,
    files: ["pdf"],
    groupIds: ["producers"],
    recipientUserIds: [],
    watermark: true,
    link: { signIn: true, expiresInMs: null },
  });
  if (firstSent.recipientToken !== null) {
    await d.driver.setTime(d.time.at("D−66 09:00"));
    await d.sharing.openDraftLink("leo", firstSent.recipientToken);
  }
  const firstRound = await roundIdFor(d.comments, docId, firstId, "Producers");
  for (const spec of LONG_NIGHT_FIRST_DRAFT_THREADS)
    await seedThread(d, docId, index, firstRound, spec);

  await d.driver.setTime(d.time.at("D−48 10:00"));
  const secondSent = await d.sharing.sendVersion("dana", {
    docId,
    versionId: secondId,
    name: "Second draft",
    what: "full",
    againstVersionId: firstId,
    files: ["pdf"],
    groupIds: ["studio", "network"],
    recipientUserIds: [],
    watermark: false,
    link: { signIn: true, expiresInMs: null },
  });
  if (secondSent.recipientToken !== null) {
    await d.driver.setTime(d.time.at("D−46 11:00"));
    await d.sharing.openDraftLink("leo", secondSent.recipientToken);
  }
  const networkRound = await roundIdFor(d.comments, docId, secondId, "Network");
  for (const spec of LONG_NIGHT_NETWORK_THREADS)
    await seedThread(d, docId, index, networkRound, spec);

  await d.driver.setTime(d.time.at("D−32 16:00"));
  await d.sharing.sendVersion("dana", {
    docId,
    versionId: tableReadId,
    name: "Table read draft",
    what: "full",
    againstVersionId: secondId,
    files: ["pdf"],
    groupIds: ["network", "cast"],
    recipientUserIds: [],
    watermark: false,
    link: null,
  });
  await d.driver.setTime(d.time.at("D−30 09:30"));
  const { roundId: tableRound } = await d.comments.startRound("dana", docId, {
    name: "Table read",
    versionId: tableReadId,
  });
  for (const spec of LONG_NIGHT_TABLE_READ_THREADS)
    await seedThread(d, docId, index, tableRound, spec);

  // Send White to all 131 recipients and record Leo reading White on D−20.
  await d.driver.setTime(d.time.at("D−21 10:20"));
  const whiteSent = await d.sharing.sendVersion("priya", {
    docId,
    versionId: whiteId,
    name: "White production draft",
    what: "full",
    againstVersionId: null,
    files: ["pdf"],
    groupIds: ["production", "cast", "studio", "network"],
    recipientUserIds: [],
    watermark: false,
    link: { signIn: true, expiresInMs: null },
  });
  if (whiteSent.recipientToken !== null) {
    await d.driver.setTime(d.time.at("D−20 10:00"));
    await d.sharing.openDraftLink("leo", whiteSent.recipientToken);
  }
  const whiteRound = await roundIdFor(d.comments, docId, whiteId, "Network");
  await seedThread(d, docId, index, whiteRound, LONG_NIGHT_WHITE_NOTE);

  // Issue Blue's draft link to Leo too, without opening it, so his link opens Blue and compares against White.
  await d.driver.setTime(d.time.at("D−1 22:41"));
  await d.sharing.sendVersion("priya", {
    docId,
    versionId: blueId,
    name: "Blue",
    what: "changed",
    againstVersionId: whiteId,
    files: ["pdf_marked"],
    groupIds: ["production", "cast", "studio", "network"],
    recipientUserIds: [],
    watermark: false,
    link: { signIn: true, expiresInMs: null },
    recipientToken: seedDraftToken(DOC_KEY, "Blue"),
  });
  await d.driver.setTime(d.time.at("D−20 10:00"));
  await d.sharing.recordLastRead("leo", docId, whiteId);

  for (const spec of LONG_NIGHT_OPEN_THREADS)
    await seedThread(d, docId, index, null, spec);
}

export const LONG_NIGHT_TOGETHER: SeedStep = {
  id: "long-night-together",
  workspace: "medium",
  background: false,
  async run(context) {
    if (context.driver === null) return [];
    await seedLongNightTogether(requireDrivers(context));
    return [];
  },
};
