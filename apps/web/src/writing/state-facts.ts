// What the state bar says of the person's writing in the open script: who can see what they type, from the first
// keystroke, read from the switch's own position.
import { useSubscribable } from "@manent/ui";
import type { StateFact } from "@manent/ui";
import { useEffect } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { writingActions } from "../state/writing.store.ts";
import type { WritingPosition } from "../state/writing.store.ts";
import { followScript } from "./follow-script.ts";

const FACTS: Readonly<Record<WritingPosition, readonly StateFact[]>> =
  Object.freeze({
    everyone: [],
    suggestions: [{ kind: "writing_suggestions" }],
    private: [{ kind: "writing_privately" }],
  });

export function useWritingFacts(docId: string): readonly StateFact[] {
  const services = useServices();
  const { now } = useEnvironment();
  useEffect(() => followScript(services, docId, now), [services, docId, now]);
  return FACTS[useSubscribable(writingActions.writingPositionOf(docId))];
}
