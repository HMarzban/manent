// As Sam, brings scene 14 of Every Key But One back from the second draft when it holds the first draft's text.
import { scriptBody } from "@manent/crdt";
import { blocksOf } from "@manent/schema";
import type { DocJSON, FlatBlock } from "@manent/schema";
import { parseSeedText } from "../../content/markup.ts";
import {
  EKBO_SCENE_14_FIRST,
  EKBO_SCENE_14_SECOND,
} from "../../content/small/every-key-but-one.ts";
import { seedDoc } from "../../seed/catalogue.ts";
import { SeedDriverError } from "../../seed/driver.ts";
import type { TourPreparation } from "./index.ts";
import { READY } from "./seeded-doc.ts";

const SAM = "sam";
const SCENE = 14;
const SECOND_DRAFT = "Second draft — Act One (for Nell)";

const textOf = (block: FlatBlock): string =>
  block.runs.map((run) => run.text).join("");

/** The first draft's lines that the second draft does not keep. */
function firstOnly(): ReadonlySet<string> {
  const second = new Set(
    parseSeedText(EKBO_SCENE_14_SECOND).blocks.map((b) => b.text),
  );
  return new Set(
    parseSeedText(EKBO_SCENE_14_FIRST)
      .blocks.map((b) => b.text)
      .filter((text) => !second.has(text)),
  );
}

/** Scene 14's heading id while the scene holds a line only the first draft has; null otherwise. */
function firstDraftScene(content: DocJSON): string | null {
  const blocks = blocksOf(content);
  const headings = blocks.flatMap((b, i) =>
    b.attrs.type === "scene_heading" ? [i] : [],
  );
  const from = headings[SCENE - 1];
  if (from === undefined) return null;
  const scene = blocks.slice(from, headings[SCENE] ?? blocks.length);
  const first = firstOnly();
  return scene.some((b) => first.has(textOf(b)))
    ? (blocks[from]?.attrs.id ?? null)
    : null;
}

export const EKBO_SCENE_14_SECOND_DRAFT: TourPreparation = {
  id: "ekbo-scene-14-second-draft",
  async run(driver) {
    const { docId } = seedDoc("small/every-key-but-one/script");
    const session = await driver.open(SAM, docId);
    let headingId: string | null;
    try {
      headingId = firstDraftScene(scriptBody(session.doc).materialize());
    } finally {
      await session.close();
    }
    if (headingId === null) return READY;
    const draft = (await driver.versions(SAM, docId)).find(
      (v) => v.name === SECOND_DRAFT,
    );
    if (draft === undefined)
      throw new SeedDriverError("unavailable", `${docId} has no second draft`);
    await driver.restore(SAM, docId, draft.id, { kind: "scene", headingId });
    return READY;
  },
};
