// Salt: White locked by Priya, then Dana's Blue pages after Leo's note, ready to issue and not issued.
import { scriptBody } from "@manent/crdt";
import { SALT_LINES } from "../../content/medium/harbour-lights.ts";
import { parseSeedText } from "../../content/markup.ts";
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import { HARBOUR_LIGHTS_GUIDE } from "../../generate/banks/medium/harbour-lights.ts";
import { sessionsBetween } from "../../generate/drafts.ts";
import {
  fitAPages,
  fitToPages,
  intentsOf,
  unitsIn,
} from "../../generate/fit.ts";
import type { Unit } from "../../generate/fit.ts";
import { SeedBuildError } from "../../generate/guide.ts";
import { seedDoc } from "../catalogue.ts";
import type { SeedSession } from "../driver.ts";
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
  withoutRepeats,
} from "./harbour-lights-script.ts";
import type { Episode, WrittenScript } from "./harbour-lights-script.ts";

const KEY = "medium/harbour-lights/202";
const GUIDE = HARBOUR_LIGHTS_GUIDE;
const WHERE = `${GUIDE.project}: 202`;
const PAGES = 56;
const LAYOUT = unlockedLayout(GUIDE);
/**
 * The scenes that open a page of the White draft, so that each passage the Blue pages write falls in a scene it
 * belongs to: the café on 11, running through 12 until scene 13 opens 13; the bank on 27; the café again on 31.
 */
const SCENE_PAGES = [
  { scene: 12, page: 11 },
  { scene: 13, page: 13 },
  { scene: 28, page: 27 },
  { scene: 31, page: 31 },
] as const;

// the White draft, PAGES long, each scene of SCENE_PAGES opening its page; the text before each of them, and from
// the last, is first brought to its pages on its own, measured with the heading after it so that the heading
// lands on its page or past it: the fit then mostly takes text out, of which there is plenty, rather than drawing
// actions, few of which are free near the page
async function whiteDraft({ context, meter }: Episode): Promise<SeedBlock[]> {
  const { rng } = context;
  const generated = generateScript(GUIDE, KEY, rng);
  const starts = SCENE_PAGES.map(({ scene }) => sceneStart(generated, scene));
  const headings = starts.map((i) => generated[i]!);
  const cuts = [0, ...starts, generated.length];
  const firsts = [1, ...SCENE_PAGES.map(({ page }) => page), PAGES + 1];
  const options = {
    fixed: new Set<SeedBlock>(),
    guide: GUIDE,
    rng,
    meter,
    layout: LAYOUT,
  };
  const parts: SeedBlock[][] = [];
  for (const [i, from] of cuts.slice(0, -1).entries()) {
    const part = generated.slice(from, cuts[i + 1]);
    const pages = firsts[i + 1]! - firsts[i]!;
    const next = headings[i];
    parts.push(
      next === undefined
        ? await toPages(part, pages, options)
        : (await toPages([...part, next], pages + 1, options)).slice(0, -1),
    );
  }
  let doc = withoutRepeats(parts.flat(), {
    guide: GUIDE,
    rng,
    fixed: new Set(),
  });
  // one heading at a time, so each fit draws through what is near its own page; the last part keeps the length
  for (const [i, heading] of headings.entries()) {
    const at = doc.indexOf(heading);
    const from = i === 0 ? 0 : doc.indexOf(headings[i - 1]!);
    const last = doc.indexOf(headings.at(-1)!);
    doc = await fitToPages(
      doc,
      [
        {
          generated: [from, at],
          mustStart: { page: String(SCENE_PAGES[i]!.page), blockIndex: at },
        },
        { generated: [last, doc.length], mustStart: null },
      ],
      {
        meter,
        guide: GUIDE,
        rng,
        used: usedNear(GUIDE, doc, at),
        totals: [{ layout: LAYOUT, pages: PAGES }],
      },
    );
  }
  return doc;
}

// the units of a page's run, wherever they start
function unitsOn(page: readonly SeedBlock[]): Unit[] {
  return unitsIn(page, 0, page.length, {
    intentOf: intentsOf(GUIDE),
    movable: () => true,
  });
}

/** Where on its page a passage goes: after the page's opening heading or first unit, or before its last unit. */
type Place = "after_first" | "before_last";

const PLACES: Readonly<Record<Place, (page: readonly SeedBlock[]) => number>> =
  {
    after_first: (page) => {
      if (page[0]?.element === "scene_heading") return 1;
      const [unit] = unitsOn(page);
      return unit?.from === 0 ? unit.to : 1;
    },
    before_last: (page) => unitsOn(page).at(-1)?.from ?? page.length,
  };

/** The part of `passage` from `from` to `to`, with the marks it carries. */
function partOf(passage: SeedPassage, from: number, to: number): SeedPassage {
  return {
    blocks: passage.blocks.slice(from, to),
    pageStarts: [],
    numbers: [],
    marked: passage.marked.flatMap((i) =>
      i >= from && i < to ? [i - from] : [],
    ),
    omitted: [],
  };
}

/** 202 as Dana writes it: the episode, the mirror of its blocks, and the lines she writes for Leo's note, which no fit changes. */
interface Salt {
  episode: Episode;
  script: WrittenScript;
  fixed: ReadonlySet<SeedBlock>;
}

/**
 * The blocks from page `label`'s start to the next page's: by the lock's anchors once it is locked
 * (they name the server's blocks), else as the meter lays the script out.
 */
async function pageRun(
  { episode, script }: Salt,
  label: string,
): Promise<{ start: number; end: number; locked: boolean }> {
  const production = episode.context.driver?.production ?? null;
  const anchors =
    production === null
      ? []
      : (await production.state("dana", seedDoc(KEY).docId)).anchors
          .filter((a) => a.level === 1)
          .toSorted((a, b) => a.order - b.order);
  const starts =
    anchors.length > 0
      ? anchors.map((a) => ({
          label: a.label,
          blockIndex: script.ids.indexOf(a.blockId),
        }))
      : await episode.meter.pages(script.blocks, LAYOUT);
  const page = starts.findIndex((p) => p.label === label);
  if (page === -1 || starts[page]!.blockIndex === -1)
    throw new SeedBuildError("unfit", `${WHERE}: page ${label}`);
  const next = starts[page + 1]?.blockIndex ?? script.blocks.length;
  const start = starts[page]!.blockIndex;
  return { start, end: next, locked: anchors.length > 0 };
}

// `run` without its units from `from` on, first to last but never its last, until it fills no more than `pages`
// pages on its own: the mark a removal leaves falls on the next line kept, which stays on the page
async function makeRoom(
  { episode, fixed }: Salt,
  run: readonly SeedBlock[],
  from: number,
  pages: number,
): Promise<SeedBlock[]> {
  const room = [...run];
  while ((await episode.meter.pages(room, LAYOUT)).length > pages) {
    const units = unitsIn(room, from, room.length, {
      intentOf: intentsOf(GUIDE),
      movable: (i) => !fixed.has(room[i]!),
    });
    const [unit] = units.length > 1 ? units : [];
    if (unit === undefined)
      throw new SeedBuildError("unfit", `${WHERE}: room on a page`);
    room.splice(unit.from, unit.to - unit.from);
  }
  return room;
}

// a locked page's run, as `written` changes it, brought to `labels` measured on its own as the lock lays it out:
// units from `from` taken out while too long (makeRoom), unused actions added at its end while too short
async function fitRun(
  salt: Salt,
  written: readonly SeedBlock[],
  options: { from: number; start: number; labels: readonly string[] },
): Promise<SeedBlock[]> {
  const { episode, script, fixed } = salt;
  const { labels } = options;
  const room = await makeRoom(salt, written, options.from, labels.length);
  return fitAPages(
    room,
    {
      firstBlock: 0,
      lastBlock: room.length - 1,
      labels: labels.map((_, i) => String(i + 1)),
    },
    {
      meter: episode.meter,
      layout: LAYOUT,
      guide: GUIDE,
      rng: episode.context.rng,
      used: usedNear(GUIDE, script.blocks, options.start),
      fixed: indicesOf(room, fixed),
    },
  );
}

/**
 * `blocks` written on page `label` at `place`; then, once the script is locked, that page's run brought to
 * `labels` (fitRun), taking out other units on the page before the passage when it is placed before the last
 * unit, and after it otherwise.
 */
async function writeOnPage(
  salt: Salt,
  session: SeedSession,
  blocks: readonly SeedBlock[],
  on: { label: string; labels: readonly string[]; place: Place },
): Promise<void> {
  const { script } = salt;
  const run = await pageRun(salt, on.label);
  const page = script.blocks.slice(run.start, run.end);
  const at = PLACES[on.place](page);
  const written = [...page.slice(0, at), ...blocks, ...page.slice(at)];
  const from =
    on.place === "before_last" ? PLACES.after_first(page) : at + blocks.length;
  const fitted = run.locked
    ? await fitRun(salt, written, { from, start: run.start, labels: on.labels })
    : written;
  const doc = [
    ...script.blocks.slice(0, run.start),
    ...fitted,
    ...script.blocks.slice(run.end),
  ];
  const [changes] = sessionsBetween(script.blocks, doc, 1);
  await applyBlockChanges(session, script, changes!, salt.episode.context.ids);
}

/**
 * Where each part of SALT_LINES (its blocks, [from, to)) is written, and the pages its run must fill: the fish
 * bill on 11; the rest of Nora's beat before page 12's last unit, so it starts on 12 and runs on to 12A; the
 * bank's figures on 27; the callback that gets the bill wrong on 31.
 */
const BLUE_PARTS: readonly {
  lines: readonly [number, number];
  label: string;
  labels: readonly string[];
  place: Place;
}[] = [
  { lines: [0, 5], label: "11", labels: ["11"], place: "after_first" },
  { lines: [5, 8], label: "12", labels: ["12", "12A"], place: "before_last" },
  { lines: [8, 13], label: "27", labels: ["27"], place: "after_first" },
  { lines: [13, 18], label: "31", labels: ["31"], place: "after_first" },
];

/**
 * Plans 202's history: Dana writes it, Priya locks its White pages, and Dana's Blue changes follow
 * Leo's note: the unpaid fish bill on page 11, whose beat runs on so page 12 fills 12 and 12A;
 * scene 19 omitted; the bank's figures on page 27 and the bill's callback on page 31, each kept to
 * its page.
 */
export async function planSalt(episode: Episode): Promise<void> {
  const { context, story, plan } = episode;
  const white = await whiteDraft(episode);
  const script: WrittenScript = { blocks: [], ids: [] };
  const writing = sessionsBetween([], white, 3);
  planSessions(
    episode,
    KEY,
    script,
    writing,
    ["D−17 10:20", "D−16 10:05", "D−15 10:40"].map((at) => ({
      at,
      userId: "dana",
    })),
  );
  plan("D−10 10:30", () => story.lock("priya", KEY));

  const lines = parseSeedText(SALT_LINES);
  const salt: Salt = { episode, script, fixed: new Set(lines.blocks) };
  const parts = BLUE_PARTS.map(({ lines: [from, to], ...on }) => ({
    ...on,
    part: partOf(lines, from, to),
  }));
  const write = (at: string, on: typeof parts) =>
    plan(at, () =>
      story.sessionWith("dana", KEY, async (session) => {
        for (const { part, ...where } of on)
          await writeOnPage(salt, session, part.blocks, where);
      }),
    );
  write("D−6 10:40", parts.slice(0, 1));
  write("D−6 11:25", parts.slice(1, 2));
  plan("D−5 11:10", () =>
    story.sessionWith("dana", KEY, async (session) => {
      const heading = script.ids[sceneStart(script.blocks, 19)]!;
      await session.change((doc) =>
        scriptBody(doc).write((writer) => {
          writer.setBlockAttrs(heading, { omitted: true });
        }),
      );
    }),
  );
  write("D−3 10:50", parts.slice(2));
  plan("D−3 10:50", async () => {
    // without production nothing was locked, so no line carries a revision mark to check
    if ((context.driver?.production ?? null) === null) return;
    for (const { part } of parts) {
      const first = script.ids[script.blocks.indexOf(part.blocks[0]!)]!;
      await assertWritten(context, KEY, part, first, `${WHERE} Blue`);
    }
  });
}
