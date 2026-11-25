// Pure model & CRDT read/write helpers for a project's `can_also` capability map.
import { readProjectMap, writeProjectKey } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import type { Capability } from "@manent/sync-protocol";
import { WORKSPACE_WORDS } from "@manent/ui";

export type CanAlsoTickId =
  "send_to_prompter" | "edit_rundowns" | "issue_and_lock" | "delete";

export interface CanAlsoTickDef {
  readonly id: CanAlsoTickId;
  readonly capabilities: readonly Capability[];
  readonly label: string;
  readonly grantPhrase: string;
  readonly revokePhrase: string;
}

/** The four ticks in `CAPABILITIES` order (`S4-WS-21`, `S4-WS-24`, `S4-WS-25`). */
export const CAN_ALSO_TICKS: readonly CanAlsoTickDef[] = Object.freeze([
  {
    id: "send_to_prompter",
    capabilities: ["send_to_prompter"],
    label: WORKSPACE_WORDS.canAlsoSendToPrompter,
    grantPhrase: WORKSPACE_WORDS.canAlsoPhraseSendToPrompter,
    revokePhrase: WORKSPACE_WORDS.canAlsoPhraseSendToPrompter,
  },
  {
    id: "edit_rundowns",
    capabilities: ["edit_rundowns"],
    label: WORKSPACE_WORDS.canAlsoEditRundowns,
    grantPhrase: WORKSPACE_WORDS.canAlsoPhraseEditRundowns,
    revokePhrase: WORKSPACE_WORDS.canAlsoPhraseEditRundowns,
  },
  {
    id: "issue_and_lock",
    capabilities: ["issue_revisions", "lock_page_numbers"],
    label: WORKSPACE_WORDS.canAlsoIssueAndLock,
    grantPhrase: WORKSPACE_WORDS.canAlsoPhraseIssueAndLockGrant,
    revokePhrase: WORKSPACE_WORDS.canAlsoPhraseIssueAndLockRevoke,
  },
  {
    id: "delete",
    capabilities: ["delete"],
    label: WORKSPACE_WORDS.canAlsoDelete,
    grantPhrase: WORKSPACE_WORDS.canAlsoPhraseDelete,
    revokePhrase: WORKSPACE_WORDS.canAlsoPhraseDelete,
  },
]);

export interface PreviousKey {
  readonly key: Capability;
  readonly value: unknown;
}

const field = (body: unknown, name: string): unknown =>
  typeof body === "object" && body !== null ? Reflect.get(body, name) : null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Strict ascending JS code-unit sort with deduplication, matching server `isSortedUniqueStringArray`. */
function sortUnique(values: readonly string[]): string[] {
  const unique = new Set(values.filter((v) => v.length > 0));
  return [...unique].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function parseEntry(raw: unknown): { userIds: string[]; groupIds: string[] } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { userIds: [], groupIds: [] };
  }
  const userIds = field(raw, "userIds");
  const groupIds = field(raw, "groupIds");
  return {
    userIds: isStringArray(userIds) ? sortUnique(userIds) : [],
    groupIds: isStringArray(groupIds) ? sortUnique(groupIds) : [],
  };
}

/** Whether `userId` currently holds `tick` in `entries`. */
export function isTickChecked(
  entries: Readonly<Record<string, unknown>>,
  userId: string,
  tick: CanAlsoTickDef,
): boolean {
  return tick.capabilities.some((cap) =>
    parseEntry(entries[cap]).userIds.includes(userId),
  );
}

/** Short first name for messages ("Priya Nair" -> "Priya"). */
export function shortNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  const space = trimmed.indexOf(" ");
  return space > 0 ? trimmed.slice(0, space) : trimmed;
}

/** Applies a tick toggle to `can_also`, returning the prior raw entries for Undo. */
export function writeTick(
  doc: CrdtDoc,
  capabilities: readonly Capability[],
  userId: string,
  grant: boolean,
): PreviousKey[] {
  const current = readProjectMap(doc, "can_also");
  // When revoking issue_revisions + lock_page_numbers, clear lock_page_numbers first so authority holds across both writes.
  const ordered = grant ? capabilities : [...capabilities].toReversed();
  const previous: PreviousKey[] = [];
  for (const cap of ordered) {
    const raw = Object.hasOwn(current, cap) ? current[cap] : null;
    previous.push({ key: cap, value: raw });
    const parsed = parseEntry(raw);
    const nextUsers = grant
      ? sortUnique([...parsed.userIds, userId])
      : parsed.userIds.filter((id) => id !== userId);
    writeProjectKey(doc, "can_also", cap, {
      userIds: nextUsers,
      groupIds: parsed.groupIds,
    });
  }
  return previous;
}

/** Restores prior raw `can_also` entries captured by `writeTick`. */
export function restoreTick(
  doc: CrdtDoc,
  previous: readonly PreviousKey[],
): void {
  for (const { key, value } of [...previous].toReversed()) {
    writeProjectKey(doc, "can_also", key, value ?? null);
  }
}
