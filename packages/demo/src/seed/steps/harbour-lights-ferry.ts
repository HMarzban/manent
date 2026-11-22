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
import {
  actionAt,
  fitToPages,
  intentsOf,
  unitsIn,
} from "../../generate/fit.ts";
import type { SeedSession } from "../driver.ts";
import type { Rng } from "../rng.ts";
import {
  applyBlockChanges,
  assertWritten,
  generateScript,
  indicesOf,
  planSessions,
  sceneStart,
  toPages,
  unlockedLayout,
  usedNear,
} from "./harbour-lights-script.ts";
import type { Episode, WrittenScript } from "./harbour-lights-script.ts";

const KEY = "medium/harbour-lights/204";
const GUIDE = HARBOUR_LIGHTS_GUIDE;
const WHERE = `${GUIDE.project}: 204`;
const PAGES = 52;
const LAYOUT = unlockedLayout(GUIDE);
/** The page scene 8 starts, where the Tour sends the tester to read what changed. */
const SCENE_8_PAGE = 12;
/** The lines of scene 8 Dana rewrote offline, each when she did; Sam rewrote AFTER_LINES once she was back. */
const OFFLINE_LINES = [
  ["N−10:20", 0],
  ["N−9:40", 7],
  ["N−9:05", 8],
] as const;
const AFTER_LINES = [2, 4, 5];
/** Sam's first pass and the two named drafts, the last of them the Studio draft itself. */
const FERRY_DRAFTS = [
  { name: null, pages: 46 },
  { name: "Writer's First", pages: 50 },
  { name: "Studio draft", pages: PAGES },
] as const;
/** How many actions the session after Dana's reconnection adds to each scene it touches. */
const ADDED = [
  { scene: 10, actions: 1 },
  { scene: 15, actions: 5 },
  { scene: 26, actions: 5 },
] as const;

// the Studio draft: 38 scenes, scene 8 under its generated heading starting page 12, and scenes 10 and 11
// fixed, 52 pages; the text before scene 8 and the text from it are each brought to their pages first
async function studioDraft({
  context,
  meter,
}: Episode): Promise<{ blocks: SeedBlock[]; fixed: Set<number> }> {
  const { rng } = context;
  const generated = generateScript(GUIDE, KEY, rng);
  const scene8 = parseSeedText(FERRY_SCENE_8_STUDIO).blocks;
  const scenes10To11 = parseSeedText(FERRY_SCENES_10_11).blocks;
  const at = (n: number) => sceneStart(generated, n);
  const fixed = new Set([...scene8, ...scenes10To11]);
  const options = { fixed, guide: GUIDE, rng, meter, layout: LAYOUT };
  const before = await toPages(
    generated.slice(0, at(8)),
    SCENE_8_PAGE - 1,
    options,
  );
  const after = await toPages(
    [
      ...generated.slice(at(8), at(8) + 1),
      ...scene8,
      ...generated.slice(at(9), at(10)),
      ...scenes10To11,
      ...generated.slice(at(12)),
    ],
    PAGES - SCENE_8_PAGE + 1,
    options,
  );
  const joined = [...before, ...after];
  const blocks = await fitToPages(
    joined,
    [
      {
        generated: [0, before.length],
        mustStart: { page: String(SCENE_8_PAGE), blockIndex: before.length },
      },
    ],
    {
      meter,
      guide: GUIDE,
      rng,
      used: usedNear(GUIDE, joined, before.length, PAGES),
      totals: [{ layout: LAYOUT, pages: PAGES }],
    },
  );
  return { blocks, fixed: indicesOf(blocks, fixed) };
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
          used: usedNear(GUIDE, doc, place, PAGES),
        }),
      );
  }
  return doc;
}

// Dana's session on the train, open from her first offline change until she reconnects at N−8:58
function planOffline(episode: Episode, script: WrittenScript): void {
  const { context, story, plan } = episode;
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
      applyBlockChanges(
        onTrain(),
        script,
        [workingLine(script, line)],
        context.ids,
      ),
    );
  plan("N−8:58", async () => {
    await onTrain().online();
    await onTrain().close();
  });
}

// the session after Dana's return: she adds to scenes 10, 15 and 26, then Sam rewrites the rest of scene 8
function planReturn(episode: Episode, script: WrittenScript): void {
  const { context, story, plan } = episode;
  const { rng, ids } = context;
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

const sam = (at: string): { at: string; userId: string } => ({
  at,
  userId: "sam",
});

/**
 * Plans 204's history: Sam writes its 38 headings, drafts it in sessions, with Dana once, and names
 * Writer's First; Priya's fixes and Dana's Studio draft follow. On the train this morning Dana rewrites
 * three of scene 8's lines offline and reconnects, which keeps the script as it was before them as a
 * device version; the session after rewrites the other three, and adds to scenes 10, 15 and 26.
 */
export async function planFerry(episode: Episode): Promise<void> {
  const { context, story, meter, plan } = episode;
  const { rng } = context;
  const studio = await studioDraft(episode);
  const [firstPass, writersFirst] = await deriveDrafts(
    studio.blocks,
    FERRY_DRAFTS,
    { fixed: studio.fixed, guide: GUIDE, rng, meter, layout: LAYOUT },
  );
  const headings = studio.blocks.filter((b) => b.element === "scene_heading");
  const script: WrittenScript = { blocks: [], ids: [] };
  const sessions = (
    from: readonly SeedBlock[],
    to: readonly SeedBlock[],
    turns: readonly { at: string; userId: string }[],
  ) =>
    planSessions(
      episode,
      KEY,
      script,
      sessionsBetween(from, to, turns.length),
      turns,
    );
  sessions([], headings, [sam("D−18 11:00")]);
  sessions(
    headings,
    firstPass!,
    ["D−17", "D−16", "D−15", "D−13", "D−11", "D−9", "D−8", "D−6"].map((day) =>
      sam(`${day} 10:30`),
    ),
  );
  sessions(firstPass!, writersFirst!, [
    sam("D−5 09:30"),
    sam("D−5 17:55"),
    { at: "D−5 17:55", userId: "dana" },
    sam("D−4 10:40"),
  ]);
  plan("D−4 18:05", async () => {
    await story.name("sam", KEY, "Writer's First");
  });
  sessions(writersFirst!, studio.blocks, [
    sam("D−1 11:15"),
    sam("D−1 15:12"),
    { at: "D−1 15:12", userId: "priya" },
  ]);
  plan("D−1 17:40", async () => {
    await story.name("dana", KEY, "Studio draft");
  });
  planOffline(episode, script);
  planReturn(episode, script);
}
