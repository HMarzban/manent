// What the seed writes of a rundown: the rundown itself, and its stories.
import type { SeedWorkspaceId } from "../catalogue.ts";

export interface SeedRundowns {
  /**
   * POST /api/docs with kind `rundown`, then the rundown's fields, and its entry in the workspace's index with its
   * `airDate`. `airAt` and `targetMs` are milliseconds.
   */
  create(
    userId: string,
    rundown: {
      docId: string;
      workspaceId: SeedWorkspaceId;
      home: string;
      airDate: string;
      airAt: number | null;
      targetMs: number | null;
    },
  ): Promise<void>;
  /** Sets `rundownId` on the index entries of `storyDocIds`. */
  link(
    userId: string,
    workspaceId: SeedWorkspaceId,
    link: { rundownId: string; storyDocIds: readonly string[] },
  ): Promise<void>;
}
