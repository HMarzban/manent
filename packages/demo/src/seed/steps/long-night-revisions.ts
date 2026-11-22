// The Long Night in production: the lock, the Blue pages and their issue, and the Pink pages being written now.
import { scriptBody } from "@manent/crdt";
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import { LONG_NIGHT_GUIDE as GUIDE } from "../../generate/banks/medium/the-long-night.ts";
import { intentsOf, unitsIn } from "../../generate/fit.ts";
import { SeedBuildError } from "../../generate/guide.ts";
import { seedDoc } from "../catalogue.ts";
import type { SeedSession } from "../driver.ts";
import {
  KEY,
  check,
  fillPages,
  idsOf,
  isHeading,
  keep,
  pageSpan,
  replaced,
  revise,
  sceneOf,
  sit,
  slice,
  writeTo,
} from "./long-night-telling.ts";
import type { Telling } from "./long-night-telling.ts";

const BLUE_MEMO =
  "Blue revisions: pp. 3, 9, 16, 17, 17A, 21, 21A, 21B, 29, 33, 41, 58, 87, 102. Sc. 25 omitted. Sc. 26A added.";
/** The pages where Mr. Adeyemi, through the lift doors, counts the hours since his tablets. */
const PAYOFF_PAGES = ["29", "33", "41", "58", "87", "102"] as const;

/** The six blocks of page 3 that Blue rewrites: Irena's three lines and their cues. */
function page3(t: Telling): readonly [number, number] {
  const { marked } = t.texts.opening;
  return [marked[0]! - 1, marked.at(-1)! + 1];
}

/** D−8, Dana: Irena plants the tablets on page 3, and Halloran's shelf of radios goes on page 9. */
async function tabletsAndRadios(t: Telling, s: SeedSession): Promise<void> {
  const p3 = page3(t);
  const blue3 = revise(t.state.slice(...p3), slice(t.texts.opening, ...p3));
  const radios = t.texts.blueLines.blocks[0]!;
  const [from, to] = await pageSpan(t, s, "9");
  const shop = t.state.findLastIndex(
    (b, i) => i <= from && isHeading(b) && b.text.startsWith("INT. HALLORAN'S"),
  );
  const actions = t.state.flatMap((b, i) =>
    i > from && i < to && b.element === "action" && !t.fixed.has(b) ? [i] : [],
  );
  const shelf = actions.find((i) => i > shop) ?? actions.at(-1);
  if (shelf === undefined)
    throw new SeedBuildError("unfit", `${GUIDE.project}: page 9`);
  keep(t, [...blue3, radios]);
  const shelved = replaced(t.state, [shelf, shelf + 1], [radios]);
  await writeTo(t, s, replaced(shelved, p3, blue3));
  await fillPages(t, s, ["3"]);
  await fillPages(t, s, ["9"]);
}

/** D−7, Dana: two lines trimmed from Tomas's arrival, page 17 to the stairs, and scene 25 omitted with its blocks kept. */
async function theKnock(t: Telling, s: SeedSession): Promise<void> {
  const blue = t.texts.p17Blue;
  const omitted = blue.omitted[0]!;
  const pharmacy = blue.numbers.find((n) => n.num === "26A")!.blockIndex;
  const [from] = await pageSpan(t, s, "16");
  const movable = (i: number) => !t.fixed.has(t.state[i]!);
  const kitchen = t.state.indexOf(t.headings[23]!);
  const intentOf = intentsOf(GUIDE);
  const trim = unitsIn(t.state, from + 1, kitchen, { intentOf, movable }).at(
    -1,
  );
  const start = t.state.indexOf(t.texts.p17White.blocks[0]!);
  const mum = sceneOf(t.state, t.headings[24]!);
  const stairs = sceneOf(t.state, t.headings[25]!);
  const before = revise(t.state.slice(start, mum[0]), slice(blue, 0, omitted));
  const after = revise(
    t.state.slice(...stairs),
    slice(blue, omitted + 1, pharmacy),
  );
  keep(t, [...before, ...after]);
  let target = replaced(t.state, stairs, after);
  target = replaced(target, [start, mum[0]], before);
  if (trim !== undefined) target = replaced(target, [trim.from, trim.to], []);
  await writeTo(t, s, target);
  t.omitted.add(t.headings[24]!);
  const heading = idsOf(s, t.state)[t.state.indexOf(t.headings[24]!)]!;
  await s.change((doc) =>
    scriptBody(doc).write(
      (w) => void w.setBlockAttrs(heading, { omitted: true }),
    ),
  );
}

/**
 * D−6, Sam: scene 26A, the pharmacy. The engine cannot hold the White page 17 whole: its page 18 starts at
 * Mrs. Adeyemi's cue, so the pharmacy runs page 18 on to 18A.
 */
async function thePharmacy(t: Telling, s: SeedSession): Promise<void> {
  const blue = t.texts.p17Blue;
  const from = blue.numbers.find((n) => n.num === "26A")!.blockIndex;
  const pharmacy = blue.blocks.slice(from);
  keep(t, pharmacy);
  const end = sceneOf(t.state, t.headings[25]!)[1];
  await writeTo(t, s, replaced(t.state, [end, end], pharmacy));
  await fillPages(t, s, ["18", "18A"]);
}

/**
 * D−5 in Blue and N−8:40 in Pink: scene 29 as `passage` writes it over `length` blocks from its heading, filling `pages`. Pink's
 * new lines come before the block 21A was locked on, and page 21 holds fixed text only: no fit can move that
 * break, so in Pink only 21A and 21B are filled.
 */
async function theVan(
  t: Telling,
  s: SeedSession,
  passage: SeedPassage,
  length: number,
  pages: readonly string[],
): Promise<void> {
  const from = t.state.indexOf(t.headings[28]!);
  const scene = revise(t.state.slice(from, from + length), passage);
  keep(t, scene);
  await writeTo(t, s, replaced(t.state, [from, from + length], scene));
  await fillPages(t, s, pages);
}

/** D−4, Priya: she fixes "stairwel" on page 33 and clears its revised mark, judging it no revision. */
async function theTypo(t: Telling, s: SeedSession): Promise<void> {
  const at = t.state.findIndex((b) => /\bstairwel\b/.test(b.text));
  const typo = t.state[at]!;
  const fix = { ...typo, text: typo.text.replace("stairwel", "stairwell") };
  keep(t, [fix]);
  await writeTo(t, s, replaced(t.state, [at, at + 1], [fix]));
  const { production } = t.driver;
  if (production === null)
    return t.context.skip("production", "clear a revised mark");
  const state = await production.state("priya", seedDoc(KEY).docId);
  const id = idsOf(s, t.state)[at]!;
  await production.setOverride(s, state.sets.at(-1)!.setId, id, "cleared");
}

/** D−3, Dana: on each payoff page one speech becomes Mr. Adeyemi's count. */
async function thePayoffs(t: Telling, s: SeedSession): Promise<void> {
  const payoff = t.texts.blueLines.blocks[1]!;
  for (const label of PAYOFF_PAGES) {
    const [from, to] = await pageSpan(t, s, label);
    const { state } = t;
    const cue = state.findIndex(
      (b, i) =>
        i > from &&
        i + 1 < to &&
        b.element === "character" &&
        state[i + 1]!.element === "dialogue" &&
        !t.fixed.has(b) &&
        !t.fixed.has(state[i + 1]!),
    );
    if (cue === -1)
      throw new SeedBuildError("unfit", `${GUIDE.project}: page ${label}`);
    const was = state[cue]!;
    const speaker =
      was.text === "MR. ADEYEMI" ? was : { ...was, text: "MR. ADEYEMI" };
    keep(t, [speaker]);
    await writeTo(
      t,
      s,
      replaced(state, [cue, cue + 2], [speaker, { ...payoff }]),
    );
    await fillPages(t, s, [label]);
  }
}

/**
 * The Blue passages, checked while Blue is the revision being worked on. The opening is held to its page 1
 * only, and page 17's passage from scene 26 to no page: the engine breaks that fixed text elsewhere, and no
 * generated text comes between to move the breaks.
 */
function bluePassages(t: Telling): (readonly [SeedPassage, SeedBlock])[] {
  const { opening, p17Blue, blueLines, blue29 } = t.texts;
  const omitted = p17Blue.omitted[0]! + 1;
  const end = p17Blue.blocks.length;
  const count = blueLines.blocks[1]!.text;
  const payoffs = t.state.filter(
    (b) => b.element === "dialogue" && b.text === count,
  );
  const firstPage = opening.pageStarts.filter((p) => p.label === "1");
  return [
    [{ ...opening, pageStarts: firstPage }, opening.blocks[0]!],
    [slice(p17Blue, 0, omitted), t.texts.p17White.blocks[0]!],
    [{ ...slice(p17Blue, omitted, end), pageStarts: [] }, t.headings[25]!],
    [blue29, t.headings[28]!],
    [slice(blueLines, 0, 1), blueLines.blocks[0]!],
    ...payoffs.map((b) => [slice(blueLines, 1, 2), b] as const),
  ];
}

/** Production: the lock, Blue and its issue, and the Pink pages Sam is writing now. */
export async function inProduction(t: Telling): Promise<void> {
  const { blue29, pink29, pink64 } = t.texts;
  await t.story.at("D−21 10:05");
  await t.story.lock("priya", KEY);
  await sit(t, ["dana", "D−8 10:10"], (s) => tabletsAndRadios(t, s));
  await sit(t, ["dana", "D−7 11:00"], (s) => theKnock(t, s));
  await sit(t, ["sam", "D−6 14:30"], (s) => thePharmacy(t, s));
  await sit(t, ["dana", "D−5 10:40"], (s) => {
    const [from, to] = sceneOf(t.state, t.headings[28]!);
    return theVan(t, s, blue29, to - from, ["21", "21A", "21B"]);
  });
  await sit(t, ["priya", "D−4 15:15"], (s) => theTypo(t, s));
  await sit(t, ["dana", "D−3 11:50"], async (s) => {
    await thePayoffs(t, s);
    await check(t, s, bluePassages(t));
  });
  await t.story.at("D−1 22:41");
  await t.story.issue("priya", KEY, BLUE_MEMO);
  await sit(t, ["sam", "N−8:40"], async (s) => {
    await theVan(t, s, pink29, blue29.blocks.length, ["21A", "21B"]);
    const after = t.state.indexOf(t.headings[63]!) + 1;
    keep(t, pink64.blocks);
    await writeTo(t, s, replaced(t.state, [after, after], pink64.blocks));
    await fillPages(t, s, ["64", "64A"]);
    await check(t, s, [
      [pink29, t.headings[28]!],
      [pink64, pink64.blocks[0]!],
    ]);
  });
}
