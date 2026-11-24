// As Dana, removes any extra pitches added to Ida's speech in scene 6 of 205 Slack Water beyond the two seeded ones.
import { ALTERNATES_MAP, isAlternate, jsonMap, scriptBody } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";
import type { FlatBlock } from "@manent/schema";
import { SLACK_WATER_PITCHES } from "../../content/medium/harbour-lights-room.ts";
import { seedDoc } from "../../seed/catalogue.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

const SEEDED_TEXTS = new Set(SLACK_WATER_PITCHES.map((pitch) => pitch.text));

function scene6IdaSpeechId(blocks: readonly FlatBlock[]): string | null {
  let seen = 0;
  const start = blocks.findIndex(
    (block) => block.attrs.type === "scene_heading" && ++seen === 6,
  );
  if (start === -1) return null;
  const next = blocks.findIndex(
    (block, i) => i > start && block.attrs.type === "scene_heading",
  );
  const slice = blocks.slice(start, next === -1 ? blocks.length : next);
  const cueIdx = slice.findIndex(
    (block, i) =>
      block.attrs.type === "character" &&
      blockText(block).trim() === "IDA" &&
      slice[i + 1]?.attrs.type === "dialogue",
  );
  const dialogue =
    (cueIdx >= 0 ? slice[cueIdx + 1] : undefined) ??
    slice.find((block) => block.attrs.type === "dialogue");
  return dialogue?.attrs.id ?? null;
}

export const TOGETHER_PRESENT_READY: TourPreparation = {
  id: "together-present-ready",
  async run(driver) {
    const { docId } = seedDoc("medium/harbour-lights/205");
    const session = await driver.open("dana", docId);
    try {
      const blocks = blocksOf(scriptBody(session.doc).materialize());
      const speechId = scene6IdaSpeechId(blocks);
      if (speechId === null) return READY;
      const entries = jsonMap(session.doc, ALTERNATES_MAP).entries();
      const extraIds = Object.entries(entries)
        .filter(
          ([, value]) =>
            isAlternate(value) &&
            value.blockId === speechId &&
            !SEEDED_TEXTS.has(value.text),
        )
        .map(([id]) => id);
      if (extraIds.length > 0) {
        await session.change((doc) => {
          const map = jsonMap(doc, ALTERNATES_MAP);
          for (const id of extraIds) map.delete(id);
        });
      }
    } finally {
      await session.close();
    }
    return READY;
  },
};
