import type { ComponentType } from "react";
import { CanAlsoTicks } from "../permissions/can-also-ticks.tsx";

export interface PersonRowSlotProps {
  userId: string;
  place:
    { kind: "doc"; docId: string } | { kind: "project"; projectId: string };
}

export const PERSON_ROW_SLOTS: readonly ComponentType<PersonRowSlotProps>[] = [
  CanAlsoTicks,
];
