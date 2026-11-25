// Surface states for the rundown screen: loading, empty, no-access, Can-view/Can-comment notice and problem.
import {
  Button,
  DOCUMENT_WORDS,
  RUNDOWN_WORDS,
  Skeleton,
  messageFor,
} from "@manent/ui";
import type { ReactNode } from "react";
import { CommandAction } from "../screens/document/status-bar.tsx";

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

export function RundownEmpty(props: { readonly canEdit: boolean }): ReactNode {
  return (
    <div className="flex h-full flex-col items-start gap-3 bg-chrome p-12 text-ui">
      <p className="text-fg-muted">{RUNDOWN_WORDS.empty}</p>
      {props.canEdit ? (
        <CommandAction
          commandId="rundown.addRow"
          label={RUNDOWN_WORDS.addRow}
        />
      ) : null}
    </div>
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
    <div className="flex h-full flex-col items-start gap-3 bg-chrome p-12 text-ui">
      <p className="text-fg">{DOCUMENT_WORDS.noAccess}</p>
      {actions.map((action) => (
        <CommandAction
          key={action.commandId}
          commandId={action.commandId}
          label={action.label}
        />
      ))}
    </div>
  );
}

export function RundownViewRoleNotice(): ReactNode {
  return (
    <div className="flex h-full flex-col items-start gap-3 bg-chrome p-12 text-ui">
      <p className="max-w-content text-fg">
        {RUNDOWN_WORDS.cannotOpenWithRole}
      </p>
      <CommandAction
        commandId="view.presentOnPrompter"
        label={RUNDOWN_WORDS.presentOnPrompter}
      />
    </div>
  );
}

export function RundownProblem(props: {
  readonly onReload: () => void;
}): ReactNode {
  return (
    <div className="flex h-full flex-col items-start gap-3 bg-chrome p-12 text-ui">
      <p className="text-fg">{DOCUMENT_WORDS.panelProblem}</p>
      <Button variant="outline" onClick={props.onReload}>
        {DOCUMENT_WORDS.reloadPanel}
      </Button>
    </div>
  );
}
