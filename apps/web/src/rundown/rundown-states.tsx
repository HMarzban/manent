// Surface states for the rundown screen: loading, empty, no-access, Can-view/Can-comment notice and problem.
import {
  DOCUMENT_WORDS,
  RUNDOWN_WORDS,
  Skeleton,
  messageFor,
} from "@manent/ui";
import type { ReactNode } from "react";
import { CommandAction } from "../screens/document/status-bar.tsx";

export function RundownLoading(): ReactNode {
  return (
    <div className="flex h-full flex-col gap-3 bg-chrome p-6">
      <p className="text-ui text-fg-muted">{RUNDOWN_WORDS.opening}</p>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-control w-full" />
        <Skeleton className="h-control w-full" />
        <Skeleton className="h-control w-full" />
        <Skeleton className="h-control w-full" />
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
      <button
        type="button"
        className="h-control cursor-pointer rounded-control border border-line px-2 text-ui font-medium text-fg hover:bg-subtle"
        onClick={props.onReload}
      >
        {DOCUMENT_WORDS.reloadPanel}
      </button>
    </div>
  );
}
