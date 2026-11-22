// The helpers every seed step tells its project's history with: times, sessions, drafts and production.
import { scriptBody } from "@manent/crdt";
import type { BlockJSON, TextJSON } from "@manent/schema";
import type { SeedBlock } from "../content/markup.ts";
import type { PageMeter } from "../generate/fit.ts";
import { seedDoc } from "./catalogue.ts";
import type { SeedSession } from "./driver.ts";
import type { SeedContext } from "./seed.ts";

export interface Story {
  /** The engine's page meter, which every fit of this story measures with. */
  readonly meter: PageMeter;
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
  return {
    meter,
    at: (spec) => driver.setTime(time.at(spec)),
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
