// The Late Desk row 5: Ana's open comment on Benny's Mailbag.
import { scriptBody } from "@manent/crdt";
import { blockText, blocksOf, textAnchorAt } from "@manent/schema";
import type { TextAnchor } from "@manent/schema";
import { seedDoc } from "../catalogue.ts";
import type { SeedDriver } from "../driver.ts";
import type { SeedStep } from "../seed.ts";

const DOC_KEY = "medium/the-late-desk/segments/5";
const COMMENT_AT = "N−0:50";
const COMMENT_BODY = "Mailbag is the obvious 0:50 — Sam, which letter goes?";

async function firstDialogueAnchor(
  driver: SeedDriver,
  docId: string,
): Promise<TextAnchor> {
  const session = await driver.open("ana", docId);
  try {
    const blocks = blocksOf(scriptBody(session.doc).materialize());
    const first = blocks.find((block) => block.attrs.type === "dialogue");
    if (first === undefined)
      throw new RangeError(`${DOC_KEY} has no dialogue block`);
    if (first.attrs.id === null)
      throw new RangeError(`${DOC_KEY} first dialogue block has no id`);
    const text = blockText(first);
    return textAnchorAt({ id: first.attrs.id, text }, 0, text.length);
  } finally {
    await session.close();
  }
}

export const ROW_FIVE_COMMENT: SeedStep = {
  id: "row-five-comment",
  workspace: "medium",
  background: false,
  async run(context) {
    const { driver, time } = context;
    if (driver === null) return [];
    if (driver.comments === null) {
      context.skip("comments", "Ana's comment on The Late Desk row 5");
      return [];
    }
    const { docId } = seedDoc(DOC_KEY);
    const anchor = await firstDialogueAnchor(driver, docId);
    await driver.setTime(time.at(COMMENT_AT));
    await driver.comments.startThread("ana", docId, {
      anchor,
      roundId: null,
      body: COMMENT_BODY,
    });
    return [];
  },
};
