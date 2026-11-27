// What a link into a script's history opens: the History tab on the script, with the version as it was or the changes
// since one; a version the script's history does not hold is said in place of the page.
import {
  Button,
  HISTORY_WORDS,
  LINKS_WORDS,
  Skeleton,
  useSubscribable,
} from "@manent/ui";
import { useNavigate, useParams } from "@tanstack/react-router";
import { HistoryIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";
import { baselineOfRow } from "../history/baseline.ts";
import type { HistoryRow } from "../history/history-rows.ts";
import { selectRow } from "../history/history-view.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { historyActions } from "../state/history.store.ts";
import { panelsActions } from "../state/panels.store.ts";

const WORKING = "working";
// the list reads as offline until the script's link has connected, which a link opened in a new tab waits through
const OFFLINE_WAIT_MS = 10_000;

/** What the rows say a link opens: a version in a mode, or the id of a version they do not hold. */
type Target =
  | {
      kind: "open";
      row: HistoryRow;
      mode: "as_it_was" | "page";
      said: string | null;
    }
  | { kind: "missing"; versionId: string };

type Shown = { kind: "waiting" } | { kind: "not_in_history" };

const missing = (versionId: string): Target => ({ kind: "missing", versionId });

const rowOf = (
  rows: readonly HistoryRow[],
  versionId: string,
): HistoryRow | null => rows.find((row) => row.item.id === versionId) ?? null;

/** Opens the History tab on `docId` afresh, as its commands do, with `row` as the baseline shown in `mode`. */
function openInHistory(
  docId: string,
  row: HistoryRow,
  mode: "as_it_was" | "page",
): void {
  panelsActions.open("side", "history");
  historyActions.reset(docId);
  if (mode === "as_it_was") selectRow(row);
  historyActions.setBaseline(baselineOfRow(row));
  historyActions.setMode(mode);
}

/**
 * Once the script's rows are known, opens what `target` finds in them on the script itself; a version they lack is
 * asked for once, and the script opens plainly when it exists after all, or when the list could not be read or stays
 * offline (the script's own screen then says why).
 */
function useOpenLink(
  docId: string,
  target: (rows: readonly HistoryRow[]) => Target,
): Shown {
  const { history, messages } = useServices();
  const { schedule } = useEnvironment();
  const navigate = useNavigate();
  const listed = useSubscribable(
    useMemo(() => history.rows(docId), [history, docId]),
  );
  const [shown, setShown] = useState<Shown>({ kind: "waiting" });
  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(
    () => schedule(() => setWaitedOut(true), OFFLINE_WAIT_MS),
    [schedule],
  );
  // decided once, when the rows first settle it
  const decided = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const found = target(listed.rows);
    const { kind } = listed.state;
    const waiting = kind === "loading" || (kind === "offline" && !waitedOut);
    if (decided.current || (found.kind !== "open" && waiting)) return;
    decided.current = true;
    const openHistoryPage = (): void => {
      // never awaited: a blocker may stop it, and then it never settles
      if (mounted.current)
        void navigate({ href: `/s/${docId}/history`, replace: true });
    };
    const openScript = (): void => {
      if (mounted.current)
        void navigate({ href: `/s/${docId}`, replace: true });
    };
    if (found.kind === "open") {
      openInHistory(docId, found.row, found.mode);
      if (found.said !== null)
        messages.push({
          id: "link_compared_earlier",
          text: found.said,
          actions: [
            {
              label: HISTORY_WORDS.changesSince,
              commandId: "history.changesSince",
            },
          ],
          lifetime: "brief",
          ownWork: false,
        });
      openHistoryPage();
    } else if (kind !== "ready" && kind !== "empty") openScript();
    else
      void history
        .content(docId, { versionId: found.versionId })
        // a script whose sync could not start opens for its own screen to say so
        .then((content) => {
          if (content === null) setShown({ kind: "not_in_history" });
          else openScript();
        }, openScript);
  }, [docId, history, listed, messages, navigate, target, waitedOut]);
  return shown;
}

function NotInHistory(props: { docId: string; shown: Shown }): ReactNode {
  const navigate = useNavigate();
  if (props.shown.kind === "waiting") {
    return (
      <div
        aria-busy="true"
        className="flex min-h-0 flex-1 items-center justify-center bg-chrome p-12"
      >
        <div
          aria-hidden="true"
          className="mn-card flex w-full max-w-popover flex-col gap-3 p-6"
        >
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-chrome p-6">
      <EmptyHeroCard
        icon={<HistoryIcon aria-hidden="true" className="size-5" />}
        headingAs="h1"
        headingTabIndex={-1}
        title={LINKS_WORDS.versionUnavailable}
        description={LINKS_WORDS.notInHistory}
        descriptionRole="alert"
        actions={
          <>
            <Button
              onClick={() => void navigate({ href: `/s/${props.docId}` })}
            >
              {LINKS_WORDS.openScript}
            </Button>
            <Button
              variant="outline"
              onClick={() => void navigate({ href: "/" })}
            >
              {LINKS_WORDS.backToLibrary}
            </Button>
          </>
        }
      />
    </div>
  );
}

/** `/s/$docId/v/$versionId`: that version as it was. */
export function VersionLink(): ReactNode {
  const params: { docId: string; versionId: string } = useParams({
    strict: false,
  });
  const shown = useOpenLink(params.docId, (rows) => {
    const row = rowOf(rows, params.versionId);
    return row === null
      ? missing(params.versionId)
      : { kind: "open", row, mode: "as_it_was", said: null };
  });
  return <NotInHistory docId={params.docId} shown={shown} />;
}

/**
 * `/s/$docId/changes/$a/$b`: the changes since `$a` on the page; when `$b` is neither Working nor the newest version,
 * `$b` as it was, and a message saying so when `$b` is named.
 */
export function ChangesLink(): ReactNode {
  const params: { docId: string; a: string; b: string } = useParams({
    strict: false,
  });
  const shown = useOpenLink(params.docId, (rows) => {
    const since = rowOf(rows, params.a);
    if (since === null) return missing(params.a);
    // rows are newest first
    if (params.b === WORKING || params.b === rows[0]?.item.id)
      return { kind: "open", row: since, mode: "page", said: null };
    const until = rowOf(rows, params.b);
    if (until === null) return missing(params.b);
    const { name } = until.item;
    return {
      kind: "open",
      row: until,
      mode: "as_it_was",
      // the message has words for a named version only
      said: name === null ? null : LINKS_WORDS.comparedEarlier(name),
    };
  });
  return <NotInHistory docId={params.docId} shown={shown} />;
}
