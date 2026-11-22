// What the state bar says of history: the version viewed, the changes shown, or the changes others made since you last opened.
import type { SinceResponse } from "@manent/sync-protocol";
import type { StateFact } from "@manent/ui";
import { useEffect, useState } from "react";
import { useServices } from "../services/context.tsx";
import { nameOf as personName } from "../services/sync/index-entries.ts";
import { useHistory } from "../state/history.store.ts";
import type { HistoryState } from "../state/history.store.ts";

/**
 * A version baseline with no date is one titled by its time, so its title is the date said. The place where the
 * person last opened the script is no version: it is said only as the baseline of changes shown.
 */
export function historyFacts(
  state: HistoryState,
  sinceOpened: SinceResponse | null,
  nameOf: (userId: string) => string,
): StateFact[] {
  const { baseline } = state;
  if (baseline !== null && state.mode !== "as_it_was")
    return [
      { kind: "showing_changes", name: baseline.title, date: baseline.date },
    ];
  if (baseline !== null)
    return baseline.position === null
      ? [
          {
            kind: "viewing_version",
            name: baseline.date === null ? null : baseline.title,
            date: baseline.date ?? baseline.title,
          },
        ]
      : [];
  if (sinceOpened === null || sinceOpened.changes === 0) return [];
  return [
    {
      kind: "changes_since_opened",
      count: sinceOpened.changes,
      names: sinceOpened.authorUserIds.map(nameOf),
    },
  ];
}

function useHistoryState(): HistoryState {
  return {
    docId: useHistory("docId"),
    selected: useHistory("selected"),
    baseline: useHistory("baseline"),
    mode: useHistory("mode"),
    filter: useHistory("filter"),
    step: useHistory("step"),
    draftsOnly: useHistory("draftsOnly"),
    naming: useHistory("naming"),
  };
}

/** The state bar's history facts for the open script, whose versions stay listed while it is shown. */
export function useHistoryFacts(docId: string): readonly StateFact[] {
  const { history } = useServices();
  const state = useHistoryState();
  const [since, setSince] = useState<SinceResponse | null>(null);
  useEffect(() => history.rows(docId).subscribe(() => {}), [history, docId]);
  useEffect(() => {
    let shown = true;
    setSince(null);
    void history.sinceOpened(docId).then((answer) => {
      if (shown) setSince(answer);
    });
    return () => {
      shown = false;
    };
  }, [history, docId]);
  // a baseline chosen in another script says nothing of this one
  const own = state.docId === docId ? state : { ...state, baseline: null };
  return historyFacts(own, since, personName);
}
