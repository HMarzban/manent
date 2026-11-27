// Shared dedicated Version history controls: All/Drafts scope strip, compact segmented view-mode radiogroup, and sticky Restore footer.
import {
  Button,
  HISTORY_WORDS,
  RUNDOWN_HISTORY_WORDS,
  versionRef,
} from "@manent/ui";
import {
  AsteriskIcon,
  Columns2Icon,
  EyeIcon,
  FileDiffIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useId } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { HistoryRow } from "../../history/history-rows.ts";
import { useServices } from "../../services/context.tsx";
import { nameOf } from "../../services/sync/index-entries.ts";
import { historyActions, useHistory } from "../../state/history.store.ts";
import type { ChangesMode } from "../../state/history.store.ts";
import { openRundownRestore } from "./history-rundown-dialog.tsx";

export interface ModeOption<M extends ChangesMode = ChangesMode> {
  readonly value: M;
  readonly label: string;
  readonly disabled?: boolean;
  readonly note?: string | null;
}

function modeIcon(mode: ChangesMode): ReactNode {
  const cls = "size-3.5 shrink-0";
  switch (mode) {
    case "page":
      return <FileDiffIcon aria-hidden="true" className={cls} />;
    case "side":
      return <Columns2Icon aria-hidden="true" className={cls} />;
    case "asterisks":
      return <AsteriskIcon aria-hidden="true" className={cls} />;
    case "as_it_was":
      return <EyeIcon aria-hidden="true" className={cls} />;
  }
}

/** Two-way segmented filter strip: All versions vs Drafts only, keeping `aria-pressed` semantics. */
export function HistoryScopeToggle(): ReactNode {
  const draftsOnly = useHistory("draftsOnly");
  return (
    <div
      role="group"
      aria-label={HISTORY_WORDS.versionFilter}
      className="grid grid-cols-2 gap-0.5 rounded-control border border-line bg-well p-0.5 text-meta"
    >
      <button
        type="button"
        aria-pressed={!draftsOnly}
        className={`h-6 cursor-pointer rounded-[calc(var(--shape-control)-2px)] px-2 font-medium transition-colors ${
          !draftsOnly
            ? "bg-raised text-fg shadow-xs"
            : "text-fg-muted hover:text-fg"
        }`}
        onClick={() => historyActions.setDraftsOnly(false)}
      >
        {HISTORY_WORDS.allVersions}
      </button>
      <button
        type="button"
        aria-pressed={draftsOnly}
        className={`h-6 cursor-pointer rounded-[calc(var(--shape-control)-2px)] px-2 font-medium transition-colors ${
          draftsOnly
            ? "bg-raised text-fg shadow-xs"
            : "text-fg-muted hover:text-fg"
        }`}
        onClick={() => historyActions.setDraftsOnly(true)}
      >
        {HISTORY_WORDS.draftsOnly}
      </button>
    </div>
  );
}

/**
 * Compact archival segmented radio group replacing the tall 4-row vertical radio wall.
 * Preserves `role="radiogroup"`, `role="radio"`, `aria-checked`, arrow-key navigation, and exact accessible labels.
 */
export function HistoryModeStrip<M extends ChangesMode>(props: {
  readonly value: M;
  readonly options: readonly ModeOption<M>[];
  readonly onChange: (value: M) => void;
}): ReactNode {
  const { value, options, onChange } = props;
  const groupId = useId();
  const disabledNote =
    options.find((opt) => opt.disabled && opt.note)?.note ?? null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const enabled = options.filter((opt) => !opt.disabled);
    if (enabled.length === 0) return;
    let delta = 0;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") delta = 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") delta = -1;
    else return;
    event.preventDefault();
    const index = enabled.findIndex((opt) => opt.value === value);
    const next = enabled[(index + delta + enabled.length) % enabled.length]!;
    onChange(next.value);
    const button = event.currentTarget.querySelector<HTMLElement>(
      `[data-mode="${next.value}"]`,
    );
    button?.focus();
  };

  return (
    <div className="flex flex-col gap-1">
      <span id={`${groupId}-label`} className="sr-only">
        {HISTORY_WORDS.show}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        onKeyDown={onKeyDown}
        className={`grid gap-0.5 rounded-control border border-line bg-well p-0.5 ${
          options.length === 4 ? "grid-cols-2" : "grid-cols-3"
        }`}
      >
        {options.map((option) => {
          const checked = option.value === value;
          const labelId = `${groupId}-${option.value}`;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              data-mode={option.value}
              data-disabled={option.disabled ? "" : undefined}
              aria-checked={checked}
              aria-disabled={option.disabled ? "true" : undefined}
              aria-labelledby={labelId}
              disabled={option.disabled}
              tabIndex={checked ? 0 : -1}
              className={`mn-history-mode-btn flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-[calc(var(--shape-control)-2px)] px-2 text-meta font-medium transition-colors ${
                option.disabled
                  ? "cursor-not-allowed text-fg-muted opacity-50"
                  : checked
                    ? "cursor-pointer bg-selected text-fg"
                    : "cursor-pointer text-fg-muted hover:bg-subtle hover:text-fg"
              }`}
              onClick={() => {
                if (!option.disabled) onChange(option.value);
              }}
            >
              {modeIcon(option.value)}
              <span id={labelId} className="truncate">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
      {disabledNote === null ? null : (
        <span className="text-meta text-fg-muted">{disabledNote}</span>
      )}
    </div>
  );
}

/** Sticky recovery footer at the bottom of the dedicated Version history panel when a version is selected. */
export function HistorySelectionFooter(props: {
  readonly docId: string;
  readonly row: HistoryRow | null;
  readonly isRundown: boolean;
  readonly canEdit: boolean;
}): ReactNode {
  const { docId, row, isRundown, canEdit } = props;
  const { commands } = useServices();
  const baseline = useHistory("baseline");
  if (row === null && baseline === null) return null;
  const title = row?.item.name ?? row?.title ?? baseline?.title ?? "";
  const canRestore = canEdit && row !== null;
  const restore = (): void => {
    if (row === null) return;
    if (isRundown) {
      openRundownRestore({
        kind: "all",
        docId,
        versionId: row.item.id,
        ref: versionRef(row.item, nameOf),
      });
      return;
    }
    commands.run("history.restore", "control");
  };
  return (
    <footer className="flex shrink-0 flex-col gap-2 border-t border-line bg-chrome px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-meta">
        <span className="truncate font-medium text-fg" title={title}>
          {title}
        </span>
        {row !== null ? (
          <span className="shrink-0 tnum text-fg-muted">{row.time}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        {canRestore ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="flex-1 cursor-pointer gap-1.5"
            onClick={restore}
          >
            <RotateCcwIcon aria-hidden="true" className="size-3.5" />
            {isRundown
              ? RUNDOWN_HISTORY_WORDS.restoreButton(
                  versionRef(row.item, nameOf),
                )
              : HISTORY_WORDS.restore}
          </Button>
        ) : null}
        {baseline !== null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={
              canRestore ? "shrink-0 cursor-pointer" : "flex-1 cursor-pointer"
            }
            onClick={() => commands.run("history.backToWorking", "control")}
          >
            {commands.state("history.backToWorking").label}
          </Button>
        ) : null}
      </div>
    </footer>
  );
}
