// The lines a simulated writer types in a seeded document: those of the bank the seed writes it from.
import {
  HARBOUR_LIGHTS_GUIDE,
  LAMP_ROOM_GUIDE,
  LONG_NIGHT_GUIDE,
  TWELVE_ON_FOOT_GUIDE,
} from "../generate/banks/medium/index.ts";
import { EKBO_GUIDE, HANDED_IN_GUIDE } from "../generate/banks/small/index.ts";
import { guideLines } from "../generate/guide.ts";
import type { WriterLine } from "../writers/region.ts";
import { SEED_DOCS, seedProject } from "./catalogue.ts";

/**
 * The lines a writer types in the seeded document `docId`, each a whole sentence or speech in the elements
 * its format writes it in: a live show's news, else its screen guide's (guideLines); null for any other
 * document. Lanternfield Studios' banks load on first use.
 */
export async function writerLines(
  docId: string,
): Promise<readonly WriterLine[] | null> {
  const doc = SEED_DOCS.find((d) => d.docId === docId);
  if (doc === undefined) return null;
  if (seedProject(doc.projectKey).workspaceId === "heavy") {
    const { linesOf } = await import("./steps/studio-content.ts");
    return linesOf(doc);
  }
  return guideLines(
    [
      EKBO_GUIDE,
      HANDED_IN_GUIDE,
      LONG_NIGHT_GUIDE,
      HARBOUR_LIGHTS_GUIDE,
      LAMP_ROOM_GUIDE,
      TWELVE_ON_FOOT_GUIDE,
    ],
    doc,
  );
}
