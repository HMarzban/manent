// The state bar's "Following Dana · Stop" while this person follows someone in this document.
import { useSubscribable } from "@manent/ui";
import type { StateFact } from "@manent/ui";
import { useMemo } from "react";
import { followed } from "./follow-state.ts";

const NO_FACTS: readonly StateFact[] = Object.freeze([]);

export function useFollowFacts(docId: string): readonly StateFact[] {
  const who = useSubscribable(followed);
  return useMemo(
    () =>
      who === null || who.docId !== docId
        ? NO_FACTS
        : [{ kind: "following", name: who.name }],
    [who, docId],
  );
}
