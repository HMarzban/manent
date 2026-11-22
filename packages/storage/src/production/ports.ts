// The stored state of production revisions, kept in the document's own file so that a request's rows, its
// idempotency row and its edit commit together. Lists of strings are stored as JSON arrays.

export interface ProductionRow {
  docId: string;
  numbering: string;
  colourOrder: string[];
  lockedAt: number;
  /** The locking device's day, YYYY-MM-DD. */
  lockedOn: string;
  lockedByUserId: string;
  /** Null while the script is in production. */
  endedAt: number | null;
}

/** One row of the anchor table: the page `order` of lock level `level` starts at `offset` in block `blockId`. */
export interface AnchorRow {
  level: number;
  order: number;
  label: string;
  blockId: string;
  /** UTF-16 units into the block's text. */
  offset: number;
  quote: string | null;
  fallbackIds: string[];
  source: string;
}

export interface RevisionSetRow {
  id: string;
  docId: string;
  ordinal: number;
  name: string;
  colour: string;
  mark: string;
  baselineVersionId: string;
  /** This and the fields up to `recalledAt` are null until the revision is issued. */
  issuedVersionId: string | null;
  issuedAt: number | null;
  issuedOn: string | null;
  issuedByUserId: string | null;
  recalledAt: number | null;
  fullDraft: boolean;
  startedAt: number;
  engineVersion: number;
}

export interface SetBlockRow {
  setId: string;
  blockId: string;
  pageLabel: string;
  change: string;
  hash: string;
  /** The mark's ranges; both empty when the mark is whole. */
  inserted: [number, number][];
  deletedAt: number[];
}

export interface IssueRow {
  id: string;
  docId: string;
  setId: string;
  kind: "issue" | "correction";
  versionId: string;
  issuedByUserId: string;
  issuedAt: number;
  issuedOn: string;
  recipientUserIds: string[];
  pages: string[];
  memo: string;
  files: string[];
  tint: boolean;
  what: string;
}

export interface SceneNumberRow {
  blockId: string;
  num: string;
  /** The block is gone; the number is never given to another block. */
  reserved: boolean;
}

/** A request's stored answer: `status` is its HTTP status, `result` its body as JSON. */
export interface RequestRow {
  docId: string;
  key: string;
  userId: string;
  status: number;
  result: string;
  createdAt: number;
}

/** Every write joins the document file's `transaction`. */
export interface ProductionStore {
  get(docId: string): ProductionRow | null;
  put(row: ProductionRow): void;
  /** Writes `documents.locked`, which means "in production". */
  setLocked(docId: string, locked: boolean): void;
  /** The open table, by level then order. */
  anchors(docId: string): AnchorRow[];
  /** The table whose range holds `at`: from ≤ position < to within a generation, continuing across a rebuild. */
  anchorsAt(
    docId: string,
    at: { generation: number; seq: number },
  ): AnchorRow[];
  /** Closes every open row at `at` and opens `rows` from it. */
  replaceAnchors(
    docId: string,
    rows: readonly AnchorRow[],
    at: { generation: number; seq: number },
  ): void;
  anchorHistory(docId: string): (AnchorRow & {
    fromGeneration: number;
    fromSeq: number;
    toGeneration: number | null;
    toSeq: number | null;
  })[];
  /** By ordinal. */
  sets(docId: string): RevisionSetRow[];
  addSet(row: RevisionSetRow): void;
  updateSet(
    setId: string,
    patch: Partial<Omit<RevisionSetRow, "id" | "docId" | "ordinal">>,
  ): void;
  setBlocks(setId: string): SetBlockRow[];
  /** Replaces that set's rows. */
  putSetBlocks(setId: string, rows: readonly SetBlockRow[]): void;
  /** Newest first. */
  issues(docId: string): IssueRow[];
  addIssue(row: IssueRow): void;
  sceneNumbers(docId: string): SceneNumberRow[];
  /** Upserts by block. */
  putSceneNumbers(docId: string, rows: readonly SceneNumberRow[]): void;
  clearSceneNumbers(docId: string): void;
  request(docId: string, key: string): RequestRow | null;
  /** Throws a RangeError for a key already stored. */
  putRequest(row: RequestRow): void;
}
