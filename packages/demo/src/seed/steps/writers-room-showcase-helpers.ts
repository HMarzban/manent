// Shared block and session helpers for the Writers' room foreground showcase steps.
import { scriptBody } from "@manent/crdt";
import type { BlockJSON, GraphicAttrs } from "@manent/schema";
import type { SeedBlock } from "../../content/markup.ts";
import { seedDoc } from "../catalogue.ts";
import type { SeedContext } from "../seed.ts";
import { setFormat, toBlockJSON } from "../story.ts";

export function graphicBlock(
  id: string,
  graphic: GraphicAttrs,
  caption: string,
): BlockJSON {
  return {
    type: "block",
    attrs: { id, type: "graphic", graphic },
    ...(caption === "" ? {} : { content: [{ type: "text", text: caption }] }),
  };
}

/** Writes parsed markup blocks into an empty seeded script, setting its format first. */
export async function writeInitial(
  context: SeedContext,
  options: {
    userId: string;
    docKey: string;
    at: string;
    blocks: readonly SeedBlock[];
    prepend?: readonly BlockJSON[];
  },
): Promise<{ ids: string[]; blocks: SeedBlock[] }> {
  const { driver, ids, time } = context;
  if (driver === null) return { ids: [], blocks: [] };
  const docId = seedDoc(options.docKey).docId;
  await driver.setTime(time.at(options.at));
  const session = await driver.open(options.userId, docId);
  const writtenIds = options.blocks.map(() => ids());
  const json: BlockJSON[] = [
    ...(options.prepend ?? []),
    ...options.blocks.map((block, i) => toBlockJSON(block, writtenIds[i]!)),
  ];
  try {
    await setFormat(context, session, options.docKey);
    await session.change((doc) =>
      scriptBody(doc).write((w) => {
        if (!w.insertBlocks(null, json))
          throw new RangeError(`could not write ${options.docKey}`);
      }),
    );
  } finally {
    await session.close();
  }
  return { ids: writtenIds, blocks: [...options.blocks] };
}

/** Replaces the plain text of block `blockId` in `docKey` in a new edit session. */
export async function replaceTextInSession(
  context: SeedContext,
  options: {
    userId: string;
    docKey: string;
    at: string;
    replacements: readonly { blockId: string; from: string; to: string }[];
    insertAfter?: { afterId: string; blocks: readonly BlockJSON[] };
  },
): Promise<void> {
  const { driver, time } = context;
  if (driver === null) return;
  const docId = seedDoc(options.docKey).docId;
  await driver.setTime(time.at(options.at));
  const session = await driver.open(options.userId, docId);
  try {
    await session.change((doc) =>
      scriptBody(doc).write((w) => {
        for (const r of options.replacements) {
          w.deleteText(r.blockId, 0, r.from.length);
          w.insertText(r.blockId, 0, r.to);
        }
        if (options.insertAfter !== undefined) {
          w.insertBlocks(options.insertAfter.afterId, [
            ...options.insertAfter.blocks,
          ]);
        }
      }),
    );
  } finally {
    await session.close();
  }
}
