// Project "can_also" capability table reader and capability override.
import {
  ORIGIN_LOAD,
  createDoc,
  discardPending,
  jsonMap,
  loadDoc,
} from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Home, Storage } from "@manent/storage";
import { CAPABILITIES } from "@manent/sync-protocol";
import type { Capability } from "@manent/sync-protocol";
import { projectIndexOf, readProjectGroups } from "../sharing/groups.ts";
import type { CapabilityGrant, CapabilityOverride } from "./capabilities.ts";

/** Who holds a single capability in a project's `can_also` map: sorted, unique user and group ids. */
export interface CanAlsoEntry {
  readonly userIds: readonly string[];
  readonly groupIds: readonly string[];
}

export const isCapability = (value: string): value is Capability =>
  CAPABILITIES.some((capability) => capability === value);

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when `value` is an array of non-empty strings sorted strictly ascending (no duplicates). */
export function isSortedUniqueStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  let prev: string | null = null;
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) return false;
    if (prev !== null && !(prev < item)) return false;
    prev = item;
  }
  return true;
}

/** Parses a `can_also` entry from a CRDT map value; returns null if malformed. */
export function parseCanAlsoEntry(raw: unknown): CanAlsoEntry | null {
  if (!isPlainObject(raw)) return null;
  if (
    !isSortedUniqueStringArray(raw.userIds) ||
    !isSortedUniqueStringArray(raw.groupIds)
  )
    return null;
  return { userIds: [...raw.userIds], groupIds: [...raw.groupIds] };
}

/** Reads every well-formed `can_also` entry from a project index CRDT document. */
export function readCanAlso(
  doc: CrdtDoc,
): ReadonlyMap<Capability, CanAlsoEntry> {
  const table = new Map<Capability, CanAlsoEntry>();
  for (const [key, raw] of Object.entries(jsonMap(doc, "can_also").entries())) {
    if (!isCapability(key)) continue;
    const entry = parseCanAlsoEntry(raw);
    if (entry !== null) table.set(key, entry);
  }
  return table;
}

/** Loads the committed CRDT state of a placed document without its room; caller destroys it. */
function committedDoc(
  storage: Storage,
  home: Home,
  docId: string,
): CrdtDoc | null {
  const file = storage.open(home);
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
 * Reads the committed `can_also` table of the project that `docId` belongs to.
 * Returns an empty map for documents outside a project, workspace indexes, comments sidecars,
 * or projects whose index is missing or tombstoned.
 */
export function readProjectCanAlso(
  storage: Storage,
  docId: string,
): ReadonlyMap<Capability, CanAlsoEntry> {
  const place = storage.directory.placeOf(docId);
  if (place === null || place.home.kind !== "project") return new Map();
  if (place.kind === "comments") return new Map();
  if (place.kind === "index" && place.home.id === docId) return new Map();
  const indexId = projectIndexOf(place.home);
  if (indexId === null || storage.directory.tombstoneOf(indexId) !== null)
    return new Map();
  const doc = committedDoc(storage, place.home, indexId);
  if (doc === null) return new Map();
  try {
    return readCanAlso(doc);
  } finally {
    doc.destroy();
  }
}

/**
 * Resolves project `can_also` permissions:
 * - Document owners (`stored.role === "owner"`) always retain their capabilities.
 * - For non-owners in a project, any capability present in the project's `can_also` table is
 *   decided solely by `can_also` (replacing `doc_roles.capabilities` for that capability).
 * - Capabilities absent from `can_also` keep what `current` granted.
 */
export const canAlsoOverride: CapabilityOverride = (
  grant: CapabilityGrant,
  current: readonly Capability[],
): readonly Capability[] => {
  const { storage, userId, docId, stored } = grant;
  if (stored.role === "owner") return current;
  const table = readProjectCanAlso(storage, docId);
  if (table.size === 0) return current;

  let needsGroups = false;
  for (const entry of table.values()) {
    if (entry.groupIds.length > 0) {
      needsGroups = true;
      break;
    }
  }
  const groups = needsGroups ? readProjectGroups(storage, docId) : null;

  const grantsUser = (entry: CanAlsoEntry): boolean => {
    if (entry.userIds.includes(userId)) return true;
    if (groups === null) return false;
    for (const groupId of entry.groupIds) {
      const group = groups.get(groupId);
      if (group !== undefined && group.memberUserIds.includes(userId))
        return true;
    }
    return false;
  };

  const next: Capability[] = current.filter((cap) => !table.has(cap));
  for (const [cap, entry] of table) {
    if (grantsUser(entry)) next.push(cap);
  }
  return next;
};
