// The helpers every seed step tells its project's history with: times, projects, sessions and their changes,
// drafts and production.
import { scriptBody } from "@manent/crdt";
import type { BlockWriter } from "@manent/crdt";
import type { BlockJSON, TextJSON } from "@manent/schema";
import { projectHome } from "@manent/sync-protocol";
import type { SeedBlock, SeedPassage } from "../content/markup.ts";
import { sessionsBetween } from "../generate/drafts.ts";
import type { BlockChange } from "../generate/drafts.ts";
import type { PageMeter } from "../generate/fit.ts";
import type { Beat } from "../generate/guide.ts";
import { SeedBuildError } from "../generate/guide.ts";
import { SEED_DOCS, seedDoc, seedProject } from "./catalogue.ts";
import type { SeedDoc } from "./catalogue.ts";
import { SeedDriverError } from "./driver.ts";
import type { SeedDriver, SeedSession } from "./driver.ts";
import type { SeedContext, SeedEntry } from "./seed.ts";

export interface Story {
  /** The engine's page meter, which every fit of this story measures with. */
  readonly meter: PageMeter;
  /** The driver's clock moves to the time `spec` names in the seed's notation; RangeError when that is before the story's last. */
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
  /** A named draft's version id; skipped without "history", and then "". */
  name(userId: string, key: string, name: string): Promise<string>;
  /** Skipped without "restore"; a RangeError when the document has no version of that name. */
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

const docId = (key: string): string => seedDoc(key).docId;

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

/** The block as the script stores it, with the id `id`; every attribute it does not name takes its default. */
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

/**
 * The story of the step `step`, told through the context's driver at the context's times. An action
 * whose capability the server lacks is skipped through `context.skip`, and the story carries on.
 * Throws a RangeError when the context has no driver or no meter: a step without a driver returns
 * its entries before it makes a story.
 */
export function createStory(context: SeedContext, step: string): Story {
  const { driver, meter, time } = context;
  if (driver === null || meter === null)
    throw new RangeError(
      `the seed step ${step} tells its story only through a driver and a page meter`,
    );
  const { capabilities } = driver;
  const session = (userId: string, key: string): Promise<SeedSession> =>
    driver.open(userId, docId(key));
  const production = capabilities.has("production") ? driver.production : null;
  let last: { spec: string; at: number } | null = null;
  return {
    meter,
    async at(spec) {
      const at = time.at(spec);
      if (last !== null && at < last.at)
        throw new RangeError(
          `the story of ${step} cannot go back from ${last.spec} to ${spec}`,
        );
      last = { spec, at };
      await driver.setTime(at);
    },
    session,
    async write(target, blocks, after, ids) {
      const written = blocks.map(() => ids());
      const json = blocks.map((block, i) => toBlockJSON(block, written[i]!));
      await target.change((doc) =>
        scriptBody(doc).write((w) => {
          if (!w.insertBlocks(after, json))
            throw new RangeError(`the script holds no block ${after}`);
        }),
      );
      return written;
    },
    async sessionWith(userId, key, fn) {
      const opened = await session(userId, key);
      try {
        await fn(opened);
      } finally {
        await opened.close();
      }
    },
    async name(userId, key, name) {
      if (!capabilities.has("history")) {
        context.skip("history", `the draft '${name}' of ${key}`);
        return "";
      }
      return (await driver.nameDraft(userId, docId(key), name)).versionId;
    },
    async restoreScene(userId, key, versionName, headingId) {
      if (!capabilities.has("restore")) {
        context.skip("restore", `a scene of ${key} from '${versionName}'`);
        return;
      }
      const versions = await driver.versions(userId, docId(key));
      const version = versions.find((v) => v.name === versionName);
      if (version === undefined)
        throw new RangeError(`${key} has no version named ${versionName}`);
      await driver.restore(userId, docId(key), version.id, {
        kind: "scene",
        headingId,
      });
    },
    async lock(userId, key) {
      if (production === null) {
        context.skip("production", `the lock of ${key}`);
        return;
      }
      await production.lock(userId, docId(key));
    },
    async issue(userId, key, memo) {
      if (production === null) {
        context.skip("production", `an issue of ${key}`);
        return;
      }
      await production.issue(userId, docId(key), memo);
    },
  };
}

/** A document as its story has written it so far: its blocks and their ids, index for index. */
export interface StoryDoc {
  readonly blocks: SeedBlock[];
  readonly ids: string[];
}

/** The id of the block at `at` in `doc`; RangeError past its end. */
function idAt(doc: StoryDoc, at: number): string {
  const id = doc.ids[at];
  if (id === undefined)
    throw new RangeError(`the document holds no block at ${at}`);
  return id;
}

// a rewrite keeps the block's id, so History shows it changed rather than taken out and added
function rewrite(w: BlockWriter, doc: StoryDoc, at: number, block: SeedBlock) {
  const id = idAt(doc, at);
  w.setBlockAttrs(id, { type: block.element, kind: block.kind });
  w.deleteText(id, 0, doc.blocks[at]!.text.length);
  let offset = 0;
  for (const run of toBlockJSON(block, id).content ?? []) {
    w.insertText(id, offset, run.text, run.marks);
    offset += run.text.length;
  }
  doc.blocks[at] = block;
}

/**
 * Applies `changes`, in order, to the script in `session` as one change and to `doc`, which must hold what the
 * script holds; an added block takes its id from `ids`. Inserts that follow one another go in together.
 */
export async function replayChanges(
  session: SeedSession,
  doc: StoryDoc,
  changes: readonly BlockChange[],
  ids: () => string,
): Promise<void> {
  if (changes.length === 0) return;
  await session.change((crdt) =>
    scriptBody(crdt).write((w) => {
      for (let i = 0; i < changes.length;) {
        const change = changes[i]!;
        i += 1;
        if (change.op === "replace") {
          rewrite(w, doc, change.at, change.block);
          continue;
        }
        if (change.op === "delete") {
          w.deleteBlock(idAt(doc, change.at));
          doc.blocks.splice(change.at, 1);
          doc.ids.splice(change.at, 1);
          continue;
        }
        const run = [change.block];
        for (
          let next = changes[i];
          next?.op === "insert" && next.at === change.at + run.length;
          next = changes[i]
        ) {
          run.push(next.block);
          i += 1;
        }
        const added = run.map(() => ids());
        const after = change.at === 0 ? null : idAt(doc, change.at - 1);
        w.insertBlocks(
          after,
          run.map((block, n) => toBlockJSON(block, added[n]!)),
        );
        doc.blocks.splice(change.at, 0, ...run);
        doc.ids.splice(change.at, 0, ...added);
      }
    }),
  );
}

/**
 * Replays the changes that turn what `doc` holds into `to`, cut into one session of `userId` on the document `key`
 * at each of `times`, in order.
 */
export async function replaySessions(
  story: Story,
  target: { userId: string; key: string; doc: StoryDoc; ids: () => string },
  to: readonly SeedBlock[],
  times: readonly string[],
): Promise<void> {
  const { userId, key, doc, ids } = target;
  const runs = sessionsBetween(doc.blocks, to, times.length);
  for (const [i, at] of times.entries()) {
    await story.at(at);
    await story.sessionWith(userId, key, (s) =>
      replayChanges(s, doc, runs[i]!, ids),
    );
  }
}

// the clock times a session may start at: a day's first session takes one of the first three, which on day D are
// all before the seed itself, and a second one on the same day the next
const SESSION_CLOCKS = ["10:20", "14:40", "16:50", "21:10"] as const;
const CLOCKS_BEFORE_SEED = 3;

/**
 * The times of `count` sessions spread evenly from `fromDays` to `toDays` days before D, both inclusive, in the
 * seed's notation and in order; a day that holds several takes them at later clock times. RangeError unless
 * `count` is a positive integer and `fromDays >= toDays >= 0`, or when one day would need more than it has.
 */
export function sessionTimes(
  fromDays: number,
  toDays: number,
  count: number,
): string[] {
  if (!Number.isInteger(count) || count < 1 || toDays < 0 || fromDays < toDays)
    throw new RangeError(
      `sessions need a positive count from a day back to a later one, not ${count} from D−${fromDays} to D−${toDays}`,
    );
  const times: string[] = [];
  let previous: { day: number; clock: number } | null = null;
  for (let i = 0; i < count; i += 1) {
    const day =
      count === 1
        ? fromDays
        : fromDays - Math.round((i * (fromDays - toDays)) / (count - 1));
    const clock: number =
      previous?.day === day ? previous.clock + 1 : i % CLOCKS_BEFORE_SEED;
    const clocks = day === 0 ? CLOCKS_BEFORE_SEED : SESSION_CLOCKS.length;
    if (clock >= clocks)
      throw new RangeError(`D−${day} cannot hold ${clock + 1} sessions`);
    times.push(`${day === 0 ? "D" : `D−${day}`} ${SESSION_CLOCKS[clock]!}`);
    previous = { day, clock };
  }
  return times;
}

const documentsOf = (projectKey: string): SeedDoc[] =>
  SEED_DOCS.filter((d) => d.projectKey === projectKey);

/** The manifest's entry for the project `projectKey`: its title and how many documents it holds. */
export function projectEntry(projectKey: string): SeedEntry {
  return {
    project: seedProject(projectKey).title,
    documents: documentsOf(projectKey).length,
  };
}

/**
 * Creates every document of the project `projectKey` in the project's home as `userId`, then enters the project
 * and its documents in its workspace's index, created at `at`.
 */
export async function createProject(
  driver: SeedDriver,
  options: { userId: string; projectKey: string; at: number },
): Promise<void> {
  const { userId, at } = options;
  const project = seedProject(options.projectKey);
  const documents = documentsOf(project.key);
  const home = projectHome(project.projectId);
  const { workspaceId } = project;
  for (const d of documents)
    await driver.create(userId, {
      docId: d.docId,
      kind: d.kind,
      home,
      workspaceId,
    });
  await driver.index(userId, workspaceId, {
    projects: [project],
    documents,
    at,
  });
}

/**
 * Sets the format the catalogue gives the document `key` in its script settings; skipped without "settings".
 * Throws SeedDriverError "refused" when the server refuses it.
 */
export async function setFormat(
  context: SeedContext,
  session: SeedSession,
  key: string,
): Promise<void> {
  const { format } = seedDoc(key);
  if (context.driver?.capabilities.has("settings") !== true) {
    context.skip("settings", `the ${format} format of ${key}`);
    return;
  }
  if ((await session.set("script.format", format)) === "refused")
    throw new SeedDriverError("refused", `the ${format} format of ${key}`);
}

/**
 * Checks each of `passages` against the server's pages, numbers and marks of the document `key`, each found in
 * `doc` by its first block; throws SeedBuildError "rules_broken" in `where` (the guide's project) on the first
 * disagreement, and a RangeError for a passage `doc` does not hold.
 */
export async function checkPassages(
  driver: SeedDriver,
  target: { key: string; doc: StoryDoc; where: string },
  passages: readonly SeedPassage[],
): Promise<void> {
  const { key, doc, where } = target;
  for (const passage of passages) {
    const first = idAt(doc, doc.blocks.indexOf(passage.blocks[0]!));
    const found = await driver.check(seedDoc(key).docId, passage, first);
    if (found.length > 0)
      throw new SeedBuildError("rules_broken", `${where}: ${found[0]!}`);
  }
}

/**
 * The beat at `i` of a document's `beats` with only the pages it does not share with the next: a beat may start
 * on the page the one before it ends on, and that page is written once.
 */
export function ownPages(beats: readonly Beat[], i: number): Beat {
  const beat = beats[i];
  if (beat === undefined) throw new RangeError(`there is no beat ${i}`);
  const next = beats[i + 1]?.pages[0] ?? beat.pages[1] + 1;
  return {
    ...beat,
    pages: [beat.pages[0], Math.max(beat.pages[0], next - 1)],
  };
}
