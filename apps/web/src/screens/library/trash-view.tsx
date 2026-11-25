// Library Trash view and the shared Move to Trash consequence dialog.
import type { TrashListItem } from "@manent/sync-protocol";
import {
  Button,
  ConsequenceDialog,
  DropdownMenuItem,
  LIBRARY_FILES_WORDS,
  LIBRARY_WORDS,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  dayNumber,
  formatDate,
  formatDayTime,
  joinNames,
  useCommandState,
  useSubscribable,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  executeMoveToTrash,
  requestMoveToTrash,
  restoreTrashedDocument,
} from "../../handlers/library-files.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { readPerson, tabStorage } from "../../session.ts";
import {
  trashActions,
  useTrashConfirm,
  useTrashRevision,
} from "../../state/trash.store.ts";
import { LibraryViewSection } from "./view-section.tsx";
import type { LibraryViewProps } from "./views.ts";

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const SKELETON_ROWS = ["w-48", "w-36", "w-56"] as const;

const firstNameOf = (name: string): string => name.split(" ")[0] ?? name;

function formatMovedWhen(at: number, now: number): string {
  const daysAgo = dayNumber(now) - dayNumber(at);
  return daysAgo >= 0 && daysAgo < WEEK_DAYS
    ? formatDayTime(at, now)
    : formatDate(at);
}

function formatDaysLeft(purgeAfterAt: number, now: number): string {
  const remainingMs = purgeAfterAt - now;
  const underOneDay = remainingMs < DAY_MS;
  const days = Math.max(1, Math.ceil(remainingMs / DAY_MS));
  return LIBRARY_FILES_WORDS.daysLeft(days, underOneDay);
}

function TrashSkeleton(): ReactNode {
  return (
    <div aria-busy="true" className="mn-table flex flex-col">
      <div aria-hidden="true" className="flex flex-col">
        {SKELETON_ROWS.map((width, index) => (
          <div
            key={index}
            className="flex min-h-row items-center gap-3 border-t border-line px-3 py-2 first:border-t-0"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Skeleton className={`h-3.5 max-w-full ${width}`} />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-3 w-20 shrink-0" />
            <Skeleton className="h-control-sm w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TrashRow(props: {
  readonly item: TrashListItem;
  readonly now: number;
  readonly restoring: boolean;
  readonly refusal: string | null;
  readonly onRestore: (item: TrashListItem) => void;
}): ReactNode {
  const { item, now, restoring, refusal, onRestore } = props;
  const movedBy = LIBRARY_FILES_WORDS.movedBy(
    firstNameOf(item.deletedByName),
    formatMovedWhen(item.deletedAt, now),
  );
  const remaining = formatDaysLeft(item.purgeAfterAt, now);

  return (
    <li className="border-t border-line first:border-t-0">
      {refusal === null ? null : (
        <p
          role="alert"
          className="flex items-start gap-2 bg-subtle px-3 py-2 text-ui text-fg"
        >
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-icon shrink-0 text-attention"
          />
          <span>{refusal}</span>
        </p>
      )}
      <div className="flex min-h-row items-center gap-4 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-ui font-medium text-fg">
            {item.title}
          </span>
          <span className="truncate text-meta text-fg-muted">{movedBy}</span>
        </div>
        <span className="shrink-0 text-meta text-fg-muted tabular-nums">
          {remaining}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={restoring}
          data-tour="library.restore"
          className="shrink-0 cursor-pointer"
          onClick={() => onRestore(item)}
        >
          {LIBRARY_FILES_WORDS.restore}
        </Button>
      </div>
    </li>
  );
}

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "problem" }
  | { readonly kind: "ready"; readonly items: readonly TrashListItem[] };

/** The Library's Trash view: newest-first scripts moved to Trash, days left, and Restore. */
export function TrashView(props: LibraryViewProps): ReactNode {
  const { workspaceId } = props;
  const services = useServices();
  const { now, where } = useEnvironment();
  const online = useCommandState("library.restore").enabled;
  const revision = useTrashRevision();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<Readonly<Record<string, string>>>(
    {},
  );

  const cloudAvailable = where.shell !== "desktop" && online;

  useEffect(() => {
    if (!cloudAvailable || workspaceId === null) return;
    let active = true;
    setState((prev) => (prev.kind === "ready" ? prev : { kind: "loading" }));
    void services.trash.list(workspaceId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setState({ kind: "problem" });
        return;
      }
      setState({ kind: "ready", items: result.items });
    });
    return () => {
      active = false;
    };
  }, [cloudAvailable, workspaceId, services.trash, revision, attempt]);

  const handleRestore = useCallback(
    (item: TrashListItem): void => {
      setRestoringId(item.docId);
      setRefusals((prev) => {
        if (!(item.docId in prev)) return prev;
        const next = { ...prev };
        delete next[item.docId];
        return next;
      });
      void restoreTrashedDocument({
        services,
        docId: item.docId,
        title: item.title,
        reportInline: true,
      }).then((ok) => {
        setRestoringId((current) => (current === item.docId ? null : current));
        if (ok) {
          setState((prev) =>
            prev.kind === "ready"
              ? {
                  kind: "ready",
                  items: prev.items.filter(
                    (entry) => entry.docId !== item.docId,
                  ),
                }
              : prev,
          );
          return;
        }
        setRefusals((prev) => ({
          ...prev,
          [item.docId]: LIBRARY_FILES_WORDS.restoreRefused(item.title),
        }));
      });
    },
    [services],
  );

  if (!cloudAvailable) {
    return (
      <LibraryViewSection
        heading={LIBRARY_FILES_WORDS.trashHeading}
        sentence={LIBRARY_FILES_WORDS.trashOffline}
      />
    );
  }

  if (workspaceId === null || state.kind === "loading") {
    return (
      <LibraryViewSection
        heading={LIBRARY_FILES_WORDS.trashHeading}
        sentence={null}
      >
        <TrashSkeleton />
      </LibraryViewSection>
    );
  }

  if (state.kind === "problem") {
    return (
      <LibraryViewSection
        heading={LIBRARY_FILES_WORDS.trashHeading}
        sentence={null}
      >
        <div role="alert" className="flex flex-col items-start gap-3 px-3">
          <p className="text-ui text-fg">{LIBRARY_FILES_WORDS.trashProblem}</p>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={() => setAttempt((count) => count + 1)}
          >
            {LIBRARY_FILES_WORDS.tryAgain}
          </Button>
        </div>
      </LibraryViewSection>
    );
  }

  if (state.items.length === 0) {
    return (
      <LibraryViewSection
        heading={LIBRARY_FILES_WORDS.trashHeading}
        sentence={LIBRARY_FILES_WORDS.trashEmpty}
      />
    );
  }

  const instant = now();
  return (
    <LibraryViewSection
      heading={LIBRARY_FILES_WORDS.trashHeading}
      sentence={null}
    >
      <ul className="mn-table flex flex-col">
        {state.items.map((item) => (
          <TrashRow
            key={item.docId}
            item={item}
            now={instant}
            restoring={restoringId === item.docId}
            refusal={refusals[item.docId] ?? null}
            onRestore={handleRestore}
          />
        ))}
      </ul>
    </LibraryViewSection>
  );
}

/** Shared consequence dialog for Move to Trash when other people hold a role on the script. */
export function TrashConfirmDialog(): ReactNode {
  const confirm = useTrashConfirm();
  const services = useServices();
  const navigate = useNavigate();
  if (confirm === null) return null;
  return (
    <ConsequenceDialog
      open
      title={LIBRARY_FILES_WORDS.moveToTrashTitle(confirm.title)}
      body={LIBRARY_FILES_WORDS.moveToTrashBody(joinNames(confirm.otherNames))}
      action={LIBRARY_FILES_WORDS.moveToTrashConfirm(confirm.title)}
      destructive
      busyLabel={confirm.busy ? LIBRARY_FILES_WORDS.moveToTrash : null}
      refusal={confirm.refusal}
      onCancel={() => trashActions.closeConfirm()}
      onAction={() =>
        void executeMoveToTrash({
          services,
          navigate: (href) => void navigate({ href }),
          docId: confirm.docId,
          title: confirm.title,
          workspaceId: confirm.workspaceId,
          navigateToLibrary: confirm.navigateToLibrary,
          fromDialog: true,
        })
      }
    />
  );
}

/** Library document row menu item for Move to Trash; hidden on desktop and for people without delete permission. */
export function MoveToTrashRowItem(props: {
  readonly docId: string;
  readonly workspaceId: string;
}): ReactNode {
  const { docId, workspaceId } = props;
  const services = useServices();
  const { where } = useEnvironment();
  const navigate = useNavigate();
  const online = useCommandState("library.restore").enabled;
  const titleSource = useMemo(
    () => services.library.documentTitle(docId),
    [services.library, docId],
  );
  const title = useSubscribable(titleSource) ?? LIBRARY_WORDS.untitledScript;
  const signedIn = (readPerson(tabStorage())?.token ?? null) !== null;
  const [canDelete, setCanDelete] = useState<boolean>(
    () => trashActions.get(docId).canDelete,
  );

  useEffect(() => {
    if (where.shell === "desktop" || !signedIn || !online) return;
    let active = true;
    void services.trash.describe(docId).then((access) => {
      if (!active || access === null) return;
      trashActions.set(docId, { canDelete: access.canDelete });
      setCanDelete(access.canDelete);
    });
    return () => {
      active = false;
    };
  }, [where.shell, signedIn, online, docId, services.trash]);

  if (where.shell === "desktop") return null;
  if (signedIn && !canDelete) return null;

  const reason = !signedIn
    ? `${LIBRARY_FILES_WORDS.moveToTrash} — ${LIBRARY_FILES_WORDS.moveToTrashNeverSyncedReason}`
    : !online
      ? `${LIBRARY_FILES_WORDS.moveToTrash} ${LIBRARY_FILES_WORDS.moveToTrashOfflineReason}.`
      : null;

  if (reason !== null) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuItem
              disabled
              className="cursor-not-allowed text-fg-muted"
            >
              {LIBRARY_FILES_WORDS.moveToTrash}
            </DropdownMenuItem>
          }
        />
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={() =>
        void requestMoveToTrash({
          services,
          navigate: (href) => void navigate({ href }),
          docId,
          title,
          workspaceId,
          navigateToLibrary: false,
        })
      }
    >
      {LIBRARY_FILES_WORDS.moveToTrash}
    </DropdownMenuItem>
  );
}
