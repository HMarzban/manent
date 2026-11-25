// What the seed writes of a person's private copies, writing position and hand-ins.

export type SeedWritingPosition = "everyone" | "suggestions" | "private";

export interface SeedHandInResult {
  readonly versionId: string;
  readonly scenes: number;
  readonly overlapCount: number;
  readonly setAsideCount: number;
}

export interface SeedPrivateCopies {
  /** Opens or creates `userId`'s private copy of `docId` through POST /api/private/create. */
  create(userId: string, docId: string): Promise<{ privateDocId: string }>;
  /** Records `userId`'s writing position for `docId` in their private index's `writing` map. */
  setPosition(
    userId: string,
    docId: string,
    position: SeedWritingPosition,
  ): Promise<void>;
  /** Hands `userId`'s open private copy of `docId` in to the room through POST /api/private/handin. */
  handIn(userId: string, docId: string): Promise<SeedHandInResult>;
}
