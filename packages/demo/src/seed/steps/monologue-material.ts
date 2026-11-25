// The Late Desk's Monologue material: three alternates, seven cuts with origins, and Dana's resolved comment.
import { scriptBody } from "@manent/crdt";
import { blockText, blocksOf, textAnchorAt } from "@manent/schema";
import type { BlockJSON, FlatBlock } from "@manent/schema";
import {
  MONOLOGUE_ALTERNATES,
  MONOLOGUE_COMMENT,
  MONOLOGUE_CUTS,
} from "../../content/medium/monologue-material.ts";
import { seedDoc } from "../catalogue.ts";
import type { SeedComments } from "../capabilities/comments.ts";
import type { SeedWritersMaterial } from "../capabilities/writers-material.ts";
import { SeedDriverError } from "../driver.ts";
import type { SeedDriver } from "../driver.ts";
import type { SeedContext, SeedStep } from "../seed.ts";
import type { SeedTime } from "../time.ts";

const DOC_KEY = "medium/the-late-desk/monologue";

interface Drivers {
  readonly driver: SeedDriver;
  readonly comments: SeedComments;
  readonly material: SeedWritersMaterial;
  readonly time: SeedTime;
  readonly ids: () => string;
}

function requireDrivers(context: SeedContext): Drivers {
  const { driver, time, ids } = context;
  if (driver === null)
    throw new RangeError("monologue-material requires a driver");
  const { comments, writersMaterial: material } = driver;
  if (comments === null || material === null)
    throw new SeedDriverError(
      "unavailable",
      "required seed capabilities are off",
    );
  return { driver, comments, material, time, ids };
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

function findBlockByQuote(
  blocks: readonly FlatBlock[],
  quote: string,
): FlatBlock {
  const found = blocks.find((block) => blockText(block).includes(quote));
  if (found === undefined)
    throw new RangeError(`quote not found in ${DOC_KEY}: ${quote}`);
  return found;
}

const textBlock = (
  id: string,
  type: "character" | "dialogue",
  text: string,
): BlockJSON => ({
  type: "block",
  attrs: { id, type },
  content: [{ type: "text", text }],
});

async function seedMonologueMaterial(d: Drivers): Promise<void> {
  const { docId } = seedDoc(DOC_KEY);
  const blocks = await readBlocks(d.driver, docId);
  const slug = blocks.find((block) => block.attrs.type === "slug") ?? blocks[0];
  if (slug === undefined) throw new RangeError(`${DOC_KEY} has no blocks`);
  const sceneHeadingId = blockIdOf(slug);

  for (const alternate of MONOLOGUE_ALTERNATES) {
    const target = findBlockByQuote(blocks, alternate.targetQuote);
    await d.driver.setTime(d.time.at(alternate.at));
    await d.material.addAlternate(alternate.authorUserId, docId, {
      blockId: blockIdOf(target),
      text: alternate.text,
      pitched: alternate.pitched,
    });
  }

  for (const cut of MONOLOGUE_CUTS) {
    const origin = findBlockByQuote(blocks, cut.afterQuote);
    await d.driver.setTime(d.time.at(cut.at));
    await d.material.addCut(cut.authorUserId, docId, {
      blocks: [
        textBlock(d.ids(), "character", cut.speaker),
        textBlock(d.ids(), "dialogue", cut.dialogue),
      ],
      afterBlockId: blockIdOf(origin),
      sceneHeadingId,
    });
  }

  const otterBlock = findBlockByQuote(blocks, MONOLOGUE_COMMENT.quote);
  const otterText = blockText(otterBlock);
  const start = otterText.indexOf(MONOLOGUE_COMMENT.quote);
  const anchor = textAnchorAt(
    { id: blockIdOf(otterBlock), text: otterText },
    start,
    start + MONOLOGUE_COMMENT.quote.length,
  );
  await d.driver.setTime(d.time.at(MONOLOGUE_COMMENT.at));
  const { threadId } = await d.comments.startThread(
    MONOLOGUE_COMMENT.authorUserId,
    docId,
    { anchor, roundId: null, body: MONOLOGUE_COMMENT.body },
  );
  for (const reply of MONOLOGUE_COMMENT.replies) {
    await d.driver.setTime(d.time.at(reply.at));
    await d.comments.reply(reply.authorUserId, docId, {
      threadId,
      body: reply.body,
    });
  }
  await d.driver.setTime(d.time.at(MONOLOGUE_COMMENT.resolved.at));
  await d.comments.resolve(MONOLOGUE_COMMENT.resolved.byUserId, docId, {
    threadId,
    outcome: null,
    reason: null,
  });
}

export const MONOLOGUE_MATERIAL: SeedStep = {
  id: "monologue-material",
  workspace: "medium",
  background: false,
  async run(context) {
    if (context.driver === null) return [];
    await seedMonologueMaterial(requireDrivers(context));
    return [];
  },
};
