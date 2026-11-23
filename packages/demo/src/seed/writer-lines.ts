// The lines a simulated writer types in a document: those of the bank the seed writes it from, or of a
// screenplay's bank in a document no bank writes.
import { DOWN_THE_BACK_LINES } from "../content/small/index.ts";
import { parseSeedText } from "../content/markup.ts";
import {
  HARBOUR_LIGHTS_GUIDE,
  LAMP_ROOM_GUIDE,
  LONG_NIGHT_GUIDE,
  TWELVE_ON_FOOT_GUIDE,
} from "../generate/banks/medium/index.ts";
import { EKBO_GUIDE, HANDED_IN_GUIDE } from "../generate/banks/small/index.ts";
import { guideLines } from "../generate/guide.ts";
import { linesOfBlocks } from "../writers/region.ts";
import type { WriterLine } from "../writers/region.ts";
import { SEED_DOCS, seedDoc, seedProject } from "./catalogue.ts";
import type { SeedDoc } from "./catalogue.ts";

const GUIDES = Object.freeze([
  EKBO_GUIDE,
  HANDED_IN_GUIDE,
  LONG_NIGHT_GUIDE,
  HARBOUR_LIGHTS_GUIDE,
  LAMP_ROOM_GUIDE,
  TWELVE_ON_FOOT_GUIDE,
]);

/** Projects whose writers' lines are written out in the seed's markup rather than drawn from a guide. */
const WRITTEN: Readonly<Record<string, string>> = Object.freeze({
  "small/down-the-back": DOWN_THE_BACK_LINES,
});

// a document no bank writes takes its lines from this screenplay: a writer sits only in a scene heading's
// scene, and every format with scene headings writes a screenplay's action, cues and dialogue
const ANY_SCRIPT = "small/every-key-but-one/script";

async function linesOf(doc: SeedDoc): Promise<readonly WriterLine[] | null> {
  if (seedProject(doc.projectKey).workspaceId === "heavy") {
    const studio = await import("./steps/studio-content.ts");
    return studio.linesOf(doc);
  }
  const written = WRITTEN[doc.projectKey];
  if (written === undefined) return guideLines(GUIDES, doc);
  return linesOfBlocks(
    parseSeedText(written).blocks.map(({ element, text }) => ({
      element,
      text,
    })),
  );
}

/**
 * The lines a writer types in `docId`, each a whole sentence or speech in the elements its format writes it
 * in: a live show's news, its screen guide's (guideLines) or its own written lines when the seed writes the
 * document; otherwise Every Key But One's. Lanternfield Studios' banks load on first use.
 */
export async function writerLines(
  docId: string,
): Promise<readonly WriterLine[]> {
  const doc = SEED_DOCS.find((d) => d.docId === docId) ?? seedDoc(ANY_SCRIPT);
  const lines = (await linesOf(doc)) ?? (await linesOf(seedDoc(ANY_SCRIPT)));
  if (lines === null) throw new RangeError(`no bank writes ${ANY_SCRIPT}`);
  return lines;
}
