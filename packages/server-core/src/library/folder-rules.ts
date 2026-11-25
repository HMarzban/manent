// Push rules for a workspace index: folder shapes and immutability, project folder references, and Trash fields.
import { createDoc, jsonMap } from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import type { Issue } from "@manent/schema";
import type { Storage } from "@manent/storage";
import { isWriterRole } from "../sync/admission.ts";
import type { Room, Subscription } from "../sync/rooms.ts";

const MAX_FOLDER_NAME_LEN = 200;

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

/** True when `room` is a workspace index document (`home.kind === "project"` and `home.id === docId`). */
export function isWorkspaceIndex(
  room: Pick<Room, "docId" | "home" | "kind">,
): boolean {
  return (
    room.kind === "index" &&
    room.home.kind === "project" &&
    room.home.id === room.docId
  );
}

function hasParentCycle(
  startId: string,
  entries: Readonly<Record<string, unknown>>,
): boolean {
  const seen = new Set<string>([startId]);
  let cursor: unknown = entries[startId];
  while (isPlainObject(cursor) && typeof cursor.parentId === "string") {
    const parentId = cursor.parentId;
    if (seen.has(parentId)) return true;
    seen.add(parentId);
    cursor = entries[parentId];
  }
  return false;
}

function checkFoldersMap(
  doc: CrdtDoc,
  report: TransactionReport,
  pusher: Subscription | undefined,
): Issue[] {
  const issues: Issue[] = [];
  if (pusher === undefined || !isWriterRole(pusher.access.role)) {
    issues.push(
      notIndex(
        "maps.folders",
        "only workspace owners and editors may write folders",
      ),
    );
    return issues;
  }
  const entries = jsonMap(doc, "folders").entries();
  const folderIds = new Set(Object.keys(entries));
  for (const [id, raw] of Object.entries(entries)) {
    const path = `maps.folders.${id}`;
    if (!isPlainObject(raw)) {
      issues.push(notIndex(path, "a folder entry must be an object"));
      continue;
    }
    const { name, parentId, createdAt, createdByUserId } = raw;
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (trimmed.length === 0 || trimmed.length > MAX_FOLDER_NAME_LEN)
      issues.push(
        notIndex(path, "a folder name must be 1 to 200 non-blank characters"),
      );
    if (!isSafeInt(createdAt))
      issues.push(notIndex(path, "a folder createdAt must be a safe integer"));
    if (
      typeof createdByUserId !== "string" ||
      createdByUserId.trim().length === 0
    )
      issues.push(
        notIndex(path, "a folder createdByUserId must be a non-empty string"),
      );
    if (parentId !== null) {
      if (typeof parentId !== "string" || !folderIds.has(parentId))
        issues.push(
          notIndex(
            path,
            "a folder parentId must be null or an existing folder",
          ),
        );
      else if (parentId === id || hasParentCycle(id, entries))
        issues.push(notIndex(path, "a folder parent chain must not cycle"));
    }
    const prev = report.before("folders", id);
    if (prev !== undefined && isPlainObject(prev) && prev.parentId !== parentId)
      issues.push(
        notIndex(path, "an existing folder's parentId cannot be changed"),
      );
  }
  return issues;
}

function checkProjectsFolderRefs(
  doc: CrdtDoc,
  report: TransactionReport,
  pusher: Subscription | undefined,
): Issue[] {
  const issues: Issue[] = [];
  const folderIds = new Set(jsonMap(doc, "folders").keys());
  const projects = jsonMap(doc, "projects").entries();
  const canWriteFolders =
    pusher !== undefined && isWriterRole(pusher.access.role);
  for (const [projectId, raw] of Object.entries(projects)) {
    if (!isPlainObject(raw)) continue;
    const prev = report.before("projects", projectId);
    const prevFolderId = isPlainObject(prev) ? (prev.folderId ?? null) : null;
    const folderId = raw.folderId ?? null;
    if (folderId !== prevFolderId && !canWriteFolders) {
      issues.push(
        notIndex(
          `maps.projects.${projectId}`,
          "only workspace owners and editors may change a project's folderId",
        ),
      );
      continue;
    }
    if (folderId !== null) {
      if (typeof folderId !== "string" || !folderIds.has(folderId))
        issues.push(
          notIndex(
            `maps.projects.${projectId}`,
            "a project's folderId must be null or name an existing folder",
          ),
        );
    }
  }
  return issues;
}

/** Keys newly inserted into `mapName` by `report.update` without prior-item dependencies. */
function newlyWrittenKeys(
  report: TransactionReport,
  mapName: string,
): Set<string> {
  const probe = createDoc();
  try {
    probe.applyUpdate(report.update);
    return new Set(jsonMap(probe, mapName).keys());
  } catch {
    // an update whose root map items fail to decode independently is still checked via before() and storage
    return new Set();
  } finally {
    probe.destroy();
  }
}

const trashFieldOf = (
  value: unknown,
  field: "trashedAt" | "trashedByUserId",
) => (isPlainObject(value) && field in value ? (value[field] ?? null) : null);

function checkDocumentsTrashFields(
  room: Room,
  doc: CrdtDoc,
  report: TransactionReport,
  storage: Storage | undefined,
): Issue[] {
  const issues: Issue[] = [];
  const docsMap = jsonMap(doc, "documents");
  const entries = docsMap.entries();
  const inserted = newlyWrittenKeys(report, "documents");
  for (const [docId, raw] of Object.entries(entries)) {
    const path = `maps.documents.${docId}`;
    const afterAt = trashFieldOf(raw, "trashedAt");
    const afterBy = trashFieldOf(raw, "trashedByUserId");
    const prev = report.before("documents", docId);
    if (prev !== undefined) {
      const prevAt = trashFieldOf(prev, "trashedAt");
      const prevBy = trashFieldOf(prev, "trashedByUserId");
      if (afterAt !== prevAt || afterBy !== prevBy)
        issues.push(
          notIndex(
            path,
            "a client push may not change trashedAt or trashedByUserId",
          ),
        );
      continue;
    }
    if (afterAt === null && afterBy === null) continue;
    if (inserted.has(docId)) {
      issues.push(
        notIndex(
          path,
          "a client push may not set trashedAt or trashedByUserId",
        ),
      );
      continue;
    }
    const row = storage?.trash.get(docId) ?? null;
    if (
      row === null ||
      row.workspaceId !== room.docId ||
      afterAt !== row.deletedAt ||
      afterBy !== row.deletedByUserId
    )
      issues.push(
        notIndex(
          path,
          "a client push may not forge trashedAt or trashedByUserId",
        ),
      );
  }
  if (storage !== undefined) {
    for (const row of storage.trash.listByWorkspace(room.docId)) {
      if (
        report.before("documents", row.docId) !== undefined &&
        docsMap.get(row.docId) === null
      )
        issues.push(
          notIndex(
            `maps.documents.${row.docId}`,
            "a client push may not remove a trashed document entry",
          ),
        );
    }
  }
  return issues;
}

/** Validates a client push to a workspace index's `folders`, `projects`, and `documents` maps. */
export function checkFolderPush(
  room?: Room,
  report?: TransactionReport,
  pusher?: Subscription,
  storage?: Storage,
): Issue[] {
  if (
    room === undefined ||
    report === undefined ||
    room.doc === null ||
    !isWorkspaceIndex(room)
  )
    return [];
  const issues: Issue[] = [];
  if (report.maps.includes("folders"))
    issues.push(...checkFoldersMap(room.doc, report, pusher));
  if (report.maps.includes("projects") || report.maps.includes("folders"))
    issues.push(...checkProjectsFolderRefs(room.doc, report, pusher));
  if (report.maps.includes("documents"))
    issues.push(...checkDocumentsTrashFields(room, room.doc, report, storage));
  return issues;
}
