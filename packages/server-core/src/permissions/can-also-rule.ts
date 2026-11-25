// Sync push-rule hooks validating project index `can_also` writes and authority.
import { createDoc, jsonMap, readGroups } from "@manent/crdt";
import type { CrdtDoc, GroupEntry, TransactionReport } from "@manent/crdt";
import type { Issue } from "@manent/schema";
import { indexDocId } from "@manent/sync-protocol";
import type { SyncHooks } from "../sync/ports.ts";
import type { Room, Subscription } from "../sync/rooms.ts";
import {
  isCapability,
  isPlainObject,
  isSortedUniqueStringArray,
  parseCanAlsoEntry,
} from "./can-also.ts";

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
    return new Set();
  } finally {
    probe.destroy();
  }
}

/** Reconstructs the pre-push `groups` map so authority checks cannot be bypassed by adding oneself to a group in the same push. */
function prePushGroups(
  doc: CrdtDoc,
  report: TransactionReport,
): Map<string, GroupEntry> {
  const current = readGroups(doc);
  if (!report.maps.includes("groups")) return current;
  const inserted = newlyWrittenKeys(report, "groups");
  const out = new Map<string, GroupEntry>();
  for (const [id, group] of current) {
    const prev = report.before("groups", id);
    if (prev !== undefined) {
      if (
        isPlainObject(prev) &&
        typeof prev.name === "string" &&
        Array.isArray(prev.memberUserIds)
      )
        out.set(id, {
          ...group,
          memberUserIds: prev.memberUserIds.filter(
            (m): m is string => typeof m === "string",
          ),
        });
      continue;
    }
    if (!inserted.has(id)) out.set(id, group);
  }
  return out;
}

/** Verifies pusher authority against both subscription access and the pre-push `can_also.issue_revisions` entry. */
function mayWriteCanAlso(
  doc: CrdtDoc,
  report: TransactionReport,
  pusher: Subscription | undefined,
): boolean {
  if (pusher === undefined) return false;
  if (pusher.access.role === "owner") return true;
  if (!pusher.access.capabilities.includes("issue_revisions")) return false;
  // Defence against stale subscriptions: if `can_also.issue_revisions` already existed before this push
  // and did not include this pusher, their `issue_revisions` capability was already revoked.
  const prevRaw = report.before("can_also", "issue_revisions");
  let existingRaw: unknown = prevRaw;
  if (existingRaw === undefined) {
    const inserted = newlyWrittenKeys(report, "can_also");
    if (!inserted.has("issue_revisions"))
      existingRaw =
        jsonMap(doc, "can_also").get("issue_revisions") ?? undefined;
  }
  if (existingRaw === undefined) return true;
  const existing = parseCanAlsoEntry(existingRaw);
  if (existing === null) return false;
  const userId = pusher.peer.userId;
  if (existing.userIds.includes(userId)) return true;
  const groups = prePushGroups(doc, report);
  return existing.groupIds.some(
    (gid) => groups.get(gid)?.memberUserIds.includes(userId) ?? false,
  );
}

/** Validates a client push that writes a project index's `can_also` map. */
export function checkCanAlsoPush(
  room?: Room,
  report?: TransactionReport,
  pusher?: Subscription,
): Issue[] {
  if (
    room === undefined ||
    report === undefined ||
    room.doc === null ||
    !isProjectIndex(room) ||
    !report.maps.includes("can_also")
  )
    return [];

  if (!mayWriteCanAlso(room.doc, report, pusher)) {
    return [
      notIndex(
        "maps.can_also",
        "only a project owner or a person who may issue revisions may write can_also",
      ),
    ];
  }

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

/** Sync hooks enforcing project `can_also` write authority and entry validation. */
export function createCanAlsoHooks(): SyncHooks {
  return {
    checkPush(room, report, pusher) {
      return checkCanAlsoPush(room, report, pusher);
    },
  };
}
