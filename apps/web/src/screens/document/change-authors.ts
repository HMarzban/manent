// Who made each change since a History baseline, and the changes a chosen person made.
import { isChange } from "@manent/revisions";
import type { Comparison } from "@manent/revisions";
import { useEffect, useState } from "react";
import { baselineAt } from "../../history/baseline.ts";
import { useServices } from "../../services/context.tsx";
import { useHistory } from "../../state/history.store.ts";

/** By block id, the person of its last change since the baseline. */
export type Authors = Readonly<Record<string, string>>;

/** Of each change of `all`, who made it last since the baseline; null until the server has said, or when it cannot. */
export function useAuthors(
  docId: string,
  all: Comparison | null,
): Authors | null {
  const { history } = useServices();
  const baseline = useHistory("baseline");
  const [told, setTold] = useState<{
    all: Comparison;
    authors: Authors;
  } | null>(null);
  useEffect(() => {
    const since = baselineAt(baseline);
    if (all === null || since === null) return undefined;
    const changed = all.entries.filter(isChange).map((entry) => entry.id);
    let shown = true;
    void history.authors(docId, since, changed).then((answer) => {
      if (shown && answer !== null) setTold({ all, authors: answer.authors });
    });
    return () => {
      shown = false;
    };
  }, [history, docId, baseline, all]);
  return told?.all === all ? told.authors : null;
}

/** The changes of `all` made last by one of `people`; null narrows nothing, as while who made them is not known. */
export function authoredBlocks(
  all: Comparison | null,
  authors: Authors | null,
  people: readonly string[] | null,
): readonly string[] | null {
  if (all === null || authors === null || people === null) return null;
  return all.entries
    .filter((entry) => {
      const by = authors[entry.id];
      return by !== undefined && people.includes(by);
    })
    .map((entry) => entry.id);
}

/** The people of `authors`, each once, in the order of their first change in `all`. */
export const peopleOf = (all: Comparison, authors: Authors): string[] => [
  ...new Set(
    all.entries.flatMap((entry) => {
      const by = authors[entry.id];
      return by === undefined ? [] : [by];
    }),
  ),
];
