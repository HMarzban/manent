// The helpers every seed step tells its project's history with: times, sessions, drafts and production.
import { scriptBody } from "@manent/crdt";
import type { BlockJSON, TextJSON } from "@manent/schema";
import type { SeedBlock } from "../content/markup.ts";
import type { PageMeter } from "../generate/fit.ts";
import { seedDoc } from "./catalogue.ts";
import type { SeedDriver, SeedProduction, SeedSession } from "./driver.ts";
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
