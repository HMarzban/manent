// Handed In episode 4: Sam's top notes block, excluded from timing.
import { scriptBody } from "@manent/crdt";
import type { BlockJSON } from "@manent/schema";
import { seedDoc } from "../catalogue.ts";
import type { SeedStep } from "../seed.ts";

const EPISODE_FOUR_KEY = "small/handed-in/ep4";
const NOTES_TEXT =
  "Bonus episode? Walter Fenn has been found — see today's Lannick One News closer.";

export const HANDED_IN_TIMING: SeedStep = {
  id: "handed-in-timing",
  workspace: "small",
  background: false,
  async run(context) {
    const { driver, ids, time } = context;
    if (driver === null) return [];
    await driver.setTime(time.at("D−1 16:00"));
    const session = await driver.open("sam", seedDoc(EPISODE_FOUR_KEY).docId);
    try {
      const noteBlock: BlockJSON = {
        type: "block",
        attrs: { id: ids(), type: "general", noTiming: true },
        content: [{ type: "text", text: NOTES_TEXT }],
      };
      await session.change((doc) => {
        scriptBody(doc).write((writer) => {
          writer.insertBlocks(null, [noteBlock]);
        });
      });
    } finally {
      await session.close();
    }
    return [];
  },
};
