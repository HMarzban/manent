// What the history routes and others' history events carry, checked field by field before typed code reads it.
import { isVersionContent } from "@manent/sync-client";
import { VERSION_KINDS } from "@manent/sync-protocol";
import type {
  RestoreResponse,
  SinceResponse,
  VersionContentResponse,
  VersionItem,
  VersionListResponse,
  VersionPosition,
  WhoWroteResponse,
} from "@manent/sync-protocol";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const isText = (value: unknown): value is string =>
  typeof value === "string";
export const isTextOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === "string";
export const isInstant = (value: unknown): value is number =>
  Number.isSafeInteger(value);

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isTexts = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isText);

const isPosition = (value: unknown): value is VersionPosition =>
  isRecord(value) && isCount(value.generation) && isCount(value.seq);

const isSummary = (value: unknown): value is VersionItem["summary"] =>
  value === null ||
  (isRecord(value) &&
    isTexts(value.authorUserIds) &&
    isCount(value.changes) &&
    isCount(value.scenes));

const isVersionItem = (value: unknown): value is VersionItem =>
  isRecord(value) &&
  isText(value.id) &&
  VERSION_KINDS.some((kind) => kind === value.kind) &&
  isTextOrNull(value.name) &&
  isText(value.createdByUserId) &&
  isInstant(value.createdAt) &&
  typeof value.onDevice === "boolean" &&
  (value.position === null || isPosition(value.position)) &&
  (value.engineVersion === null || isCount(value.engineVersion)) &&
  isSummary(value.summary);

export const isVersionList = (value: unknown): value is VersionListResponse =>
  isRecord(value) &&
  Array.isArray(value.versions) &&
  value.versions.every(isVersionItem) &&
  isTextOrNull(value.next) &&
  isPosition(value.head) &&
  typeof value.othersCanOpen === "boolean";

/** Checks the content as far as `isVersionContent` does: each top-level field's kind. */
export const isContentAnswer = (
  value: unknown,
): value is VersionContentResponse =>
  isRecord(value) &&
  isVersionContent(value.content) &&
  (value.position === null || isPosition(value.position));

export const isRestoreAnswer = (value: unknown): value is RestoreResponse =>
  isRecord(value) &&
  isText(value.beforeVersionId) &&
  isCount(value.serverSeq) &&
  isCount(value.applied);

export const isWhoWrote = (value: unknown): value is WhoWroteResponse =>
  isRecord(value) &&
  isText(value.userId) &&
  isInstant(value.at) &&
  isTextOrNull(value.previous) &&
  typeof value.exact === "boolean";

export const isSince = (value: unknown): value is SinceResponse =>
  isRecord(value) && isCount(value.changes) && isTexts(value.authorUserIds);
