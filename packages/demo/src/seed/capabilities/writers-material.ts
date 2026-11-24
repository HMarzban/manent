// What the seed writes of a script's notes, alternates, cuts and scene assignments.
import type { SceneProgress } from "@manent/crdt";
import type { BlockJSON, TextAnchor } from "@manent/schema";

export interface SeedNoteInput {
  readonly anchor: TextAnchor | null;
  readonly text: string;
  readonly writerName: string | null;
}

export interface SeedSceneAssignmentInput {
  readonly headingId: string;
  readonly writerUserId?: string | null;
  readonly progress?: SceneProgress;
}

export interface SeedWritersMaterial {
  /** Adds one or more private Notes (`NOTES_MAP`) to `docId` in a single session as `userId`. */
  addNotes(
    userId: string,
    docId: string,
    notes: readonly SeedNoteInput[],
  ): Promise<readonly string[]>;
  /** Adds an alternate line to dialogue block `blockId` in `docId` as `userId`. */
  addAlternate(
    userId: string,
    docId: string,
    alternate: { blockId: string; text: string; pitched: boolean },
  ): Promise<{ alternateId: string }>;
  /** Moves existing blocks `blockIds` out of `docId` into `CUTS_MAP` as `userId`. */
  moveToCuts(
    userId: string,
    docId: string,
    blockIds: readonly string[],
  ): Promise<{ cutId: string }>;
  /** Records already-cut blocks in `CUTS_MAP` of `docId` with their origin block and scene heading. */
  addCut(
    userId: string,
    docId: string,
    cut: {
      blocks: readonly BlockJSON[];
      afterBlockId: string | null;
      sceneHeadingId: string | null;
    },
  ): Promise<{ cutId: string }>;
  /** Assigns scene headings to writers and/or sets their progress in `SCENE_PROGRESS_MAP`. */
  setSceneAssignments(
    userId: string,
    docId: string,
    assignments: readonly SeedSceneAssignmentInput[],
  ): Promise<void>;
}
