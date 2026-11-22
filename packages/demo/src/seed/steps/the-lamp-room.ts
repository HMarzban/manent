// The Lamp Room, the short film whose settings change; and how a document is brought to a later draft.
import { scriptBody } from "@manent/crdt";
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import { LAMP_ROOM_SCENE_3_OPENING } from "../../content/medium/the-lamp-room.ts";
import { LAMP_ROOM_GUIDE } from "../../generate/banks/medium/the-lamp-room.ts";
import { deriveDrafts, sessionsBetween } from "../../generate/drafts.ts";
import type { BlockChange } from "../../generate/drafts.ts";
import {
  actionAt,
  fitToPages,
  intentsOf,
  unitsIn,
} from "../../generate/fit.ts";
import type { SeedLayout } from "../../generate/fit.ts";
import { generateScenes } from "../../generate/grammar.ts";
import type { StyleGuide } from "../../generate/guide.ts";
import type { SeedSession } from "../driver.ts";
import type { SeedStep } from "../seed.ts";
import { createStory } from "../story.ts";
import {
  append,
  checkPassages,
  createDocument,
  projectEntry,
  rewrite,
  runInOrder,
  setting,
} from "./the-late-desk.ts";
import type { Replica, Telling } from "./the-late-desk.ts";

/**
 * Applies `changes` (positions as `sessionsBetween` gives them) to the replica and the session's document: a run
 * of inserts is one write, a rewrite of plain text in the same element keeps the block's id, any other rewrite
 * takes the block out and writes the new one in its place.
 */
export async function applyChanges(
  telling: Telling,
  session: SeedSession,
  replica: Replica,
  changes: readonly BlockChange[],
): Promise<void> {
  const remove = async (at: number) => {
    await session.change((doc) =>
      scriptBody(doc).write((writer) => {
        writer.deleteBlock(replica.ids[at]!);
      }),
    );
    replica.ids.splice(at, 1);
    replica.blocks.splice(at, 1);
  };
  for (let i = 0; i < changes.length;) {
    const change = changes[i]!;
    if (change.op === "delete") {
      await remove(change.at);
      i += 1;
      continue;
    }
    const was = replica.blocks[change.at];
    const plain = change.block.marks.length === 0 && was?.marks.length === 0;
    if (
      change.op === "replace" &&
      plain &&
      was?.element === change.block.element
    ) {
      await rewrite(session, replica, change.at, change.block.text);
      i += 1;
      continue;
    }
    if (change.op === "replace") await remove(change.at);
    const run = [change.block];
    for (i += 1; i < changes.length; i += 1) {
      const next = changes[i]!;
      if (next.op !== "insert" || next.at !== change.at + run.length) break;
      run.push(next.block);
    }
    const after = change.at === 0 ? null : replica.ids[change.at - 1]!;
    const ids = await telling.story.write(
      session,
      run,
      after,
      telling.context.ids,
    );
    replica.ids.splice(change.at, 0, ...ids);
    replica.blocks.splice(change.at, 0, ...run);
  }
}

/**
 * Whether Dana's change of D−4 is made: The Lamp Room is fitted to 12 pages on US Letter and 11 on A4 with
 * Scene CONTINUED on when true, and with it off when no length holds both that way.
 */
const LAMP_ROOM_SCENE_CONTINUED = true;

const PROJECT_KEY = "medium/the-lamp-room";
const KEY = `${PROJECT_KEY}/script`;
const LETTER_PAGES = 12;
const A4_PAGES = 11;
// the First draft is reached by way of a longer one, so the sessions after it both add text and take it out
const LONGER_PAGES = 13;
const OPENING_SCENE = 3;
// D−1: six changes, three in each of two scenes
const REWRITTEN_SCENES = 2;
const REWRITES_PER_SCENE = 3;

const layoutOf = (paper: string, continued: boolean): SeedLayout => ({
  format: "screenplay",
  settings: { "script.paper": paper, "script.sceneContinued": continued },
  anchors: null,
});

/**
 * The generator writes more than a beat's pages hold: each scene keeps the first of its generated units in the
 * share `pages` allows of what `blocks` measure, so a fit is left only a few units to add or take out.
 */
export async function withinPages(
  telling: Telling,
  blocks: readonly SeedBlock[],
  options: {
    guide: StyleGuide;
    fixed: ReadonlySet<SeedBlock>;
    pages: number;
    layout: SeedLayout;
  },
): Promise<SeedBlock[]> {
  const measured = (await telling.driver.meter.pages(blocks, options.layout))
    .length;
  if (measured <= options.pages) return [...blocks];
  const share = options.pages / measured;
  const headings = blocks.flatMap((b, i) =>
    b.element === "scene_heading" ? [i] : [],
  );
  const unit = {
    intentOf: intentsOf(options.guide),
    movable: (i: number) => !options.fixed.has(blocks[i]!),
  };
  const dropped = new Set<number>();
  for (const [k, from] of headings.entries()) {
    const units = unitsIn(blocks, from, headings[k + 1] ?? blocks.length, unit);
    for (const { from: first, to } of units.slice(
      Math.ceil(units.length * share),
    ))
      for (let i = first; i < to; i += 1) dropped.add(i);
  }
  return blocks.filter((_, i) => !dropped.has(i));
}

/** The script as it reads now: the seven beats written, scene 3 opening with the fixed text, fitted to its pages. */
async function workingScript(
  telling: Telling,
  passage: SeedPassage,
  used: Set<string>,
): Promise<SeedBlock[]> {
  const { rng } = telling.context;
  const guide = LAMP_ROOM_GUIDE;
  const written: SeedBlock[] = [];
  for (const beat of guide.beats.filter((b) => b.id.startsWith(`${KEY}#`))) {
    const [heading, ...rest] = generateScenes(guide, beat, rng, used);
    const fixed = beat.scenes[0] === OPENING_SCENE ? passage.blocks : [];
    written.push(heading!, ...fixed, ...rest);
  }
  const continued = LAMP_ROOM_SCENE_CONTINUED;
  const letter = layoutOf("letter", continued);
  const blocks = await withinPages(telling, written, {
    guide,
    fixed: new Set(passage.blocks),
    pages: LETTER_PAGES,
    layout: letter,
  });
  const opening = blocks.indexOf(passage.blocks[0]!);
  const end = opening + passage.blocks.length;
  return fitToPages(
    blocks,
    [
      { generated: [0, opening], mustStart: null },
      { generated: [end, blocks.length], mustStart: null },
    ],
    {
      meter: telling.driver.meter,
      guide,
      rng,
      used,
      totals: [
        { layout: letter, pages: LETTER_PAGES },
        { layout: layoutOf("a4", continued), pages: A4_PAGES },
      ],
    },
  );
}

/** The script before Sam's session of D−1: in the last two scenes with three generated actions, those three read otherwise. */
function beforeLastSession(
  telling: Telling,
  working: readonly SeedBlock[],
  options: { fixed: ReadonlySet<SeedBlock>; used: Set<string> },
): SeedBlock[] {
  const draft = [...working];
  const headings = working.flatMap((b, i) =>
    b.element === "scene_heading" ? [i] : [],
  );
  const scenes = headings
    .map((from, k) =>
      working
        .slice(from, headings[k + 1] ?? working.length)
        .flatMap((b, i) =>
          b.element === "action" && !options.fixed.has(b) ? [from + i] : [],
        ),
    )
    .filter((actions) => actions.length >= REWRITES_PER_SCENE)
    .slice(-REWRITTEN_SCENES);
  const drawing = {
    guide: LAMP_ROOM_GUIDE,
    rng: telling.context.rng,
    used: options.used,
  };
  for (const at of scenes.flatMap((actions) =>
    actions.slice(0, REWRITES_PER_SCENE),
  ))
    draft[at] = actionAt(draft, at, drawing);
  return draft;
}

const OUTLINE_AT = "D−30 10:00";
const TO_FIRST_DRAFT = [
  ["D−29 10:30", "sam"],
  ["D−25 14:00", "dana"],
  ["D−21 11:00", "sam"],
  ["D−17 15:30", "dana"],
  ["D−14 12:00", "sam"],
] as const;
const FIRST_DRAFT_AT = "D−12 16:30";
const AFTER_FIRST_DRAFT = [
  ["D−7 11:30", "sam"],
  ["D−4 10:00", "dana"],
  ["D−2 14:30", "sam"],
] as const;
// Dana switches Scene CONTINUED on just before her session of D−4
const SCENE_CONTINUED_AT = "D−4 09:50";
const LAST_SESSION_AT = "D−1 15:20";

/** The script's drafts, oldest first: its outline, the First draft, the script before D−1, and as it reads now. */
async function lampRoomDrafts(
  telling: Telling,
  passage: SeedPassage,
): Promise<{
  outline: SeedBlock[];
  firstDraft: SeedBlock[];
  before: SeedBlock[];
  working: SeedBlock[];
}> {
  const used = new Set<string>();
  const working = await workingScript(telling, passage, used);
  // the First draft was named before Dana switched Scene CONTINUED on
  const [firstDraft] = await deriveDrafts(
    working,
    [
      { name: "First draft", pages: LETTER_PAGES },
      { name: null, pages: LONGER_PAGES },
      { name: null, pages: LETTER_PAGES },
    ],
    {
      fixed: new Set(passage.blocks.map((b) => working.indexOf(b))),
      guide: LAMP_ROOM_GUIDE,
      rng: telling.context.rng,
      meter: telling.driver.meter,
      layout: layoutOf("letter", false),
    },
  );
  for (const b of firstDraft!) used.add(b.text);
  const fixed = new Set(passage.blocks);
  return {
    outline: firstDraft!.filter((b) => b.element === "scene_heading"),
    firstDraft: firstDraft!,
    before: beforeLastSession(telling, working, { fixed, used }),
    working,
  };
}

async function tellLampRoom(telling: Telling): Promise<void> {
  const { story } = telling;
  const passage = parseSeedText(LAMP_ROOM_SCENE_3_OPENING);
  const { outline, firstDraft, before, working } = await lampRoomDrafts(
    telling,
    passage,
  );
  const replica: Replica = { ids: [], blocks: [] };
  const session = (userId: string, changes: readonly BlockChange[]) => () =>
    story.sessionWith(userId, KEY, (s) =>
      applyChanges(telling, s, replica, changes),
    );
  const sceneContinued = {
    at: SCENE_CONTINUED_AT,
    run: () =>
      story.sessionWith("dana", KEY, (s) =>
        setting(telling, s, "script.sceneContinued", true),
      ),
  };
  const toFirst = sessionsBetween(outline, firstDraft, TO_FIRST_DRAFT.length);
  const toBefore = sessionsBetween(
    firstDraft,
    before,
    AFTER_FIRST_DRAFT.length,
  );
  const [last] = sessionsBetween(before, working, 1);
  const created = {
    key: KEY,
    userId: "sam",
    at: OUTLINE_AT,
    withProject: true,
  };
  await runInOrder(telling, [
    {
      at: OUTLINE_AT,
      run: () =>
        createDocument(telling, created, (s) =>
          append(telling, s, replica, outline),
        ),
    },
    ...TO_FIRST_DRAFT.map(([at, userId], i) => ({
      at,
      run: session(userId, toFirst[i]!),
    })),
    {
      at: FIRST_DRAFT_AT,
      run: async () => void (await story.name("sam", KEY, "First draft")),
    },
    ...AFTER_FIRST_DRAFT.map(([at, userId], i) => ({
      at,
      run: session(userId, toBefore[i]!),
    })),
    ...(LAMP_ROOM_SCENE_CONTINUED ? [sceneContinued] : []),
    { at: LAST_SESSION_AT, run: session("sam", last!) },
  ]);
  const firstBlockId = replica.ids[replica.blocks.indexOf(passage.blocks[0]!)]!;
  await checkPassages(telling, LAMP_ROOM_GUIDE.project, [
    { key: KEY, passage, firstBlockId },
  ]);
}

export const THE_LAMP_ROOM: SeedStep = {
  id: "the-lamp-room",
  workspace: "medium",
  background: false,
  async run(context) {
    const { driver } = context;
    if (driver !== null)
      await tellLampRoom({
        context,
        driver,
        story: createStory(context, "the-lamp-room"),
      });
    return projectEntry(PROJECT_KEY);
  },
};
