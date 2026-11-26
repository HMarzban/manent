// Shared History baseline menu, draft-naming hook, and safe ConsequenceDialog for rundown full/row restore.
import type { RestoreScopeBody, SinceResponse } from "@manent/sync-protocol";
import {
  Button,
  CommandButton,
  ConsequenceDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HISTORY_WORDS,
  RUNDOWN_HISTORY_WORDS,
  createValue,
  formatPosition,
  historyMessage,
  useSubscribable,
} from "@manent/ui";
import { ChevronDownIcon, TriangleExclamationPointIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  baselineOfRow,
  defaultBaseline,
  sinceOpenedBaseline,
} from "../../history/baseline.ts";
import type { HistoryRow } from "../../history/history-rows.ts";
import { readLastOpened } from "../../history/last-opened.ts";
import { useRundownView } from "../../rundown/rundown-session.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { historyActions, useHistory } from "../../state/history.store.ts";
import type { HistoryState } from "../../state/history.store.ts";

const CHEVRON = (
  <ChevronDownIcon
    aria-hidden="true"
    className="size-icon shrink-0 text-fg-muted"
  />
);

export interface PendingDraftName {
  name: string;
  fromVersionId: string | null;
  failed: boolean;
}

export interface DraftNaming {
  pending: PendingDraftName | null;
  target: string | null;
  nameVersion(versionId: string): void;
  name(draft: string, fromVersionId: string | null): void;
  working: RefObject<HTMLElement | null>;
}

export function useDraftNaming(docId: string): DraftNaming {
  const { history } = useServices();
  const naming = useHistory("naming");
  const [pending, setPending] = useState<PendingDraftName | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const working = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!naming) setTarget(null);
  }, [naming]);
  return {
    pending,
    target,
    working,
    nameVersion(versionId) {
      setTarget(versionId);
      historyActions.setNaming(true);
    },
    name(draft, fromVersionId) {
      historyActions.setNaming(false);
      setPending({ name: draft, fromVersionId, failed: false });
      working.current?.focus();
      void history.name(docId, draft, fromVersionId).then((named) => {
        setPending(
          named.ok ? null : { name: draft, fromVersionId, failed: true },
        );
      });
    },
  };
}

/** The baseline Changes since offers until one is chosen: since you last opened when others edited, else newest draft. */
export function useOfferedBaseline(
  docId: string,
  rows: readonly HistoryRow[],
): HistoryState["baseline"] {
  const { history, userId } = useServices();
  const baseline = useHistory("baseline");
  const [since, setSince] = useState<SinceResponse | null>(null);
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
  return (
    baseline ?? defaultBaseline(rows, since, readLastOpened(userId, docId))
  );
}

const chooseBaseline = (baseline: HistoryState["baseline"]) => (): void =>
  historyActions.setBaseline(baseline);

/** `Changes since ▾` menu shared by script and rundown History tabs. */
export function BaselineMenu(props: {
  readonly docId: string;
  readonly rows: readonly HistoryRow[];
  readonly offered: HistoryState["baseline"];
}): ReactNode {
  const { userId } = useServices();
  const lastOpened = readLastOpened(userId, props.docId);
  const sinceOpened =
    lastOpened === null ? null : sinceOpenedBaseline(lastOpened);
  return (
    <div className="flex items-center gap-2 text-ui">
      <span className="shrink-0">{HISTORY_WORDS.changesSince}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          data-changes-since=""
          data-tour="history.changesSince"
          render={
            <Button
              variant="outline"
              size="sm"
              className="min-w-0 flex-1 justify-between"
            />
          }
        >
          {props.offered === null ? (
            <span className="truncate text-fg-muted">
              {HISTORY_WORDS.chooseBaseline}
            </span>
          ) : (
            <span className="truncate" title={props.offered.title}>
              {props.offered.title}
            </span>
          )}
          {CHEVRON}
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80 overflow-auto">
          {sinceOpened === null ? null : (
            <>
              <DropdownMenuItem onClick={chooseBaseline(sinceOpened)}>
                {sinceOpened.title}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {props.rows.map((row) => (
            <DropdownMenuItem
              key={row.item.id}
              onClick={chooseBaseline(baselineOfRow(row))}
            >
              {row.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {props.offered?.versionId != null ? (
        <CommandButton id="history.copyLink" variant="outline" size="sm" />
      ) : null}
    </div>
  );
}

/** Pending restore confirmation for a rundown version (full rundown or single row). */
export type RundownRestoreTarget =
  | {
      readonly kind: "all";
      readonly docId: string;
      readonly versionId: string;
      readonly ref: string;
    }
  | {
      readonly kind: "row";
      readonly docId: string;
      readonly versionId: string;
      readonly ref: string;
      readonly rowId: string;
      /** 1-based display row number for item/script rows; null for header rows. */
      readonly rowNum: number | null;
      /** Header title when `rowNum` is null. */
      readonly rowTitle: string;
    };

const restoreTarget = createValue<RundownRestoreTarget | null>(null);

/** Opens the rundown restore `ConsequenceDialog` for a full rundown or single row. */
export function openRundownRestore(target: RundownRestoreTarget | null): void {
  restoreTarget.set(target);
}

function dialogCopyOf(target: RundownRestoreTarget): {
  readonly title: string;
  readonly action: string;
  readonly body: string;
  readonly scope: RestoreScopeBody;
} {
  if (target.kind === "all") {
    return {
      title: RUNDOWN_HISTORY_WORDS.restoreTitle(target.ref),
      action: RUNDOWN_HISTORY_WORDS.restoreButton(target.ref),
      body: RUNDOWN_HISTORY_WORDS.restoreBody,
      scope: { kind: "script" },
    };
  }
  if (target.rowNum !== null) {
    return {
      title: RUNDOWN_HISTORY_WORDS.restoreRowTitle(target.rowNum, target.ref),
      action: RUNDOWN_HISTORY_WORDS.restoreRowButton(target.rowNum),
      body: RUNDOWN_HISTORY_WORDS.restoreRowBody(target.rowNum),
      scope: { kind: "row", rowId: target.rowId },
    };
  }
  return {
    title: RUNDOWN_HISTORY_WORDS.restoreHeaderTitle(
      target.rowTitle,
      target.ref,
    ),
    action: RUNDOWN_HISTORY_WORDS.restoreHeaderButton(target.rowTitle),
    body: RUNDOWN_HISTORY_WORDS.restoreHeaderBody(target.rowTitle),
    scope: { kind: "row", rowId: target.rowId },
  };
}

/** Safe `ConsequenceDialog` for rundown full and row restores, including the air-window notice when live. */
export function RundownRestoreDialog(props: {
  readonly docId: string;
}): ReactNode {
  const target = useSubscribable(restoreTarget);
  const { history, messages } = useServices();
  const { now } = useEnvironment();
  const view = useRundownView(props.docId);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRefusal(null);
    setBusy(false);
  }, [target]);

  if (target === null || target.docId !== props.docId) return null;
  const copy = dialogCopyOf(target);
  const airWindow = view?.clock?.airWindow ?? null;
  const currentMs = now();
  const inAirWindow =
    airWindow !== null &&
    currentMs >= airWindow.startsAt &&
    currentMs <= airWindow.endsAt;

  const runRestore = (): void => {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    void history
      .restore(target.docId, target.versionId, copy.scope)
      .then((result) => {
        setBusy(false);
        if (result.ok) {
          restoreTarget.set(null);
          messages.push(
            historyMessage(
              { kind: "restored_you", ref: target.ref },
              "history.restored_you",
            ),
          );
          return;
        }
        setRefusal(HISTORY_WORDS.refused(target.ref));
      })
      .catch(() => {
        setBusy(false);
        setRefusal(HISTORY_WORDS.refused(target.ref));
      });
  };

  return (
    <ConsequenceDialog
      open
      title={copy.title}
      body={copy.body}
      action={copy.action}
      busyLabel={busy ? copy.action : null}
      refusal={refusal}
      destructive={false}
      onAction={runRestore}
      onCancel={() => restoreTarget.set(null)}
    >
      {inAirWindow ? (
        <p className="flex items-start gap-2 text-ui">
          <TriangleExclamationPointIcon
            aria-hidden="true"
            className="mt-0.5 size-icon shrink-0 text-attention"
          />
          <span>{RUNDOWN_HISTORY_WORDS.inAirWindow}</span>
        </p>
      ) : null}
    </ConsequenceDialog>
  );
}

/** Previous/Next change stepper shared by script History changes. */
export function HistoryChangeStepper(props: { count: number }): ReactNode {
  const { commands } = useServices();
  const step = useHistory("step") ?? 0;
  return (
    <div className="flex items-center gap-1 text-ui">
      <Button
        variant="outline"
        size="sm"
        onClick={() => commands.run("history.previousChange", "control")}
      >
        {HISTORY_WORDS.previousChange}
      </Button>
      <span aria-label={HISTORY_WORDS.stepName(step, props.count)}>
        {formatPosition(step, props.count)}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => commands.run("history.nextChange", "control")}
      >
        {HISTORY_WORDS.nextChange}
      </Button>
    </div>
  );
}
