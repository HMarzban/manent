// Harbour Lights, the six episodes of its second season, each at its own stage.
import { projectHome } from "@manent/sync-protocol";
import { SLACK_WATER_TYPO } from "../../content/medium/harbour-lights.ts";
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock } from "../../content/markup.ts";
import { HARBOUR_LIGHTS_GUIDE } from "../../generate/banks/medium/harbour-lights.ts";
import { deriveDrafts, sessionsBetween } from "../../generate/drafts.ts";
import type { BlockChange } from "../../generate/drafts.ts";
import { intentsOf, unitsIn } from "../../generate/fit.ts";
import { SeedBuildError } from "../../generate/guide.ts";
import { SEED_DOCS, seedProject } from "../catalogue.ts";
import type { SeedStep } from "../seed.ts";
import {
  applyBlockChanges,
  assertWritten,
  createStory,
  generateScript,
  meterOf,
  planSessions,
  sceneStart,
  toPages,
  unlockedLayout,
} from "../story.ts";
import type { Episode, Plan, WrittenScript } from "../story.ts";
import { planFerry } from "./harbour-lights-ferry.ts";
import { planSalt } from "./harbour-lights-salt.ts";

const STEP = "harbour-lights";
const PROJECT = "medium/harbour-lights";
const GUIDE = HARBOUR_LIGHTS_GUIDE;
const LAYOUT = unlockedLayout(GUIDE);
/** When the series' documents are made, before any episode's first line. */
const CREATED = "D−32 10:00";

/** The Writers' room as this series knows it: Dana owns it, Priya runs its production, Leo reads. */
const MEMBERS = [
  { userId: "sam", role: "edit", capabilities: [] },
  {
    userId: "priya",
    role: "edit",
    capabilities: ["issue_revisions", "lock_page_numbers"],
  },
  { userId: "leo", role: "comment", capabilities: [] },
] as const;

/** `blocks` brought to `pages` pages; `fixed` blocks are kept as they are. */
function fitted(
  { context, meter }: Episode,
  blocks: readonly SeedBlock[],
  pages: number,
  fixed: ReadonlySet<SeedBlock> = new Set(),
): Promise<SeedBlock[]> {
  const { rng } = context;
  return toPages(blocks, pages, {
    fixed,
    guide: GUIDE,
    rng,
    meter,
    layout: LAYOUT,
  });
}

const empty = (): WrittenScript => ({ blocks: [], ids: [] });

// the six ferry slip headings on six pages of their own, moved to the mainland slip at Ardle
function ardleChanges(
  white: readonly SeedBlock[],
  pages: readonly { label: string; blockIndex: number }[],
): { changes: BlockChange[]; labels: string[] } {
  const changes: BlockChange[] = [];
  const labels: string[] = [];
  for (const [i, block] of white.entries()) {
    const page = pages.findLast((p) => p.blockIndex <= i)?.label ?? null;
    if (block.element !== "scene_heading" || page === null) continue;
    if (!block.text.startsWith("EXT. FERRY SLIP - ") || labels.includes(page))
      continue;
    const text = block.text.replace("EXT. FERRY SLIP", "EXT. MAINLAND SLIP");
    changes.push({ op: "replace", at: i, block: { ...block, text } });
    labels.push(page);
    if (labels.length === 6) return { changes, labels };
  }
  throw new SeedBuildError("unfit", `${GUIDE.project}: six Ardle slip pages`);
}

// 201: written by Sam, White locked by Priya, and Blue issued for the scenes moved to the Ardle slip
async function planLowTide(episode: Episode): Promise<void> {
  const { context, story, meter, plan } = episode;
  const key = `${PROJECT}/201`;
  const generated = generateScript(GUIDE, key, context.rng);
  const white = await fitted(episode, generated, 58);
  const script = empty();
  const times = ["D−32 10:40", "D−31 10:15", "D−30 11:00", "D−29 10:30"];
  planSessions(
    episode,
    key,
    script,
    sessionsBetween([], white, times.length),
    times.map((at) => ({ at, userId: "sam" })),
  );
  plan("D−28 17:30", async () => {
    await story.name("sam", key, "Writer's First");
  });
  plan("D−24", () => story.lock("priya", key));
  const blue = ardleChanges(white, await meter.pages(white, LAYOUT));
  planSessions(
    episode,
    key,
    script,
    [blue.changes],
    [{ at: "D−13 11:20", userId: "sam" }],
  );
  const memo = `Blue revisions: pp. ${blue.labels.join(", ")}.`;
  plan("D−12", () => story.issue("priya", key, memo));
}

/** 203's scenes the Network's notes name, numbered as the bank orders them. */
const UNDERTOW = {
  /** Cal in the water: the safety boat stays in shot. */
  swim: 16,
  /** Maren's threat to resign, in Act Three once addressed. */
  resignation: 33,
  /** The scene the Network draft has her threat before, about page 12. */
  early: 12,
  /** Where the three lines are trimmed instead of the argument. */
  trimmed: [38, 40, 42],
} as const;

// [from, to) of the scene whose heading is `heading`, wherever it now stands
function sceneAt(
  blocks: readonly SeedBlock[],
  heading: SeedBlock,
): [number, number] {
  const from = blocks.indexOf(heading);
  const next = blocks.findIndex(
    (b, i) => i > from && b.element === "scene_heading",
  );
  return [from, next === -1 ? blocks.length : next];
}

// `blocks` with the scene under `heading` moved to just before the block `before`
function moveScene(
  blocks: readonly SeedBlock[],
  heading: SeedBlock,
  before: SeedBlock,
): SeedBlock[] {
  const [from, to] = sceneAt(blocks, heading);
  const rest = [...blocks.slice(0, from), ...blocks.slice(to)];
  const at = rest.indexOf(before);
  return [...rest.slice(0, at), ...blocks.slice(from, to), ...rest.slice(at)];
}

// `blocks` without the last unit of the scene under `heading` that speaks one line
function trimLine(
  blocks: readonly SeedBlock[],
  heading: SeedBlock,
): SeedBlock[] {
  const [from, to] = sceneAt(blocks, heading);
  const speech = unitsIn(blocks, from + 1, to, {
    intentOf: intentsOf(GUIDE),
    movable: () => true,
  }).findLast(
    (unit) =>
      blocks[unit.from]!.element === "character" &&
      blocks.slice(unit.from, unit.to).filter((b) => b.element === "dialogue")
        .length === 1,
  );
  if (speech === undefined)
    throw new SeedBuildError(
      "unfit",
      `${GUIDE.project}: a line to trim in 203`,
    );
  return [...blocks.slice(0, speech.from), ...blocks.slice(speech.to)];
}

/**
 * 203 as the Network draft has it, then with the first two notes addressed (the swim opens the
 * episode, Maren's threat moves to Act Three), then the Working text: the safety boat in the swim, and
 * three lines trimmed elsewhere instead of the argument the fourth note would shorten.
 */
async function undertowDrafts(
  episode: Episode,
  generated: readonly SeedBlock[],
): Promise<{
  network: SeedBlock[];
  addressed: SeedBlock[];
  working: SeedBlock[];
}> {
  const heading = (n: number) => generated[sceneStart(generated, n)]!;
  const resignation = heading(UNDERTOW.resignation);
  const early = moveScene(generated, resignation, heading(UNDERTOW.early));
  const network = await fitted(episode, early, 61);
  const addressed = moveScene(
    moveScene(network, resignation, heading(UNDERTOW.resignation + 1)),
    heading(3),
    heading(1),
  );
  const text = GUIDE.action.find((a) => a.startsWith("A safety boat"));
  if (text === undefined)
    throw new SeedBuildError("unfit", `${GUIDE.project}: the safety boat`);
  const boat: SeedBlock = { element: "action", text, marks: [], kind: null };
  const swim = addressed.indexOf(heading(UNDERTOW.swim)) + 1;
  // the one safety boat action of the bank stands in the swim alone, so it is never said twice
  let trimmed = [
    ...addressed.slice(0, swim).filter((b) => b.text !== text),
    boat,
    ...addressed.slice(swim).filter((b) => b.text !== text),
  ];
  for (const n of UNDERTOW.trimmed) trimmed = trimLine(trimmed, heading(n));
  const working = await fitted(episode, trimmed, 61, new Set([boat]));
  return { network, addressed, working };
}

// 203: three named drafts by Dana, then the sessions that answer the Network's first four notes
async function planUndertow(episode: Episode): Promise<void> {
  const { context, story, meter, plan } = episode;
  const key = `${PROJECT}/203`;
  const { rng } = context;
  const generated = generateScript(GUIDE, key, rng);
  const { network, addressed, working } = await undertowDrafts(
    episode,
    generated,
  );
  const [writersFirst, studio] = await deriveDrafts(
    network,
    [
      { name: "Writer's First", pages: 59 },
      { name: "Studio draft", pages: 60 },
      { name: "Network draft", pages: 61 },
    ],
    { fixed: new Set(), guide: GUIDE, rng, meter, layout: LAYOUT },
  );
  const script = empty();
  const sessions = (
    from: readonly SeedBlock[],
    to: readonly SeedBlock[],
    times: readonly string[],
  ) =>
    planSessions(
      episode,
      key,
      script,
      sessionsBetween(from, to, times.length),
      times.map((at) => ({ at, userId: "dana" })),
    );
  const named = (at: string, name: string) =>
    plan(at, async () => {
      await story.name("dana", key, name);
    });
  sessions([], writersFirst!, ["D−20 10:10", "D−19 10:30", "D−18 10:15"]);
  named("D−14", "Writer's First");
  sessions(writersFirst!, studio!, ["D−12 11:00", "D−11 10:30"]);
  named("D−9", "Studio draft");
  sessions(studio!, network, ["D−8 10:20", "D−7 10:40"]);
  named("D−5", "Network draft");
  sessions(network, addressed, ["D−3"]);
  sessions(addressed, working, ["D−2"]);
}

// 205: Sam writes scenes 1 to 14 and Dana 15 to 22, each in sessions of their own, the misspelt ferry in scene 4
async function planSlackWater(episode: Episode): Promise<void> {
  const { context, plan } = episode;
  const key = `${PROJECT}/205`;
  const generated = generateScript(GUIDE, key, context.rng);
  const typo = sceneStart(generated, 4) + 1;
  const passage = parseSeedText(SLACK_WATER_TYPO);
  const line = passage.blocks[0]!;
  const whole = await fitted(
    episode,
    [...generated.slice(0, typo), line, ...generated.slice(typo)],
    31,
    new Set([line]),
  );
  const split = sceneStart(whole, 15);
  const parts = { sam: whole.slice(0, split), dana: whole.slice(split) };
  const written = { sam: 0, dana: 0 };
  const script = empty();
  const turns: readonly (readonly [string, "sam" | "dana"])[] = [
    ["D−12 10:30", "sam"],
    ["D−11 14:00", "dana"],
    ["D−10 10:30", "sam"],
    ["D−8 14:00", "dana"],
    ["D−7 10:30", "sam"],
    ["D−5 14:00", "dana"],
    ["D−4 10:30", "sam"],
    ["D−2 14:00", "dana"],
    ["D−1 10:30", "sam"],
  ];
  const counts = { sam: 0, dana: 0 };
  for (const [at, userId] of turns) {
    counts[userId] += 1;
    const of = turns.filter(([, who]) => who === userId).length;
    const until = Math.round((parts[userId].length * counts[userId]) / of);
    plan(at, () =>
      episode.story.sessionWith(userId, key, async (session) => {
        // Sam's scenes come first, so Dana's are written after all of his so far
        const from = written[userId];
        const start = userId === "sam" ? from : written.sam + from;
        const changes = parts[userId]
          .slice(from, until)
          .map((block, i): BlockChange => ({
            op: "insert",
            at: start + i,
            block,
          }));
        await applyBlockChanges(session, script, changes, context.ids);
        written[userId] = until;
      }),
    );
  }
  plan("D−1 10:30", async () => {
    const firstBlockId = script.ids[script.blocks.indexOf(line)]!;
    const where = `${GUIDE.project}: 205 scene 4`;
    await assertWritten(context, key, passage, firstBlockId, where);
  });
}

// 206: the document only, a single empty scene heading waiting for its outline
function planBar({ context, story, plan }: Episode): void {
  const heading: SeedBlock = {
    element: "scene_heading",
    text: "",
    marks: [],
    kind: null,
  };
  plan("D−20 16:30", () =>
    story.sessionWith("dana", `${PROJECT}/206`, async (session) => {
      await story.write(session, [heading], null, context.ids);
    }),
  );
}

export const HARBOUR_LIGHTS: SeedStep = {
  id: STEP,
  workspace: "medium",
  background: false,
  async run(context) {
    const project = seedProject(PROJECT);
    const documents = SEED_DOCS.filter((d) => d.projectKey === PROJECT);
    const entries = [{ project: project.title, documents: documents.length }];
    const { driver } = context;
    if (driver === null) return entries;
    const story = createStory(context, STEP);
    const rows: { at: number; spec: string; run: () => Promise<void> }[] = [];
    const plan: Plan = (spec, run) =>
      rows.push({ at: context.time.at(spec), spec, run });
    const episode: Episode = { context, story, meter: meterOf(context), plan };
    plan(CREATED, async () => {
      // the room's index, which The Long Night's step makes first: making it again changes nothing, and lets
      // the series be seeded on its own
      await driver.workspace("dana", "medium", MEMBERS);
      const home = projectHome(project.projectId);
      for (const { docId, kind } of documents)
        await driver.create("dana", {
          docId,
          kind,
          home,
          workspaceId: "medium",
        });
      const at = context.time.at(CREATED);
      await driver.index("dana", "medium", {
        projects: [project],
        documents,
        at,
      });
    });
    await planLowTide(episode);
    await planSalt(episode);
    await planUndertow(episode);
    await planFerry(episode);
    await planSlackWater(episode);
    planBar(episode);
    for (const row of rows.toSorted((a, b) => a.at - b.at)) {
      await story.at(row.spec);
      await row.run();
    }
    return entries;
  },
};
