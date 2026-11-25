// Sync push-rule hooks validating project index owner-only map authority and `can_also` entries.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  jsonMap,
  loadDoc,
  readGroups,
} from "@manent/crdt";
import type { CrdtDoc, TransactionReport } from "@manent/crdt";
import type { Issue } from "@manent/schema";
import type { DocFile } from "@manent/storage";
import { indexDocId } from "@manent/sync-protocol";
import type { SyncHooks } from "../sync/ports.ts";
import type { Room, Subscription } from "../sync/rooms.ts";
import {
  isCapability,
  isPlainObject,
  isSortedUniqueStringArray,
  parseCanAlsoEntry,
  readCanAlso,
} from "./can-also.ts";

/** Project index maps restricted to the project owner or holders of `issue_revisions`. */
const OWNER_ONLY_PROJECT_MAPS: readonly string[] = Object.freeze([
  "can_also",
  "groups",
  "template",
  "style",
  "ladder",
]);

const notIndex = (path: string, message: string): Issue => ({
  path,
  code: "not_index",
  severity: "reject",
  message,
});

/** True when `room` is a project's index document. */
export function isProjectIndex(
  room: Pick<Room, "docId" | "home" | "kind">,
): boolean {
  return (
    room.kind === "index" &&
    room.home.kind === "project" &&
    room.docId === indexDocId("project", room.home.id)
  );
}

/** Loads the committed pre-push CRDT state of `docId` directly from `file`; caller destroys it. */
function loadCommittedFromFile(file: DocFile, docId: string): CrdtDoc | null {
  const row = file.log.get(docId);
  if (row === null) return null;
  const checkpoint = file.checkpoints.newest(docId, row.generation);
  const doc = checkpoint === null ? createDoc() : loadDoc(checkpoint.state);
  const tail = file.log.tail(docId, row.generation, checkpoint?.seq ?? 0, {
    quarantine: false,
  });
  for (const { update } of tail.rows) doc.applyUpdate(update, ORIGIN_LOAD);
  discardPending(doc);
  return doc;
}

/**
 * Verifies non-owner authority against both subscription access and the authoritative committed
 * pre-push project index in `room.file` (defeating stale-subscription self-reinstatement via
 * `groups` or Yjs tombstone re-insertion).
 */
function mayWriteOwnerProjectMaps(
  room: Room,
  report: TransactionReport,
  pusher: Subscription | undefined,
): boolean {
  if (pusher === undefined) return false;
  if (pusher.access.role === "owner") return true;
  if (!pusher.access.capabilities.includes("issue_revisions")) return false;
  const committed = loadCommittedFromFile(room.file, room.docId);
  if (committed === null) return false;
  try {
    const userId = pusher.peer.userId;
    const committedCanAlso = readCanAlso(committed);
    const committedGroups = readGroups(committed);
    const holdsIssueRevisions = (entry: {
      readonly userIds: readonly string[];
      readonly groupIds: readonly string[];
    }): boolean =>
      entry.userIds.includes(userId) ||
      entry.groupIds.some(
        (gid) =>
          committedGroups.get(gid)?.memberUserIds.includes(userId) ?? false,
      );

    const committedEntry = committedCanAlso.get("issue_revisions");
    if (committedEntry !== undefined && !holdsIssueRevisions(committedEntry))
      return false;

    // Also guard against a same-tick queued revocation that modified `room.doc` before committing to `room.file`.
    const beforeRaw = report.before("can_also", "issue_revisions");
    if (beforeRaw !== undefined) {
      const beforeEntry = parseCanAlsoEntry(beforeRaw);
      if (beforeEntry === null || !holdsIssueRevisions(beforeEntry))
        return false;
    }
    return true;
  } finally {
    committed.destroy();
  }
}

/** Validates owner-only project index writes (including stale-subscription checks) and `can_also` entry shapes. */
export function checkCanAlsoPush(
  room?: Room,
  report?: TransactionReport,
  pusher?: Subscription,
): Issue[] {
  if (
    room === undefined ||
    report === undefined ||
    room.doc === null ||
    !isProjectIndex(room)
  )
    return [];

  const touchedOwnerMaps = report.maps.filter((name) =>
    OWNER_ONLY_PROJECT_MAPS.includes(name),
  );
  if (touchedOwnerMaps.length === 0) return [];

  if (!mayWriteOwnerProjectMaps(room, report, pusher)) {
    return touchedOwnerMaps.map((name) =>
      notIndex(
        `maps.${name}`,
        `only a project owner or a person who may issue revisions may write ${name}`,
      ),
    );
  }

  if (!report.maps.includes("can_also")) return [];

  const issues: Issue[] = [];
  const groups = readGroups(room.doc);
  for (const [key, raw] of Object.entries(
    jsonMap(room.doc, "can_also").entries(),
  )) {
    const path = `maps.can_also.${key}`;
    if (!isCapability(key)) {
      issues.push(
        notIndex(path, `unknown capability key "${key}" in can_also`),
      );
      continue;
    }
    if (!isPlainObject(raw)) {
      issues.push(
        notIndex(
          path,
          "a can_also entry must be an object with userIds and groupIds",
        ),
      );
      continue;
    }
    const keys = Object.keys(raw);
    if (
      keys.length !== 2 ||
      !Object.hasOwn(raw, "userIds") ||
      !Object.hasOwn(raw, "groupIds")
    ) {
      issues.push(
        notIndex(path, "a can_also entry must hold only userIds and groupIds"),
      );
      continue;
    }
    if (!isSortedUniqueStringArray(raw.userIds))
      issues.push(
        notIndex(
          `${path}.userIds`,
          "can_also userIds must be sorted unique non-empty strings",
        ),
      );
    if (!isSortedUniqueStringArray(raw.groupIds)) {
      issues.push(
        notIndex(
          `${path}.groupIds`,
          "can_also groupIds must be sorted unique non-empty strings",
        ),
      );
      continue;
    }
    for (const groupId of raw.groupIds) {
      if (!groups.has(groupId))
        issues.push(
          notIndex(
            `${path}.groupIds`,
            `can_also references unknown group "${groupId}"`,
          ),
        );
    }
  }
  return issues;
}

/** Sync hooks enforcing project owner-only map authority and `can_also` entry validation. */
export function createCanAlsoHooks(): SyncHooks {
  return {
    checkPush(room, report, pusher) {
      return checkCanAlsoPush(room, report, pusher);
    },
  };
}
