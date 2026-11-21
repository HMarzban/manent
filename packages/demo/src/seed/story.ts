// The helpers every seed step tells its project's history with: times, sessions, drafts and production.
import type { SeedBlock } from "../content/markup.ts";
import type { SeedSession } from "./driver.ts";
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

export function createStory(_context: SeedContext, _step: string): Story {
  return {
    at: async () => {},
    session: async () => {
      throw new Error("a story opens no session yet");
    },
    write: async () => [],
    sessionWith: async () => {},
    name: async () => "",
    restoreScene: async () => {},
    lock: async () => {},
    issue: async () => {},
  };
}
