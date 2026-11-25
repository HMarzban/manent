// Suggestions as one source of To review: its entries, which load apart from the entry, and how many there are.
import type { CrdtDoc } from "@manent/crdt";
import { isDocId } from "@manent/sync-protocol";
import { lazy, useEffect, useState } from "react";
import type { ReviewSource } from "../../screens/document/to-review.tsx";
import { useServices } from "../../services/context.tsx";
import type { Suggestion } from "./suggestion-index.ts";

// the entries read the script, which loads apart from the entry
const SuggestionList = lazy(async () => ({
  default: (await import("./suggestion-list.tsx")).SuggestionList,
}));

/** A script's document and its open suggestions. */
export interface Followed {
  docId: string;
  doc: CrdtDoc;
  suggestions: readonly Suggestion[];
}

/** A hook: the open suggestions of `docId` once its handle has opened; null until then, or when it is not a doc id. */
export function useSuggestions(docId: string): Followed | null {
  const { openHandle } = useServices();
  const [followed, setFollowed] = useState<Followed | null>(null);
  useEffect(() => {
    // off a document the history tab asks with no doc id, and no script is opened for it
    if (!isDocId(docId)) return;
    let current = true;
    let stop = (): void => {};
    Promise.all([openHandle(docId), import("./suggestion-index.ts")]).then(
      ([handle, { suggestionsOf }]) => {
        if (!current) return;
        const doc = handle.doc();
        const list = suggestionsOf(doc);
        const show = (suggestions: readonly Suggestion[]): void =>
          setFollowed({ docId, doc, suggestions });
        show(list.get());
        stop = list.subscribe(show);
      },
      () => {
        // a script this person's sync cannot open has no suggestions to list
      },
    );
    return () => {
      current = false;
      stop();
    };
  }, [docId, openHandle]);
  return followed?.docId === docId ? followed : null;
}

function useSuggestionCount(docId: string): number {
  return useSuggestions(docId)?.suggestions.length ?? 0;
}

export const SUGGESTIONS_REVIEW_SOURCE: ReviewSource = Object.freeze({
  id: "suggestions",
  List: SuggestionList,
  useCount: useSuggestionCount,
});
