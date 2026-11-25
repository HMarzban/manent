// As Sam, puts the Monologue's traffic joke back as its line and moves the night market joke back to Cuts if restored.
import {
  ALTERNATES_MAP,
  isAlternate,
  jsonMap,
  scriptBody,
  swapAlternate,
} from "@manent/crdt";
import { blockText, blocksOf, randomBlockId } from "@manent/schema";
import { MONOLOGUE_ALTERNATES } from "../../content/medium/monologue-material.ts";
import { seedDoc } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

const DOC_KEY = "medium/the-late-desk/monologue";
const ORIGINAL_TRAFFIC =
  "The city has also announced a plan to end traffic by 2040. The plan is: wait until 2040. Engineers call it ambitious. Drivers call it the commute.";
const TRAFFIC_LINES = new Set([
  ORIGINAL_TRAFFIC,
  ...MONOLOGUE_ALTERNATES.filter((a) =>
    a.targetQuote.includes("plan to end traffic"),
  ).map((a) => a.text),
]);
const NIGHT_MARKET = "The night market opens tomorrow on Exchange Square.";

export const WRITE_ALTERNATES_READY: TourPreparation = {
  id: "write-alternates-ready",
  async run(driver, time) {
    if (driver.writersMaterial === null)
      throw new SeedDriverError(
        "unavailable",
        "the server has no writers' material",
      );
    const { docId } = seedDoc(DOC_KEY);
    const session = await driver.open("sam", docId);
    let cutBlockIds: string[] = [];
    try {
      const blocks = blocksOf(scriptBody(session.doc).materialize());
      const traffic = blocks.find((b) => TRAFFIC_LINES.has(blockText(b)));
      if (
        traffic !== undefined &&
        traffic.attrs.id !== null &&
        blockText(traffic) !== ORIGINAL_TRAFFIC
      ) {
        const blockId = traffic.attrs.id;
        const alts = jsonMap(session.doc, ALTERNATES_MAP).entries();
        const original = Object.entries(alts).find(
          ([, value]) =>
            isAlternate(value) &&
            value.blockId === blockId &&
            value.text === ORIGINAL_TRAFFIC,
        );
        if (original !== undefined) {
          await session.change((doc) => {
            swapAlternate(doc, {
              blockId,
              swapIn: { type: "alternate", alternateId: original[0] },
              authorUserId: "dana",
              now: () => time.nowAt,
              ids: randomBlockId,
            });
          });
        }
      }
      const nightIndex = blocks.findIndex((b) =>
        blockText(b).includes(NIGHT_MARKET),
      );
      if (nightIndex >= 0) {
        const dialogue = blocks[nightIndex];
        const cue = blocks[nightIndex - 1];
        const ids = [
          cue?.attrs.type === "character" ? cue.attrs.id : null,
          dialogue?.attrs.id ?? null,
        ].filter((id): id is string => id !== null);
        cutBlockIds = ids;
      }
    } finally {
      await session.close();
    }
    if (cutBlockIds.length > 0)
      await driver.writersMaterial.moveToCuts("sam", docId, cutBlockIds);
    return READY;
  },
};
