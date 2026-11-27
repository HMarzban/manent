// Surface states and read-only controls for the rundown screen.
import type { RundownColumnId, RundownRowJSON } from "@manent/schema";
import {
  Button,
  CommandMenuIcon,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  PROMPTER_WORDS,
  RUNDOWN_WORDS,
  Skeleton,
  createValue,
  messageFor,
} from "@manent/ui";
import type { GridCellCoord, StatusFacts, Subscribable } from "@manent/ui";
import {
  CheckIcon,
  CircleAlertIcon,
  CloudOffIcon,
  EllipsisIcon,
  ListOrderedIcon,
  LockIcon,
  TriangleExclamationPointIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";
import { CommandAction } from "../screens/document/status-bar.tsx";
import { useServices } from "../services/context.tsx";
import { previousColumnOfRow } from "./previous-value-model.ts";
import type { RundownAccess } from "./rundown-access.ts";

const LOADING_ROWS = [
  "w-48",
  "w-64",
  "w-40",
  "w-56",
  "w-52",
  "w-36",
  "w-60",
  "w-44",
] as const;

export function RundownLoading(): ReactNode {
  return (
    <div className="flex h-full flex-col bg-chrome">
      <p role="status" className="sr-only">
        {RUNDOWN_WORDS.opening}
      </p>
      <div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
        <div
          aria-hidden="true"
          className="mn-table-head flex shrink-0 items-center gap-4 px-4"
        >
          <Skeleton className="h-3 w-6 shrink-0" />
          <Skeleton className="h-3 w-32 max-w-56 flex-1" />
          <Skeleton className="hidden h-3 w-20 shrink-0 sm:block" />
          <Skeleton className="h-3 w-12 shrink-0" />
          <Skeleton className="hidden h-3 w-12 shrink-0 md:block" />
          <Skeleton className="hidden h-3 w-14 shrink-0 lg:block" />
          <Skeleton className="hidden h-3 w-14 shrink-0 lg:block" />
        </div>
        <div
          aria-hidden="true"
          className="flex flex-1 flex-col divide-y divide-line"
        >
          {LOADING_ROWS.map((width, index) => (
            <div
              key={index}
              className="flex min-h-row items-center gap-4 px-4 py-1.5"
            >
              <Skeleton className="h-3.5 w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <Skeleton className={`h-3.5 max-w-full ${width}`} />
              </div>
              <Skeleton className="hidden h-3.5 w-20 shrink-0 sm:block" />
              <Skeleton className="h-3.5 w-12 shrink-0" />
              <Skeleton className="hidden h-3.5 w-12 shrink-0 md:block" />
              <Skeleton className="hidden h-3.5 w-14 shrink-0 lg:block" />
              <Skeleton className="hidden h-3.5 w-14 shrink-0 lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CentredCard(props: { readonly children: ReactNode }): ReactNode {
  return (
    <div className="h-full overflow-y-auto bg-chrome">
      <div className="flex min-h-full flex-col items-center justify-center p-6">
        {props.children}
      </div>
    </div>
  );
}

export function RundownEmpty(props: { readonly canEdit: boolean }): ReactNode {
  return (
    <CentredCard>
      <EmptyHeroCard
        icon={<ListOrderedIcon aria-hidden="true" className="size-5" />}
        description={RUNDOWN_WORDS.empty}
        actions={
          props.canEdit ? (
            <CommandAction
              commandId="rundown.addRow"
              label={RUNDOWN_WORDS.addRow}
            />
          ) : null
        }
      />
    </CentredCard>
  );
}

export function RundownNoAccess(props: {
  readonly title: string;
  readonly notSent: number;
}): ReactNode {
  const { actions } = messageFor({
    kind: "access_removed",
    title: props.title,
    notSent: props.notSent,
  });
  return (
    <CentredCard>
      <EmptyHeroCard
        icon={<LockIcon aria-hidden="true" className="size-5" />}
        description={DOCUMENT_WORDS.noAccess}
        actions={
          actions.length === 0 ? null : (
            <>
              {actions.map((action) => (
                <CommandAction
                  key={action.commandId}
                  commandId={action.commandId}
                  label={action.label}
                />
              ))}
            </>
          )
        }
      />
    </CentredCard>
  );
}

export function RundownProblem(props: {
  readonly onReload: () => void;
}): ReactNode {
  return (
    <CentredCard>
      <EmptyHeroCard
        icon={<CircleAlertIcon aria-hidden="true" className="size-5" />}
        description={DOCUMENT_WORDS.panelProblem}
        actions={
          <Button variant="outline" onClick={props.onReload}>
            {DOCUMENT_WORDS.reloadPanel}
          </Button>
        }
      />
    </CentredCard>
  );
}

/** Maps the rundown's effective access onto document status so read-only access shows `View only`. */
export function useEffectiveStatus(
  source: Subscribable<StatusFacts>,
  access: RundownAccess,
): Subscribable<StatusFacts> {
  const [derived] = useState(() => createValue(source.get()));
  useEffect(() => {
    const apply = (facts: StatusFacts): void => {
      const needsViewOnly =
        access !== "edit" &&
        facts.server !== "access_removed" &&
        facts.server !== "deleted" &&
        facts.device !== "failing" &&
        facts.access !== "too_old";
      derived.set(needsViewOnly ? { ...facts, access: "view" } : facts);
    };
    apply(source.get());
    return source.subscribe(apply);
  }, [source, access, derived]);
  return derived;
}

/** Read-only prompter status readout for `Can view` / `Can comment` (omits the `Send` button). */
export function ReadOnlyPrompterStatus(props: {
  readonly row: RundownRowJSON;
  readonly online: boolean;
}): ReactNode {
  const { row, online } = props;
  if (row.kind === "header") return null;
  if (!online)
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-fg-muted">
        <CloudOffIcon aria-hidden="true" className="size-icon shrink-0" />
        <span className="truncate">{PROMPTER_WORDS.offline}</span>
      </span>
    );
  if (row.kind !== "script" || row.docId === null)
    return <span className="text-fg-muted">{PROMPTER_WORDS.noScript}</span>;
  if (row.prompter?.state === "on")
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-fg-muted">
        <CheckIcon aria-hidden="true" className="size-icon shrink-0" />
        <span className="truncate">{PROMPTER_WORDS.onPrompter}</span>
      </span>
    );
  return (
    <span className="inline-flex min-w-0 items-center gap-1 font-medium text-attention">
      <TriangleExclamationPointIcon
        aria-hidden="true"
        className="size-icon shrink-0"
      />
      <span className="truncate">{PROMPTER_WORDS.changed}</span>
    </span>
  );
}

/** Read-only row menu exposing only `Open beside` (script rows) and `Previous value` (when present). */
export function ReadOnlyRowMenu(props: {
  readonly row: RundownRowJSON;
  readonly label: string;
  readonly activeCell: GridCellCoord | null;
  onBeforeOpen(rowId: string): void;
  onOpenBeside(rowId: string): void;
  onOpenPrevious(rowId: string, columnId: RundownColumnId): void;
}): ReactNode {
  const { row, label, activeCell, onBeforeOpen, onOpenBeside, onOpenPrevious } =
    props;
  const { commands } = useServices();
  const preferredCol =
    activeCell?.rowId === row.id ? activeCell.columnId : null;
  const previousCol = previousColumnOfRow(row, preferredCol);
  const canOpenBeside = row.kind === "script" && row.docId !== null;
  if (!canOpenBeside && previousCol === null) return null;
  const openBesideLabel = commands.state("rundown.openBeside").label;
  const previousLabel = commands.state("rundown.previousValue").label;
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) onBeforeOpen(row.id);
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className="cursor-pointer text-fg-muted opacity-0 transition-opacity duration-(--dur-fast) hover:bg-subtle hover:text-fg focus-visible:opacity-100 data-popup-open:opacity-100 [.mn-row:hover_&]:opacity-100 [.mn-row:focus-within_&]:opacity-100 [@media(hover:none)]:opacity-100"
          />
        }
      >
        <EllipsisIcon aria-hidden="true" className="size-icon" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-menu-min max-w-menu-max"
      >
        {canOpenBeside ? (
          <DropdownMenuItem
            data-tour="rundown.openBeside"
            className="cursor-pointer hover:bg-subtle"
            onClick={() => onOpenBeside(row.id)}
          >
            <CommandMenuIcon id="rundown.openBeside" />
            <span>{openBesideLabel}</span>
          </DropdownMenuItem>
        ) : null}
        {previousCol !== null ? (
          <DropdownMenuItem
            data-tour="rundown.previousValue"
            className="cursor-pointer hover:bg-subtle"
            onClick={() => {
              onBeforeOpen(row.id);
              onOpenPrevious(row.id, previousCol);
            }}
          >
            <CommandMenuIcon id="rundown.previousValue" />
            <span>{previousLabel}</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Inline alert shown below an invalid rundown details field. */
export function RundownFieldAlert(props: {
  readonly id: string;
  readonly message: string;
}): ReactNode {
  return (
    <p
      id={props.id}
      role="alert"
      className="flex items-start gap-1 text-meta text-fg"
    >
      <TriangleExclamationPointIcon
        aria-hidden="true"
        className="mt-0.5 size-icon shrink-0 text-attention"
      />
      <span>{props.message}</span>
    </p>
  );
}

/** Handles Enter (commit) and Escape (cancel) on rundown details text inputs. */
export function handleRundownFieldKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  commit: () => void,
  cancel: () => void,
): void {
  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
    event.preventDefault();
    commit();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }
}

/** Labelled text input with hint and inline validation alert for Details → Rundown. */
export function RundownHintedTextField(props: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly error: string | null;
  readonly readOnly: boolean;
  readonly inputClass: string;
  readonly tourTarget?: string;
  readonly onChange: (next: string) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  const hintId = `${props.id}-hint`;
  const errorId = `${props.id}-err`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={props.id} className="text-ui font-medium text-fg">
        {props.label}
      </Label>
      <Input
        id={props.id}
        data-tour={props.tourTarget}
        readOnly={props.readOnly}
        aria-invalid={props.error !== null ? true : undefined}
        aria-describedby={
          props.error === null ? hintId : `${hintId} ${errorId}`
        }
        value={props.value}
        onChange={(event) => {
          if (!props.readOnly) props.onChange(event.target.value);
        }}
        onKeyDown={(event) =>
          handleRundownFieldKeyDown(event, props.onCommit, props.onCancel)
        }
        onBlur={props.onCommit}
        className={props.inputClass}
      />
      <p id={hintId} className="text-meta text-fg-muted">
        {props.hint}
      </p>
      {props.error === null ? null : (
        <RundownFieldAlert id={errorId} message={props.error} />
      )}
    </div>
  );
}
