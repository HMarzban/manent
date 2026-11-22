// The Ferry: drafted by Sam from its headings, two named drafts, Dana's morning offline, and the session after it.
import {
  FERRY_SCENES_10_11,
  FERRY_SCENE_8_STUDIO,
  FERRY_SCENE_8_WORKING,
} from "../../content/medium/harbour-lights.ts";
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock } from "../../content/markup.ts";
import { HARBOUR_LIGHTS_GUIDE } from "../../generate/banks/medium/harbour-lights.ts";
import { deriveDrafts, sessionsBetween } from "../../generate/drafts.ts";
import type { BlockChange } from "../../generate/drafts.ts";
import { actionAt, intentsOf, unitsIn } from "../../generate/fit.ts";
import type { PageMeter } from "../../generate/fit.ts";
import type { SeedSession } from "../driver.ts";
import type { Rng } from "../rng.ts";
import type { SeedContext } from "../seed.ts";
import {
  applyBlockChanges,
  assertWritten,
  generateScript,
  indicesOf,
  sceneStart,
  toPages,
  unlockedLayout,
  usedNear,
} from "../story.ts";
import type { Story, WrittenScript } from "../story.ts";

const KEY = "medium/harbour-lights/204";
const GUIDE = HARBOUR_LIGHTS_GUIDE;
const WHERE = `${GUIDE.project}: 204`;
const PAGES = 52;
/** The lines of scene 8 Dana rewrote offline, each when she did; Sam rewrote AFTER_LINES once she was back. */
const OFFLINE_LINES = [
  ["N−10:20", 0],
  ["N−9:40", 7],
  ["N−9:05", 8],
] as const;
const AFTER_LINES = [2, 4, 5];
/** How many actions the session after Dana's reconnection adds to each scene it touches. */
const ADDED = [
  { scene: 10, actions: 1 },
  { scene: 15, actions: 5 },
  { scene: 26, actions: 5 },
] as const;

// the Studio draft: 38 scenes, scene 8 under its generated heading and scenes 10 and 11 fixed, 52 pages
async function studioDraft(
  context: SeedContext,
  meter: PageMeter,
): Promise<{ blocks: SeedBlock[]; fixed: Set<SeedBlock> }> {
  const { rng } = context;
  const generated = generateScript(GUIDE, KEY, rng);
  const scene8 = parseSeedText(FERRY_SCENE_8_STUDIO).blocks;
  const scenes10To11 = parseSeedText(FERRY_SCENES_10_11).blocks;
  const at = (n: number) => sceneStart(generated, n);
  const draft = [
    ...generated.slice(0, at(8) + 1),
    ...scene8,
    ...generated.slice(at(9), at(10)),
    ...scenes10To11,
    ...generated.slice(at(12)),
  ];
  const fixed = new Set([...scene8, ...scenes10To11]);
  const blocks = await toPages(draft, PAGES, {
    fixed,
    guide: GUIDE,
    rng,
    meter,
    layout: unlockedLayout(GUIDE),
  });
  return { blocks, fixed };
}

// scene 8's line `i` as the Working text has it, in place of the Studio draft's
function workingLine(script: WrittenScript, i: number): BlockChange {
  const at = sceneStart(script.blocks, 8) + 1 + i;
  const block = parseSeedText(FERRY_SCENE_8_WORKING).blocks[i]!;
  return { op: "replace", at, block };
}

// an unused action after each of the last units of the scenes ADDED names (after its last unit again when it
// has fewer, after its heading when it has none)
function addedActions(script: WrittenScript, rng: Rng): SeedBlock[] {
  const doc = [...script.blocks];
  for (const { scene, actions } of ADDED) {
    const start = sceneStart(doc, scene);
    const units = unitsIn(doc, start + 1, sceneStart(doc, scene + 1), {
      intentOf: intentsOf(GUIDE),
      movable: () => true,
    });
    const ends = units.map((unit) => unit.to);
    const places = Array.from(
      { length: actions },
      (_, n) => ends[ends.length - actions + n] ?? ends.at(-1) ?? start + 1,
    );
    for (const place of places.toReversed())
      doc.splice(
        place,
        0,
        actionAt(doc, place, {
          guide: GUIDE,
          rng,
          used: usedNear(doc, place, PAGES),
        }),
      );
  }
  return doc;
}

/**
 * Plans 204's history: Sam writes its 38 headings, drafts it in sessions, with Dana once, and names
 * Writer's First; Priya's fixes and Dana's Studio draft follow. On the train this morning Dana rewrites
 * three of scene 8's lines offline and reconnects, which keeps the script as it was before them as a
 * device version; the session after rewrites the other three, and adds to scenes 10, 15 and 26.
 */
export async function planFerry(
  context: SeedContext,
  story: Story,
  meter: PageMeter,
  plan: (at: string, run: () => Promise<void>) => void,
): Promise<void> {
  const { rng, ids } = context;
  const studio = await studioDraft(context, meter);
  const [firstPass, writersFirst] = await deriveDrafts(
    studio.blocks,
    [
      { name: null, pages: 46 },
      { name: "Writer's First", pages: 50 },
      { name: "Studio draft", pages: 52 },
    ],
    {
      fixed: indicesOf(studio.blocks, studio.fixed),
      guide: GUIDE,
      rng,
      meter,
      layout: unlockedLayout(GUIDE),
    },
  );
  const headings = studio.blocks.filter((b) => b.element === "scene_heading");
  const script: WrittenScript = { blocks: [], ids: [] };
  const sessions = (
    from: readonly SeedBlock[],
    to: readonly SeedBlock[],
    turns: readonly (readonly [string, string])[],
  ) => {
    const slices = sessionsBetween(from, to, turns.length);
    for (const [i, [at, userId]] of turns.entries())
      plan(at, () =>
        story.sessionWith(userId, KEY, (session) =>
          applyBlockChanges(session, script, slices[i]!, ids),
        ),
      );
  };
  sessions([], headings, [["D−18 11:00", "sam"]]);
  sessions(
    headings,
    firstPass!,
    ["D−17", "D−16", "D−15", "D−13", "D−11", "D−9", "D−8", "D−6"].map(
      (day) => [`${day} 10:30`, "sam"] as const,
    ),
  );
  sessions(firstPass!, writersFirst!, [
    ["D−5 09:30", "sam"],
    ["D−5 17:55", "sam"],
    ["D−5 17:55", "dana"],
    ["D−4 10:40", "sam"],
  ]);
  plan("D−4 18:05", async () => {
    await story.name("sam", KEY, "Writer's First");
  });
  sessions(writersFirst!, studio.blocks, [
    ["D−1 11:15", "sam"],
    ["D−1 15:12", "sam"],
    ["D−1 15:12", "priya"],
  ]);
  plan("D−1 17:40", async () => {
    await story.name("dana", KEY, "Studio draft");
  });

  // Dana's session on the train, open from her first offline change until she reconnects
  let train: SeedSession | null = null;
  const onTrain = (): SeedSession => {
    if (train === null)
      throw new RangeError("204's offline session is not open");
    return train;
  };
  plan("N−10:20", async () => {
    train = await story.session("dana", KEY);
    train.offline();
  });
  for (const [at, line] of OFFLINE_LINES)
    plan(at, () =>
      applyBlockChanges(onTrain(), script, [workingLine(script, line)], ids),
    );
  plan("N−8:58", async () => {
    await onTrain().online();
    await onTrain().close();
  });
  plan("N−3:50", async () => {
    await story.sessionWith("dana", KEY, async (session) => {
      const added = addedActions(script, rng);
      const [changes] = sessionsBetween(script.blocks, added, 1);
      await applyBlockChanges(session, script, changes!, ids);
    });
    await story.sessionWith("sam", KEY, async (session) => {
      const changes = AFTER_LINES.map((i) => workingLine(script, i));
      await applyBlockChanges(session, script, changes, ids);
    });
    const scene8 = script.ids[sceneStart(script.blocks, 8) + 1]!;
    const scene10 = script.ids[sceneStart(script.blocks, 10)]!;
    const working = parseSeedText(FERRY_SCENE_8_WORKING);
    await assertWritten(context, KEY, working, scene8, `${WHERE} scene 8`);
    const passage = parseSeedText(FERRY_SCENES_10_11);
    await assertWritten(context, KEY, passage, scene10, `${WHERE} scene 10`);
  });
}
