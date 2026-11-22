// The helpers every seed step tells its project's history with: times, sessions, drafts and production.
import { scriptBody } from "@manent/crdt";
import { attrsForNewBlock } from "@manent/schema";
import type { BlockJSON, TextJSON } from "@manent/schema";
import type { SeedBlock } from "../content/markup.ts";
import { seedDoc } from "./catalogue.ts";
import type { SeedSession } from "./driver.ts";
import type { SeedContext } from "./seed.ts";

export interface Story {
  /** The driver's clock moves to the time `spec` names in the seed's notation; RangeError if it is before this story's last. */
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
  /** A named draft; skipped without "history". */
  name(userId: string, key: string, name: string): Promise<string>;
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

/** The text runs of `block`, each carrying the marks that cover all of it. */
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

export function toBlockJSON(block: SeedBlock, id: string): BlockJSON {
  const content = runsOf(block);
  // spread, because BlockJSON's attrs are an open record and BlockAttrs is an interface
  const attrs = { ...attrsForNewBlock(block.element, id), kind: block.kind };
  return content.length === 0
    ? { type: "block", attrs }
    : { type: "block", attrs, content };
}

/**
 * The story of one step, told through `context.driver`. Throws a RangeError naming `step` when there is
 * no driver: a step returns its entries before it tells its story.
 */
export function createStory(context: SeedContext, step: string): Story {
  const { driver, time } = context;
  if (driver === null)
    throw new RangeError(
      `the seed step ${step} has no driver to tell its story with`,
    );
  const production = (what: string) => {
    if (driver.production === null || !driver.capabilities.has("production")) {
      context.skip("production", what);
      return null;
    }
    return driver.production;
  };
  const session = (userId: string, key: string) =>
    driver.open(userId, seedDoc(key).docId);
  let last = -Infinity;
  return {
    at(spec) {
      const t = time.at(spec);
      if (t < last)
        throw new RangeError(
          `the story of ${step} cannot go back from ${last} to ${t}`,
        );
      last = t;
      return driver.setTime(t);
    },
    session,
    async write(s, blocks, after, ids) {
      const made = blocks.map(() => ids());
      await s.change((doc) =>
        scriptBody(doc).write((writer) => {
          writer.insertBlocks(
            after,
            blocks.map((block, i) => toBlockJSON(block, made[i]!)),
          );
        }),
      );
      return made;
    },
    async sessionWith(userId, key, fn) {
      const s = await session(userId, key);
      await fn(s);
      await s.close();
    },
    async name(userId, key, name) {
      if (!driver.capabilities.has("history")) {
        context.skip("history", `name the draft ${name}`);
        return "";
      }
      const draft = await driver.nameDraft(userId, seedDoc(key).docId, name);
      return draft.versionId;
    },
    async restoreScene(userId, key, versionName, headingId) {
      if (!driver.capabilities.has("restore")) {
        context.skip("restore", `restore a scene from ${versionName}`);
        return;
      }
      const { docId } = seedDoc(key);
      const versions = await driver.versions(userId, docId);
      const version = versions.find((v) => v.name === versionName);
      if (version === undefined)
        throw new RangeError(`${key} has no version named ${versionName}`);
      await driver.restore(userId, docId, version.id, {
        kind: "scene",
        headingId,
      });
    },
    async lock(userId, key) {
      await production("lock the page numbers")?.lock(
        userId,
        seedDoc(key).docId,
      );
    },
    async issue(userId, key, memo) {
      await production("issue the revised pages")?.issue(
        userId,
        seedDoc(key).docId,
        memo,
      );
    },
  };
}
