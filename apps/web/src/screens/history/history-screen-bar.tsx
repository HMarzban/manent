// Dedicated top bar and calm archival comparison banner for the `/s/$docId/history` page.
import {
  Button,
  CommandButton,
  HISTORY_WORDS,
  Kbd,
  RUNDOWN_HISTORY_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  keyLabel,
  useCommandState,
  useCommands,
  versionRef,
} from "@manent/ui";
import { BookmarkPlusIcon, LockIcon, RotateCcwIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { HistoryRow } from "../../history/history-rows.ts";
import { nameOf } from "../../services/sync/index-entries.ts";
import { useHistory } from "../../state/history.store.ts";
import { openRundownRestore } from "../document/history-rundown-dialog.tsx";

/** Dedicated archival top bar for `/s/$docId/history` (editing is blocked). */
export function HistoryScreenBar(props: {
  readonly docId: string;
  readonly title: string;
  readonly isRundown: boolean;
  readonly canEdit: boolean;
  readonly selectedRow: HistoryRow | null;
  readonly offeredVersionId: string | null;
  readonly onBack: () => void;
}): ReactNode {
  const {
    docId,
    title,
    isRundown,
    canEdit,
    selectedRow,
    offeredVersionId,
    onBack,
  } = props;
  const { service, platform } = useCommands();
  const nameDraft = useCommandState("history.nameDraft");
  const [nameChord] = nameDraft.keys;

  const restore = (): void => {
    if (selectedRow === null) return;
    if (isRundown) {
      openRundownRestore({
        kind: "all",
        docId,
        versionId: selectedRow.item.id,
        ref: versionRef(selectedRow.item, nameOf),
      });
      return;
    }
    service.run("history.restore", "control");
  };

  return (
    <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-chrome px-3 py-1.5 text-ui">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 cursor-pointer text-fg-muted hover:text-fg"
          onClick={onBack}
        >
          {isRundown ? HISTORY_WORDS.backToRundown : HISTORY_WORDS.backToScript}
        </Button>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-line" />
        <h1
          tabIndex={-1}
          className="truncate text-title font-semibold text-fg outline-none"
          title={title}
        >
          {title}
        </h1>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-raised px-2 py-0.5 text-micro font-medium text-fg-muted">
          <LockIcon aria-hidden="true" className="size-3" />
          {HISTORY_WORDS.readOnlyReview}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {canEdit && nameDraft.visible ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="cursor-pointer gap-1.5"
                  onClick={() => service.run("history.nameDraft", "control")}
                />
              }
            >
              <BookmarkPlusIcon aria-hidden="true" className="size-3.5" />
              <span>{nameDraft.label}</span>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              <span>{nameDraft.label}</span>
              {nameChord === undefined ? null : (
                <Kbd>{keyLabel(nameChord, platform)}</Kbd>
              )}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {offeredVersionId !== null ? (
          <CommandButton id="history.copyLink" variant="outline" size="sm" />
        ) : null}
        {canEdit && selectedRow !== null ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={restore}
          >
            <RotateCcwIcon aria-hidden="true" className="size-3.5" />
            <span>
              {isRundown
                ? RUNDOWN_HISTORY_WORDS.restoreButton(
                    versionRef(selectedRow.item, nameOf),
                  )
                : HISTORY_WORDS.restore}
            </span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}

/** Calm archival comparison strip above the read-only History canvas when a baseline is active. */
export function HistoryComparisonBanner(props: {
  readonly note: string | null;
  readonly onClear: () => void;
}): ReactNode {
  const { service } = useCommands();
  const baseline = useHistory("baseline");
  const mode = useHistory("mode");
  if (baseline === null) return null;

  const refText =
    baseline.date === null
      ? baseline.title
      : `${baseline.title}, ${baseline.date}`;
  const headline =
    mode === "as_it_was"
      ? HISTORY_WORDS.viewingVersion(refText)
      : HISTORY_WORDS.showingChangesSince(refText);

  return (
    <div
      role="status"
      className="mn-history-banner flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-ui"
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-fg">{headline}</span>
        {props.note === null ? null : (
          <span className="text-meta text-fg-muted">{props.note}</span>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 cursor-pointer"
        onClick={props.onClear}
      >
        {mode === "as_it_was"
          ? service.state("history.backToWorking").label
          : service.state("history.hideChanges").label}
      </Button>
    </div>
  );
}
