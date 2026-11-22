// How Harbour Lights' episodes are generated, fitted to their pages and written, session by session.
import { scriptBody } from "@manent/crdt";
import type { BlockWriter } from "@manent/crdt";
import type { IdSource } from "@manent/schema";
import type { SeedBlock, SeedPassage } from "../../content/markup.ts";
import { deriveDrafts } from "../../generate/drafts.ts";
import type { BlockChange } from "../../generate/drafts.ts";
import { actionAt } from "../../generate/fit.ts";
import type { PageMeter, SeedLayout } from "../../generate/fit.ts";
import {
  GENERATED_REPEAT_PAGES,
  LINES_PER_PAGE,
  createUsedLines,
  createUsedOnce,
  estimatedLines,
  generateScenes,
} from "../../generate/grammar.ts";
import type { UsedLines } from "../../generate/grammar.ts";
import { SeedBuildError } from "../../generate/guide.ts";
import type { StyleGuide } from "../../generate/guide.ts";
import { seedDoc } from "../catalogue.ts";
import type { SeedSession } from "../driver.ts";
import type { Rng } from "../rng.ts";
import type { SeedContext } from "../seed.ts";
import { ownPages, toBlockJSON } from "../story.ts";
import type { Story } from "../story.ts";

/** An unlocked script in the guide's format, its settings left as they are when it is created. */
export function unlockedLayout(guide: StyleGuide): SeedLayout {
  return { format: guide.format, settings: {}, anchors: null };
}

/** A generated page speaks about this many lines, so a document of P pages spends about 3.5 × P of its bank. */
const SPEECHES_PER_PAGE = 3.5;
/** How much further back than the generator's window an action is held: fitting takes units out between two copies. */
const SLACK = 1.1;

/**
 * The scenes of every beat of the document `key`, each beat on the pages it does not share with the next, drawn
 * through one record. While the document has spoken SPEECHES_PER_PAGE lines a page of what it has written, every
 * speech is held back and the generator writes an action instead, so the bank's lines last the whole document,
 * none spoken twice.
 */
export function generateScript(
  guide: StyleGuide,
  key: string,
  rng: Rng,
): SeedBlock[] {
  const lines = createUsedLines();
  const speeches = new Set(guide.dialogue.map((entry) => entry.text));
  let spoken = 0;
  let written = 0;
  const paced = (): boolean =>
    spoken >= (SPEECHES_PER_PAGE * written) / LINES_PER_PAGE[guide.format];
  const used: UsedLines = {
    ...lines,
    has: (text, window) =>
      (speeches.has(text) && paced()) || lines.has(text, window * SLACK),
    addDialogue(text) {
      spoken += 1;
      lines.addDialogue(text);
    },
    pass(block) {
      written += estimatedLines(block);
      lines.pass(block);
    },
  };
  const beats = guide.beats.filter((beat) => beat.id.startsWith(`${key}#`));
  return beats.flatMap((_, i) =>
    generateScenes(guide, ownPages(beats, i), rng, used),
  );
}

/**
 * The record a fit at block `at` of `blocks` draws its actions through: every block but a speech that starts
 * within GENERATED_REPEAT_PAGES pages of `at`'s start, by estimated lines as checkGenerated measures them, is
 * taken, and so is every action the fit draws. A fit draws no speech, and the generator never spoke one twice.
 */
export function usedNear(
  guide: StyleGuide,
  blocks: readonly SeedBlock[],
  at: number,
): UsedLines {
  const window = GENERATED_REPEAT_PAGES * LINES_PER_PAGE[guide.format];
  let line = 0;
  const starts = blocks.map((block) => {
    const start = line;
    line += estimatedLines(block);
    return start;
  });
  const here = starts[at] ?? line;
  const used = createUsedOnce();
  for (const [i, block] of blocks.entries())
    if (block.element !== "dialogue" && Math.abs(starts[i]! - here) < window)
      used.add(block.text);
  return used;
}

/**
 * `blocks` with each action that comes back fewer than GENERATED_REPEAT_PAGES pages after a block of the same text,
 * by estimated lines as checkGenerated measures them, replaced by an action free where it stands; a block in
 * `fixed` is kept. Moving scenes and putting fixed text in place of generated text bring copies closer.
 */
export function withoutRepeats(
  blocks: readonly SeedBlock[],
  options: { guide: StyleGuide; rng: Rng; fixed: ReadonlySet<SeedBlock> },
): SeedBlock[] {
  const { guide, rng, fixed } = options;
  const window = GENERATED_REPEAT_PAGES * LINES_PER_PAGE[guide.format];
  const doc = [...blocks];
  const lastAt = new Map<string, number>();
  let line = 0;
  for (const [i, block] of doc.entries()) {
    const near = line - (lastAt.get(block.text) ?? -Infinity) < window;
    const kept =
      block.element !== "action" || fixed.has(block) || !near
        ? block
        : actionAt(doc, i, { guide, rng, used: usedNear(guide, doc, i) });
    doc[i] = kept;
    if (kept.element !== "dialogue") lastAt.set(kept.text, line);
    line += estimatedLines(kept);
  }
  return doc;
}

/**
 * `blocks` brought to `pages` pages as deriveDrafts brings a draft to its length, across the whole script; a block
 * in `fixed` never changes. The generator's estimate of a page runs long, so its text can be many pages over.
 */
export async function toPages(
  blocks: readonly SeedBlock[],
  pages: number,
  options: {
    fixed: ReadonlySet<SeedBlock>;
    guide: StyleGuide;
    rng: Rng;
    meter: PageMeter;
    layout: SeedLayout;
  },
): Promise<SeedBlock[]> {
  const { fixed, meter, layout } = options;
  const measured = (await meter.pages(blocks, layout)).length;
  const [draft] = await deriveDrafts(
    blocks,
    [
      { name: null, pages },
      { name: null, pages: measured },
    ],
    { ...options, fixed: indicesOf(blocks, fixed) },
  );
  return draft!;
}

/** The index of each block of `blocks` that `among` holds. */
export function indicesOf(
  blocks: readonly SeedBlock[],
  among: ReadonlySet<SeedBlock>,
): Set<number> {
  return new Set(blocks.flatMap((block, i) => (among.has(block) ? [i] : [])));
}

/** The index of scene `n`'s heading in `blocks`, scenes counted from 1; RangeError when there are fewer. */
export function sceneStart(blocks: readonly SeedBlock[], n: number): number {
  let seen = 0;
  for (const [i, block] of blocks.entries())
    if (block.element === "scene_heading" && ++seen === n) return i;
  throw new RangeError(`a script of ${seen} scenes has no scene ${n}`);
}

/** A script as a step has written it: its blocks and, index for index, their ids. */
export interface WrittenScript {
  blocks: SeedBlock[];
  ids: string[];
}

// a block rewritten where it stands, so it keeps its id: compared with an earlier version it reads as changed
function rewrite(
  writer: BlockWriter,
  id: string,
  before: SeedBlock,
  after: SeedBlock,
): void {
  writer.setBlockAttrs(id, { type: after.element, kind: after.kind });
  writer.deleteText(id, 0, before.text.length);
  let offset = 0;
  for (const run of toBlockJSON(after, id).content ?? []) {
    writer.insertText(id, offset, run.text, run.marks);
    offset += run.text.length;
  }
}

const missing = (script: WrittenScript, at: number): RangeError =>
  new RangeError(
    `a script of ${script.blocks.length} blocks has no position ${at}`,
  );

// consecutive inserts at `at`, written as one run after the block before them
function insertRun(
  writer: BlockWriter,
  script: WrittenScript,
  at: number,
  blocks: readonly SeedBlock[],
  ids: IdSource,
): void {
  const made = blocks.map(() => ids());
  const after = at === 0 ? null : script.ids[at - 1];
  const json = blocks.map((block, i) => toBlockJSON(block, made[i]!));
  if (after === undefined || !writer.insertBlocks(after, json))
    throw missing(script, at);
  script.blocks.splice(at, 0, ...blocks);
  script.ids.splice(at, 0, ...made);
}

/**
 * Makes `changes` (sessionsBetween's) in one change through `session`, and in `script` with them:
 * an inserted block takes an id from `ids`, a replaced one keeps its own. RangeError for a
 * change at a position the script does not have.
 */
export async function applyBlockChanges(
  session: SeedSession,
  script: WrittenScript,
  changes: readonly BlockChange[],
  ids: IdSource,
): Promise<void> {
  if (changes.length === 0) return;
  await session.change((doc) =>
    scriptBody(doc).write((writer) => {
      for (let i = 0; i < changes.length;) {
        const change = changes[i]!;
        const id = script.ids[change.at];
        if (change.op === "insert") {
          const run = [change.block];
          for (
            let next = changes[i + run.length];
            next?.op === "insert" && next.at === change.at + run.length;
            next = changes[i + run.length]
          )
            run.push(next.block);
          insertRun(writer, script, change.at, run, ids);
          i += run.length;
          continue;
        }
        if (id === undefined) throw missing(script, change.at);
        if (change.op === "replace") {
          rewrite(writer, id, script.blocks[change.at]!, change.block);
          script.blocks[change.at] = change.block;
        } else {
          if (!writer.deleteBlock(id)) throw missing(script, change.at);
          script.blocks.splice(change.at, 1);
          script.ids.splice(change.at, 1);
        }
        i += 1;
      }
    }),
  );
}

/** An action of a step's history and when it happens, in the seed's notation. */
export type Plan = (at: string, run: () => Promise<void>) => void;

/** What one document's history is planned with. */
export interface Episode {
  context: SeedContext;
  story: Story;
  meter: PageMeter;
  plan: Plan;
}

/** Each slice of `slices` as a session of the person at its time, written into `script`. */
export function planSessions(
  { context, story, plan }: Episode,
  key: string,
  script: WrittenScript,
  slices: readonly (readonly BlockChange[])[],
  times: readonly { at: string; userId: string }[],
): void {
  for (const [i, { at, userId }] of times.entries())
    plan(at, () =>
      story.sessionWith(userId, key, (session) =>
        applyBlockChanges(session, script, slices[i]!, context.ids),
      ),
    );
}

/**
 * Throws SeedBuildError "rules_broken" in `where` when the server's pages, numbers or marks
 * disagree with `passage`, written into the document `key` from the block `firstBlockId`.
 * RangeError when the context has no driver.
 */
export async function assertWritten(
  context: SeedContext,
  key: string,
  passage: SeedPassage,
  firstBlockId: string,
  where: string,
): Promise<void> {
  if (context.driver === null)
    throw new RangeError(`${key} is checked only through a driver`);
  const found = await context.driver.check(
    seedDoc(key).docId,
    passage,
    firstBlockId,
  );
  if (found.length > 0)
    throw new SeedBuildError("rules_broken", `${where} (${found.join("; ")})`);
}
