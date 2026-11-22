// The helpers every seed step tells its project's history with: its text, times, sessions, drafts and production.
import { scriptBody } from "@manent/crdt";
import type { BlockWriter } from "@manent/crdt";
import type { BlockJSON, IdSource, TextJSON } from "@manent/schema";
import type { SeedBlock, SeedPassage } from "../content/markup.ts";
import { deriveDrafts } from "../generate/drafts.ts";
import type { BlockChange } from "../generate/drafts.ts";
import type { PageMeter, SeedLayout } from "../generate/fit.ts";
import { generateScenes } from "../generate/grammar.ts";
import { SeedBuildError } from "../generate/guide.ts";
import type { StyleGuide } from "../generate/guide.ts";
import { seedDoc } from "./catalogue.ts";
import type { SeedDriver, SeedProduction, SeedSession } from "./driver.ts";
import type { Rng } from "./rng.ts";
import type { SeedContext } from "./seed.ts";

export interface Story {
  /** The driver's clock moves to the time `spec` names in the seed's notation. */
  at(spec: string): Promise<void>;
  session(userId: string, key: string): Promise<SeedSession>;
  /** Inserts `blocks` after the block `after` (null: at the start); returns the new block ids. */
  write(
    session: SeedSession,
    blocks: readonly SeedBlock[],
    after: string | null,
    ids: () => string,
  ): Promise<string[]>;
  /** Opens, runs `fn`, closes: one automatic version. */
  sessionWith(
    userId: string,
    key: string,
    fn: (session: SeedSession) => Promise<void>,
  ): Promise<void>;
  /** A named draft, resolving with its version id; skipped without "history", resolving with "". */
  name(userId: string, key: string, name: string): Promise<string>;
  /** Restores one scene from the newest version named `versionName`; skipped without "restore". */
  restoreScene(
    userId: string,
    key: string,
    versionName: string,
    headingId: string,
  ): Promise<void>;
  /** Skipped without "production". */
  lock(userId: string, key: string): Promise<void>;
  /** Skipped without "production". */
  issue(userId: string, key: string, memo: string): Promise<void>;
}

/** The text runs of `block`, each with the marks that cover it. */
function runsOf(block: SeedBlock): TextJSON[] {
  const cuts = new Set([0, block.text.length]);
  for (const { from, to } of block.marks) cuts.add(from).add(to);
  const sorted = [...cuts].toSorted((a, b) => a - b);
  return sorted.slice(1).flatMap((to, i) => {
    const from = sorted[i]!;
    const text = block.text.slice(from, to);
    if (text === "") return [];
    const marks = block.marks
      .filter((m) => m.from <= from && m.to >= to)
      .map((m) => ({ type: m.mark }));
    return [
      marks.length === 0
        ? { type: "text", text }
        : { type: "text", text, marks },
    ];
  });
}

/** A seed block as the document stores it, with the id `id`. */
export function toBlockJSON(block: SeedBlock, id: string): BlockJSON {
  const attrs = {
    id,
    type: block.element,
    ...(block.kind === null ? {} : { kind: block.kind }),
  };
  const content = runsOf(block);
  return content.length === 0
    ? { type: "block", attrs }
    : { type: "block", attrs, content };
}

const docIdOf = (key: string): string => seedDoc(key).docId;

/** The meter a step fits its text with; RangeError when the seed has a driver but no meter. */
export function meterOf(context: SeedContext): PageMeter {
  if (context.meter === null)
    throw new RangeError("a seed with a driver needs a page meter");
  return context.meter;
}

/** An unlocked script in the guide's format, its settings left as they are when it is created. */
export function unlockedLayout(guide: StyleGuide): SeedLayout {
  return { format: guide.format, settings: {}, anchors: null };
}

/** No generated line comes back within this many pages of where it was last used. */
const REPEAT_PAGES = 10;

/**
 * The scenes of every beat of the document `key`, in order (see generateScenes). A beat draws no
 * line that a beat within REPEAT_PAGES pages before it drew, by the pages the beats give.
 */
export function generateScript(
  guide: StyleGuide,
  key: string,
  rng: Rng,
): SeedBlock[] {
  const drawn: { last: number; lines: Set<string>; blocks: SeedBlock[] }[] = [];
  for (const beat of guide.beats) {
    if (!beat.id.startsWith(`${key}#`)) continue;
    const near = drawn.filter((d) => d.last > beat.pages[0] - REPEAT_PAGES);
    const before = new Set(near.flatMap((d) => [...d.lines]));
    const used = new Set(before);
    const blocks = generateScenes(guide, beat, rng, used);
    const lines = new Set([...used].filter((line) => !before.has(line)));
    drawn.push({ last: beat.pages[1], lines, blocks });
  }
  return drawn.flatMap((d) => d.blocks);
}

/** The text of every block within REPEAT_PAGES pages of block `at` in a script of `pages` pages: what a line drawn there must not repeat. */
export function usedNear(
  blocks: readonly SeedBlock[],
  at: number,
  pages: number,
): Set<string> {
  const reach = Math.ceil((REPEAT_PAGES * blocks.length) / Math.max(pages, 1));
  return new Set(
    blocks.slice(Math.max(at - reach, 0), at + reach).map((b) => b.text),
  );
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
  for (const run of runsOf(after)) {
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
  const found = await context.driver.check(docIdOf(key), passage, firstBlockId);
  if (found.length > 0)
    throw new SeedBuildError("rules_broken", `${where} (${found.join("; ")})`);
}

/**
 * The story of the step `step`, told through the context's driver: every document is named by its
 * catalogue key. An action whose capability the driver lacks is skipped and reported. Every
 * action throws a RangeError when the context has no driver.
 */
export function createStory(context: SeedContext, step: string): Story {
  const driverOf = (): SeedDriver => {
    if (context.driver === null)
      throw new RangeError(
        `the ${step} step tells its story only through a driver`,
      );
    return context.driver;
  };
  const productionOf = (what: string): SeedProduction | null => {
    const driver = driverOf();
    if (driver.capabilities.has("production") && driver.production !== null)
      return driver.production;
    context.skip("production", what);
    return null;
  };
  const session = (userId: string, key: string): Promise<SeedSession> =>
    driverOf().open(userId, docIdOf(key));
  return {
    async at(spec) {
      await driverOf().setTime(context.time.at(spec));
    },
    session,
    async write(target, blocks, after, ids) {
      const made = blocks.map(() => ids());
      const json = blocks.map((block, i) => toBlockJSON(block, made[i]!));
      await target.change((doc) =>
        scriptBody(doc).write((writer) => {
          if (!writer.insertBlocks(after, json))
            throw new RangeError(`the script holds no block ${after}`);
        }),
      );
      return made;
    },
    async sessionWith(userId, key, fn) {
      const opened = await session(userId, key);
      await fn(opened);
      await opened.close();
    },
    async name(userId, key, name) {
      const driver = driverOf();
      if (!driver.capabilities.has("history")) {
        context.skip(
          "history",
          `name the draft '${name}' of '${seedDoc(key).title}'`,
        );
        return "";
      }
      return (await driver.nameDraft(userId, docIdOf(key), name)).versionId;
    },
    async restoreScene(userId, key, versionName, headingId) {
      const driver = driverOf();
      const docId = docIdOf(key);
      if (!driver.capabilities.has("restore")) {
        context.skip(
          "restore",
          `restore a scene of '${seedDoc(key).title}' from '${versionName}'`,
        );
        return;
      }
      const version = (await driver.versions(userId, docId)).find(
        (v) => v.name === versionName,
      );
      if (version === undefined)
        throw new RangeError(`${key} has no version named ${versionName}`);
      await driver.restore(userId, docId, version.id, {
        kind: "scene",
        headingId,
      });
    },
    async lock(userId, key) {
      const production = productionOf(
        `lock the pages of '${seedDoc(key).title}'`,
      );
      await production?.lock(userId, docIdOf(key));
    },
    async issue(userId, key, memo) {
      const production = productionOf(
        `issue the pages of '${seedDoc(key).title}'`,
      );
      await production?.issue(userId, docIdOf(key), memo);
    },
  };
}
