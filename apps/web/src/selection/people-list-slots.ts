// What the people list draws besides its rows. Both lists are append-only: a feature adds its line at the end.
import type { ComponentType } from "react";
import { FollowAction } from "../room/follow-action.tsx";

/** Drawn at the head of the list, above the people, in list order. */
export const PEOPLE_LIST_HEAD: readonly ComponentType<{ docId: string }>[] = [];

export interface PeopleRowActionProps {
  docId: string;
  userId: string;
}

/** Each renders its own menu item, or nothing, in the submenu of the person `userId`'s row. */
export const PEOPLE_ROW_ACTIONS: readonly ComponentType<PeopleRowActionProps>[] =
  [FollowAction];
