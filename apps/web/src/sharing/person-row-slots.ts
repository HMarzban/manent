import type { ComponentType } from "react";

export interface PersonRowSlotProps {
  userId: string;
  place:
    { kind: "doc"; docId: string } | { kind: "project"; projectId: string };
}

export const PERSON_ROW_SLOTS: readonly ComponentType<PersonRowSlotProps>[] =
  [];
