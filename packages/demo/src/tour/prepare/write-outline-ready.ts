// As Dana, empties 206 The Bar's script back to one empty scene heading ready for Start script from outline.
import { scriptBody } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import { seedDoc } from "../../seed/catalogue.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

export const WRITE_OUTLINE_READY: TourPreparation = {
  id: "write-outline-ready",
  async run(driver) {
    const { docId } = seedDoc("medium/harbour-lights/206");
    const session = await driver.open("dana", docId);
    try {
      const blocks = blocksOf(scriptBody(session.doc).materialize());
      if (
        blocks.length === 1 &&
        blocks[0]?.attrs.type === "scene_heading" &&
        blockText(blocks[0]) === ""
      )
        return READY;
      const [first, ...rest] = blocks;
      if (first === undefined || first.attrs.id === null) return READY;
      const firstId = first.attrs.id;
      const firstLen = blockText(first).length;
      const restIds = rest
        .map((block) => block.attrs.id)
        .filter((id): id is string => id !== null);
      await session.change((doc) =>
        scriptBody(doc).write((writer) => {
          for (const id of restIds) writer.deleteBlock(id);
          if (firstLen > 0) writer.deleteText(firstId, 0, firstLen);
          writer.setBlockAttrs(firstId, {
            type: "scene_heading",
            synopsis: "",
          });
        }),
      );
    } finally {
      await session.close();
    }
    return READY;
  },
};
