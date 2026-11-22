// Handed In, its four episodes.
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock } from "../../content/markup.ts";
import { HANDED_IN_EP1_OPENING } from "../../content/small/index.ts";
import { intentsOf, unitsIn } from "../../generate/fit.ts";
import {
  HANDED_IN_GUIDE,
  SeedBuildError,
  createUsedLines,
  generateScenes,
} from "../../generate/index.ts";
import type { Rng } from "../rng.ts";
import type { SeedStep } from "../seed.ts";
import {
  checkPassages,
  createProject,
  createStory,
  ownPages,
  projectEntry,
  setFormat,
} from "../story.ts";

const PROJECT = "small/handed-in";
/** Each episode's one session, at the day it was released, recorded or worked on. */
const SESSIONS: readonly { slug: string; at: string }[] = [
  { slug: "ep1", at: "D−14 10:20" },
  { slug: "ep2", at: "D−7 10:20" },
  { slug: "ep3", at: "D−2 10:20" },
  { slug: "ep4", at: "D 10:20" },
];
const AS_RECORDED = { slug: "ep3", at: "D−2 16:50", name: "As recorded" };
/** The beats episode one's fixed opening already tells. */
const OPENING_BEATS = 2;
/** Pages more than its beats for an episode's last segment, which is then cut to the episode's running time. */
const MARGIN_PAGES = 2;
const CHARACTERS_PER_SECOND = 11.25;
const CUE_TIME = new RegExp("T=(\\d+):(\\d{2})");

const msOf = (time: string): number => {
  const [, minutes, seconds] = CUE_TIME.exec(time) ?? [];
  return (Number(minutes ?? 0) * 60 + Number(seconds ?? 0)) * 1000;
};

/** The read-aloud time of `blocks`: its dialogue's characters at the read rate, and each cue's time. */
function durationMs(blocks: readonly SeedBlock[]): number {
  const characters = blocks
    .filter((b) => b.element === "dialogue")
    .reduce((sum, b) => sum + b.text.length, 0);
  const cues = blocks
    .filter((b) => b.element === "bracket")
    .reduce((sum, b) => sum + msOf(b.text), 0);
  return Math.round((characters / CHARACTERS_PER_SECOND) * 1000) + cues;
}

// "T=0:06 a tram bell" is written as the script prints a cue: "[A TRAM BELL T=0:06]"
const cue = (bracket: string): SeedBlock => {
  const [time = "", ...what] = bracket.split(" ");
  const text = `[${what.join(" ").toUpperCase()} ${time}]`;
  return { element: "bracket", text, marks: [], kind: null };
};

// a podcast's segments, in the order an episode runs them
const SEGMENTS = [
  "COLD OPEN",
  "PART ONE",
  "PART TWO",
  "PART THREE",
  "PART FOUR",
] as const;

/** The segment `n` of an episode, named as the script prints it, after the place the generated heading names. */
function segment(n: number, heading: string): SeedBlock {
  const place = heading.slice(0, heading.lastIndexOf(" - "));
  const where = place
    .replace(/^(INT|EXT)\. /, "")
    .split(" - ")
    .at(-1)!;
  const name = SEGMENTS[n];
  if (name === undefined)
    throw new RangeError(`an episode has no segment ${n}`);
  const text = n === 0 ? name : `${name} — ${where}`;
  return { element: "slug", text, marks: [], kind: null };
}

/**
 * The generated part of an episode from `from` on, its scene headings made the segments they are in a podcast,
 * the first numbered `first`; its cues spread over them in order, the first after each segment's slug and the
 * rest at its end.
 */
function segmented(
  blocks: readonly SeedBlock[],
  options: { from: number; first: number; brackets: readonly string[] },
): SeedBlock[] {
  const { from, first, brackets } = options;
  const headings = blocks.flatMap((b, i) =>
    i >= from && b.element === "scene_heading" ? [i] : [],
  );
  const out = blocks.slice(0, from);
  for (const [j, at] of headings.entries()) {
    const end = headings[j + 1] ?? blocks.length;
    const share = brackets
      .slice(
        Math.floor((j * brackets.length) / headings.length),
        Math.floor(((j + 1) * brackets.length) / headings.length),
      )
      .map(cue);
    out.push(segment(first + j, blocks[at]!.text), ...share.slice(0, 1));
    out.push(...blocks.slice(at + 1, end), ...share.slice(1));
  }
  return out;
}

/** The episode `slug`, written to its running time: its `fixed` opening, then its segments, cut to time. */
function episodeOf(
  slug: string,
  fixed: readonly SeedBlock[],
  rng: Rng,
): SeedBlock[] {
  const guide = HANDED_IN_GUIDE;
  const story = guide.stories.find((s) => s.slug === slug)!;
  const where = `${guide.project}: ${slug}`;
  const used = createUsedLines();
  for (const block of fixed) used.pass(block);
  const beats = guide.beats
    .filter((b) => b.id.startsWith(`${PROJECT}/${slug}#`))
    .slice(fixed.length === 0 ? 0 : OPENING_BEATS);
  const generated = beats.flatMap((_, i) => {
    const { pages, ...beat } = ownPages(beats, i);
    const margin = i === beats.length - 1 ? MARGIN_PAGES : 0;
    const longer = { ...beat, pages: [pages[0], pages[1] + margin] as const };
    return generateScenes(guide, longer, rng, used);
  });
  const doc = [...fixed, ...generated];
  const cues = story.brackets.reduce((sum, b) => sum + msOf(b), 0);
  if (durationMs(doc) + cues < story.durMs)
    throw new SeedBuildError("unfit", where);
  const intentOf = intentsOf(guide);
  // while the episode runs over, a unit goes (a question keeps its answer): the shortest that brings it to time,
  // else the last
  for (let over = durationMs(doc) + cues - story.durMs; over > 0;) {
    const units = unitsIn(doc, fixed.length, doc.length, {
      intentOf,
      movable: () => true,
    }).map((unit) => ({
      unit,
      ms: durationMs(doc.slice(unit.from, unit.to)),
    }));
    const enough = units
      .filter(({ ms }) => ms >= over)
      .toSorted((a, b) => a.ms - b.ms)[0];
    const { unit } = enough ?? units.at(-1) ?? {};
    if (unit === undefined) throw new SeedBuildError("unfit", where);
    doc.splice(unit.from, unit.to - unit.from);
    over = durationMs(doc) + cues - story.durMs;
  }
  const first = fixed.length === 0 ? 0 : OPENING_BEATS;
  return segmented(doc, {
    from: fixed.length,
    first,
    brackets: story.brackets,
  });
}

export const HANDED_IN: SeedStep = {
  id: "handed-in",
  workspace: "small",
  background: false,
  async run(context) {
    const entries = [projectEntry(PROJECT)];
    const { driver, rng, ids } = context;
    if (driver === null) return entries;
    const story = createStory(context, "handed-in");
    const opening = parseSeedText(HANDED_IN_EP1_OPENING);
    const episodes = SESSIONS.map(({ slug }, i) =>
      episodeOf(slug, i === 0 ? opening.blocks : [], rng),
    );
    await story.at(SESSIONS[0]!.at);
    await createProject(driver, {
      userId: "sam",
      projectKey: PROJECT,
      at: context.time.at(SESSIONS[0]!.at),
    });
    const written: string[][] = [];
    for (const [i, { slug, at }] of SESSIONS.entries()) {
      const key = `${PROJECT}/${slug}`;
      await story.at(at);
      await story.sessionWith("sam", key, async (s) => {
        await setFormat(context, s, key);
        written.push(await story.write(s, episodes[i]!, null, ids));
      });
      if (slug !== AS_RECORDED.slug) continue;
      await story.at(AS_RECORDED.at);
      await story.name("sam", key, AS_RECORDED.name);
    }
    const doc = { blocks: episodes[0]!, ids: written[0]! };
    const key = `${PROJECT}/${SESSIONS[0]!.slug}`;
    await checkPassages(driver, { key, doc, where: HANDED_IN_GUIDE.project }, [
      opening,
    ]);
    return entries;
  },
};
