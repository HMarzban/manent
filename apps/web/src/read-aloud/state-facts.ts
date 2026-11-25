// State bar fact source for Read aloud ("Reading aloud · Stop") and cleanup when leaving the document.
import type { StateFact } from "@manent/ui";
import { useEffect } from "react";
import {
  readAloudActions,
  useReadAloudDocId,
} from "../state/read-aloud.store.ts";
import { stopReadAloud } from "./runner.ts";

const READING_FACT: readonly StateFact[] = Object.freeze([
  Object.freeze({ kind: "reading_aloud" }),
]);
const EMPTY: readonly StateFact[] = Object.freeze([]);

/** Returns the `reading_aloud` state fact while `docId` is being read aloud, and stops playback on leave. */
export function useReadAloudFacts(docId: string): readonly StateFact[] {
  const activeDocId = useReadAloudDocId();
  useEffect(() => {
    return () => {
      if (readAloudActions.docId() === docId) stopReadAloud();
    };
  }, [docId]);
  return activeDocId === docId ? READING_FACT : EMPTY;
}
