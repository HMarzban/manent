// Push rules for a person's private index (`favourites` and `private_folder`) and combined Library push hooks.
import { createDoc, jsonMap } from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import type { Issue } from "@manent/schema";
import type { Storage } from "@manent/storage";
import { isDocKind } from "@manent/sync-protocol";
import type { SyncHooks } from "../sync/ports.ts";
import type { Room, Subscription } from "../sync/rooms.ts";
import { checkFolderPush } from "./folder-rules.ts";

const PROJECT_KINDS = Object.freeze([
  "film",
  "series",
  "show",
  "news",
  "podcast",
  "book",
  "game",
  "stage_play",
] as const);

const notIndex = (path: string, message: string): Issue => ({
  path,
  code: "not_index",
  severity: "reject",
  message,
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isSafeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const isProjectKind = (value: unknown): boolean =>
  typeof value === "string" && PROJECT_KINDS.some((kind) => kind === value);

const isOptionalString = (value: unknown): boolean =>
  value === undefined || value === null || typeof value === "string";

const isOptionalInt = (value: unknown): boolean =>
  value === undefined || value === null || isSafeInt(value);

/** True when `room` is a person's private index document. */
export function isPrivateIndex(room: Pick<Room, "home" | "kind">): boolean {
  return room.kind === "index" && room.home.kind === "user";
}

function checkFavouritesMap(doc: CrdtDoc): Issue[] {
  const issues: Issue[] = [];
  for (const [key, raw] of Object.entries(
    jsonMap(doc, "favourites").entries(),
  )) {
    const path = `maps.favourites.${key}`;
    if (!isPlainObject(raw)) {
      issues.push(notIndex(path, "a favourite entry must be an object"));
      continue;
    }
    const { kind, workspaceId, favouritedAt } = raw;
    if (kind !== "project" && kind !== "document")
      issues.push(
        notIndex(path, "a favourite kind must be project or document"),
      );
    if (typeof workspaceId !== "string" || workspaceId.trim().length === 0)
      issues.push(
        notIndex(path, "a favourite workspaceId must be a non-empty string"),
      );
    if (!isSafeInt(favouritedAt))
      issues.push(
        notIndex(path, "a favourite favouritedAt must be a safe integer"),
      );
  }
  return issues;
}

function newlyWrittenKeys(
  report: TransactionReport,
  mapName: string,
): Set<string> {
  const probe = createDoc();
  try {
    probe.applyUpdate(report.update);
    return new Set(jsonMap(probe, mapName).keys());
  } catch {
    // fall back to before() checks when the update cannot be decoded standalone
    return new Set();
  } finally {
    probe.destroy();
  }
}

const trashFieldOf = (
  value: unknown,
  field: "trashedAt" | "trashedByUserId",
) => (isPlainObject(value) && field in value ? (value[field] ?? null) : null);

function validatePrivateDocEntry(
  path: string,
  raw: Record<string, unknown>,
  prev: unknown,
  isNew: boolean,
): Issue[] {
  const issues: Issue[] = [];
  if (typeof raw.projectId !== "string" || raw.projectId.trim().length === 0)
    issues.push(
      notIndex(path, "a private document projectId must be non-empty"),
    );
  if (typeof raw.title !== "string")
    issues.push(notIndex(path, "a private document title must be a string"));
  if (typeof raw.kind !== "string" || !isDocKind(raw.kind))
    issues.push(
      notIndex(path, "a private document kind must be a valid DocKind"),
    );
  if (!isSafeInt(raw.createdAt))
    issues.push(
      notIndex(path, "a private document createdAt must be a safe integer"),
    );
  if (raw.editedAt !== null && !isSafeInt(raw.editedAt))
    issues.push(
      notIndex(
        path,
        "a private document editedAt must be null or safe integer",
      ),
    );
  if (raw.editedByUserId !== null && typeof raw.editedByUserId !== "string")
    issues.push(
      notIndex(
        path,
        "a private document editedByUserId must be null or string",
      ),
    );
  if (!isOptionalString(raw.airDate) || !isOptionalString(raw.rundownId))
    issues.push(
      notIndex(
        path,
        "a private document airDate/rundownId must be null or string",
      ),
    );
  if (!isOptionalInt(raw.trashedAt) || !isOptionalString(raw.trashedByUserId))
    issues.push(notIndex(path, "a private document trash field is malformed"));
  const afterAt = trashFieldOf(raw, "trashedAt");
  const afterBy = trashFieldOf(raw, "trashedByUserId");
  if (prev !== undefined) {
    if (
      afterAt !== trashFieldOf(prev, "trashedAt") ||
      afterBy !== trashFieldOf(prev, "trashedByUserId")
    )
      issues.push(
        notIndex(
          path,
          "a client push may not change trashedAt or trashedByUserId",
        ),
      );
  } else if (isNew && (afterAt !== null || afterBy !== null)) {
    issues.push(
      notIndex(path, "a client push may not set trashedAt or trashedByUserId"),
    );
  }
  return issues;
}

function validatePrivateProjectEntry(
  path: string,
  raw: Record<string, unknown>,
): Issue[] {
  const issues: Issue[] = [];
  if (typeof raw.title !== "string")
    issues.push(notIndex(path, "a private project title must be a string"));
  if (!isProjectKind(raw.kind))
    issues.push(
      notIndex(path, "a private project kind must be a valid ProjectKind"),
    );
  if (!isSafeInt(raw.createdAt))
    issues.push(
      notIndex(path, "a private project createdAt must be a safe integer"),
    );
  if (
    typeof raw.createdByUserId !== "string" ||
    raw.createdByUserId.trim().length === 0
  )
    issues.push(
      notIndex(path, "a private project createdByUserId must be non-empty"),
    );
  if (raw.folderId !== null)
    issues.push(notIndex(path, "a private project folderId must be null"));
  return issues;
}

function checkPrivateFolderMap(
  doc: CrdtDoc,
  report: TransactionReport,
): Issue[] {
  const issues: Issue[] = [];
  const inserted = newlyWrittenKeys(report, "private_folder");
  for (const [key, raw] of Object.entries(
    jsonMap(doc, "private_folder").entries(),
  )) {
    const path = `maps.private_folder.${key}`;
    if (!isPlainObject(raw)) {
      issues.push(notIndex(path, "a private_folder entry must be an object"));
      continue;
    }
    if ("projectId" in raw)
      issues.push(
        ...validatePrivateDocEntry(
          path,
          raw,
          report.before("private_folder", key),
          inserted.has(key),
        ),
      );
    else issues.push(...validatePrivateProjectEntry(path, raw));
  }
  return issues;
}

/** Validates a client push to a private index's `favourites` and `private_folder` maps. */
export function checkPrivateIndexPush(
  room?: Room,
  report?: TransactionReport,
  _pusher?: Subscription,
): Issue[] {
  if (
    room === undefined ||
    report === undefined ||
    room.doc === null ||
    !isPrivateIndex(room)
  )
    return [];
  const issues: Issue[] = [];
  if (report.maps.includes("favourites"))
    issues.push(...checkFavouritesMap(room.doc));
  if (report.maps.includes("private_folder"))
    issues.push(...checkPrivateFolderMap(room.doc, report));
  return issues;
}

/** Sync hooks enforcing workspace folder/trash rules and private index entry schemas. */
export function createLibraryPushHooks(options?: {
  storage?: Storage;
}): SyncHooks {
  return {
    checkPush(room, report, pusher) {
      return [
        ...checkFolderPush(room, report, pusher, options?.storage),
        ...checkPrivateIndexPush(room, report, pusher),
      ];
    },
  };
}
