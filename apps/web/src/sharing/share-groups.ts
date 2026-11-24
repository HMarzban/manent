// The groups Share names and offers: those every project starts with, named by their id.
import { SHARING_WORDS } from "@manent/ui";

/** The groups that start with a role, so a share to them gives one; the others are only ever sent drafts. */
export const ADDABLE_GROUP_IDS: readonly string[] = Object.freeze([
  "room",
  "producers",
]);

/** The group's name; its id for a group that is not one every project starts with. */
export function groupName(groupId: string): string {
  return (
    Object.entries(SHARING_WORDS.presetGroups).find(
      ([id]) => id === groupId,
    )?.[1] ?? groupId
  );
}
