// What the seed writes of a script started from another document, and its scene-to-chapter map.
import type { SeedWorkspaceId } from "../catalogue.ts";

export interface SeedStartFrom {
  /**
   * Ensures the copy's project index exists and writes `source` under `copy.docId` in its `source`
   * map, optionally carrying `chapters` (`Record<sceneHeadingId, chapterBlockId>`).
   */
  linkSource(
    userId: string,
    copy: {
      projectId: string;
      workspaceId: SeedWorkspaceId;
      docId: string;
    },
    source: {
      docId: string;
      versionId: string | null;
      copiedAt: number;
      chapters?: Readonly<Record<string, string>>;
    },
  ): Promise<void>;
  /** The id of the newest version of `docId` created at or before `at` (epoch ms); null when none exists. */
  latestVersionAt(
    userId: string,
    docId: string,
    at: number,
  ): Promise<string | null>;
}
