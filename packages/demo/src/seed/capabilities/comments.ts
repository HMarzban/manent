// What the seed writes of comments, rounds, replies, resolutions and flags.
import type { CommentOutcome } from "@manent/crdt";
import type { TextAnchor } from "@manent/schema";

export interface SeedRound {
  readonly roundId: string;
  readonly name: string;
  readonly versionId: string;
  readonly createdAt: number;
}

export interface SeedComments {
  /** Ensures the script's comments document exists and opens a round on `versionId`. */
  startRound(
    userId: string,
    scriptDocId: string,
    round: { name: string; versionId: string },
  ): Promise<{ roundId: string }>;
  /** Lists the rounds stored in the script's comments document, by id ascending. */
  rounds(userId: string, scriptDocId: string): Promise<readonly SeedRound[]>;
  /** Starts an open comment thread on `scriptDocId` as `userId`. */
  startThread(
    userId: string,
    scriptDocId: string,
    thread: {
      anchor: TextAnchor | null;
      roundId: string | null;
      body: string;
      mentionedUserIds?: readonly string[];
    },
  ): Promise<{ threadId: string; itemId: string }>;
  /** Adds a reply item to `threadId` as `userId`. */
  reply(
    userId: string,
    scriptDocId: string,
    reply: {
      threadId: string;
      body: string;
      mentionedUserIds?: readonly string[];
    },
  ): Promise<{ itemId: string }>;
  /** Resolves `threadId` as `userId`, with optional round outcome and reason. */
  resolve(
    userId: string,
    scriptDocId: string,
    resolve: {
      threadId: string;
      outcome: CommentOutcome | null;
      reason: string | null;
    },
  ): Promise<void>;
  /** Reopens `threadId` as `userId`. */
  reopen(userId: string, scriptDocId: string, threadId: string): Promise<void>;
  /** Flags `threadId` for `flaggedUserId` from the Check `checkKey`. */
  flag(
    userId: string,
    scriptDocId: string,
    flag: { threadId: string; flaggedUserId: string; checkKey: string },
  ): Promise<{ flagId: string }>;
}
