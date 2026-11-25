// What the Library's Trash routes answer, what a client sends them, and the CONTROL payload for Trash changes.
import { isDocId } from "./doc-id.ts";

/** Body of POST /api/trash/move. */
export interface TrashMoveRequest {
  docId: string;
}

/** Answer to POST /api/trash/move; `purgeAfterAt` is epoch ms. */
export interface TrashMoveResponse {
  docId: string;
  purgeAfterAt: number;
}

/** Body of POST /api/trash/restore. */
export interface TrashRestoreRequest {
  docId: string;
}

/** Answer to POST /api/trash/restore. */
export interface TrashRestoreResponse {
  docId: string;
}

/** Body of POST /api/trash/list. */
export interface TrashListRequest {
  workspaceId: string;
}

/** One row returned by POST /api/trash/list; `deletedAt` and `purgeAfterAt` are epoch ms. */
export interface TrashListItem {
  docId: string;
  workspaceId: string;
  title: string;
  deletedByUserId: string;
  deletedByName: string;
  deletedAt: number;
  purgeAfterAt: number;
}

/** Answer to POST /api/trash/list, ordered newest first. */
export interface TrashListResponse {
  items: TrashListItem[];
}

/** JSON payload carried by CONTROL frames `trashed` and `untrashed`; instants are epoch ms. */
export interface TrashControlData {
  userId: string;
  at: number;
  purgeAfterAt: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isSafeInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

export function isTrashMoveResponse(
  value: unknown,
): value is TrashMoveResponse {
  return (
    isRecord(value) && isDocId(value.docId) && isSafeInt(value.purgeAfterAt)
  );
}

export function isTrashRestoreResponse(
  value: unknown,
): value is TrashRestoreResponse {
  return isRecord(value) && isDocId(value.docId);
}

export function isTrashListItem(value: unknown): value is TrashListItem {
  return (
    isRecord(value) &&
    isDocId(value.docId) &&
    typeof value.workspaceId === "string" &&
    typeof value.title === "string" &&
    typeof value.deletedByUserId === "string" &&
    typeof value.deletedByName === "string" &&
    isSafeInt(value.deletedAt) &&
    isSafeInt(value.purgeAfterAt)
  );
}

export function isTrashListResponse(
  value: unknown,
): value is TrashListResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isTrashListItem)
  );
}

export function isTrashControlData(value: unknown): value is TrashControlData {
  return (
    isRecord(value) &&
    typeof value.userId === "string" &&
    isSafeInt(value.at) &&
    (value.purgeAfterAt === null || isSafeInt(value.purgeAfterAt))
  );
}
