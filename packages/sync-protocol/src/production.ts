// Production revisions over HTTP: the state the authority sequences, the requests that change it, and its refusals.
// Every body carries `docId`; every list gains members at the end only.
import { isReplayKey } from "./http.ts";
import type { LockAnchorRecord } from "./messages.ts";

export const PRODUCTION_STATE_VERSION = 1;

/** `suffix` numbers a new scene 12A; `prefix` numbers it A12. */
export const NUMBERING_SCHEMES = ["suffix", "prefix"] as const;
export type NumberingScheme = (typeof NUMBERING_SCHEMES)[number];

export const COLOUR_ORDER_IDS = ["standard", "extended"] as const;
export type ColourOrderId = (typeof COLOUR_ORDER_IDS)[number];

export const MARK_MODES = [
  "collated",
  "this_revision",
  "all",
  "since_full_draft",
  "none",
] as const;
export type MarkMode = (typeof MARK_MODES)[number];

export const ISSUE_FILES = ["pdf_marked", "pdf_clean"] as const;
export type IssueFile = (typeof ISSUE_FILES)[number];

export const PAGE_OPS = [
  "lock",
  "unlock",
  "lock_a_pages",
  "renumber",
  "consolidate",
] as const;
export type PageOp = (typeof PAGE_OPS)[number];

export const BLOCK_CHANGES = [
  "added",
  "changed",
  "moved",
  "shown",
  "removed",
] as const;
export type BlockChange = (typeof BLOCK_CHANGES)[number];

/** One block an issued revision marked. */
export interface SetBlockRecord {
  blockId: string;
  pageLabel: string;
  change: BlockChange;
  /** The block's contentHash at issue. */
  hash: string;
  /** The mark's ranges; both empty when the mark is whole. */
  inserted: [number, number][];
  deletedAt: number[];
}

/** One revision: `issuedAt` and the fields after it are null until it is issued. */
export interface RevisionSetView {
  setId: string;
  ordinal: number;
  name: string;
  colour: string;
  mark: string;
  fullDraft: boolean;
  startedAt: number;
  issuedAt: number | null;
  /** The issuing device's calendar day, YYYY-MM-DD. */
  issuedOn: string | null;
  issuedByName: string | null;
  recalledAt: number | null;
  baselineVersionId: string;
  issuedVersionId: string | null;
  engineVersion: number;
  /** Empty for a revision not yet issued. */
  blocks: SetBlockRecord[];
}

export interface IssueView {
  issueId: string;
  setId: string;
  kind: "issue" | "correction";
  versionId: string;
  issuedAt: number;
  issuedOn: string;
  issuedByName: string;
  recipientUserIds: string[];
  pages: string[];
  memo: string;
  files: IssueFile[];
  tint: boolean;
  what: "changed" | "full";
}

export interface SceneNumberRecord {
  blockId: string;
  num: string;
  /** The block is gone; the number is never given to another block. */
  reserved: boolean;
}

export interface ProductionState {
  v: 1;
  docId: string;
  headSeq: number;
  locked: boolean;
  lockLevel: number;
  lockedOn: string | null;
  numbering: NumberingScheme;
  colourOrder: string[];
  anchors: LockAnchorRecord[];
  sceneNumbers: SceneNumberRecord[];
  /** Oldest first; the last is the active one; empty when not locked. */
  sets: RevisionSetView[];
  /** Newest first. */
  issues: IssueView[];
}

interface Mutating {
  docId: string;
  /** The idempotency key (`isRequestKey`): a retry under it is answered with the first result. */
  key: string;
}

export interface LockRequest extends Mutating {
  numbering: NumberingScheme;
  colourOrder: ColourOrderId;
  /** The device's day, YYYY-MM-DD. */
  lockedOn: string;
}

export interface PagesRequest extends Mutating {
  op: PageOp;
  labels: string[];
  /** Renumber's new label; null for every other op. */
  label: string | null;
}

export interface LayoutRequest extends Mutating {
  changes: { key: string; value: unknown }[];
  /** What the dialog stated; the server answers `changed` when its own count differs. */
  affected: { gainAPages: string[]; fallShort: string[] };
}

export interface IssueRequest extends Mutating {
  expectedOrdinal: number;
  what: "changed" | "full";
  /** The labels the screen stated; the server answers `changed` when its own differ. */
  pages: string[];
  files: IssueFile[];
  tint: boolean;
  recipientUserIds: string[];
  memo: string;
  issuedOn: string;
}

export interface RecallRequest extends Mutating {
  setId: string;
  pages: string[];
  memo: string;
  issuedOn: string;
  files: IssueFile[];
  tint: boolean;
}

/** Answered with application/pdf bytes. */
export interface FileRequest {
  docId: string;
  issueId: string;
  file: IssueFile;
}

export interface IssueResponse {
  state: ProductionState;
  issue: IssueView;
}

export const PRODUCTION_REFUSALS = [
  "already_issued",
  "already_locked",
  "bad_request",
  "busy",
  "changed",
  "engine_unavailable",
  "forbidden",
  "not_found",
  "not_locked",
  "recall_closed",
  "unknown_label",
] as const;
export type ProductionRefusal = (typeof PRODUCTION_REFUSALS)[number];

export interface ProductionRefusalBody {
  error: ProductionRefusal;
  /** Set for `already_issued` only. */
  issued: {
    name: string;
    byName: string;
    issuedAt: number;
    nextName: string;
  } | null;
}

/** A request key has the format of a replay key: 32 lower-case hexadecimal characters. */
export const isRequestKey: (value: unknown) => value is string = isReplayKey;

const isFields = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Checks the version and each top-level field's kind, and nothing deeper: the cache holds only what the server sent. */
export function isProductionState(value: unknown): value is ProductionState {
  if (!isFields(value)) return false;
  return (
    value.v === PRODUCTION_STATE_VERSION &&
    typeof value.docId === "string" &&
    typeof value.headSeq === "number" &&
    typeof value.locked === "boolean" &&
    typeof value.lockLevel === "number" &&
    (value.lockedOn === null || typeof value.lockedOn === "string") &&
    NUMBERING_SCHEMES.some((scheme) => scheme === value.numbering) &&
    [
      value.colourOrder,
      value.anchors,
      value.sceneNumbers,
      value.sets,
      value.issues,
    ].every((list) => Array.isArray(list))
  );
}

/** One revision set of an imported script, as the file marked it. */
export interface ImportedSetRequest {
  sourceName: string;
  /** One of the revision colours. */
  colour: string;
  mark: string;
  fullDraft: boolean;
  /** UTF-16 ranges inserted inside each block's text, and the offsets where text was deleted. */
  blocks: {
    blockId: string;
    inserted: [number, number][];
    deletedAt: number[];
  }[];
}

/** The body of POST /api/production/import: lock an imported script where the file locked it. */
export interface ImportLockRequest extends Mutating {
  /** The device's day, YYYY-MM-DD. */
  lockedOn: string;
  numbering: NumberingScheme;
  /** Page starts in page order; empty: the authority records every page as Lock does. */
  anchors: { label: string; blockId: string; offset: number }[];
  sceneNumbers: { blockId: string; num: string }[];
  /** Oldest first. */
  sets: ImportedSetRequest[];
}
