// Surface states for the rundown screen: loading, empty, no-access, Can-view/Can-comment notice and problem.
import {
  Button,
  DOCUMENT_WORDS,
  RUNDOWN_WORDS,
  Skeleton,
  messageFor,
} from "@manent/ui";
import {
  CircleAlertIcon,
  ListOrderedIcon,
  LockIcon,
  MonitorIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";
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

export function RundownViewRoleNotice(): ReactNode {
  return (
    <CentredCard>
      <EmptyHeroCard
        icon={<MonitorIcon aria-hidden="true" className="size-5" />}
        description={RUNDOWN_WORDS.cannotOpenWithRole}
        actions={
          <CommandAction
            commandId="view.presentOnPrompter"
            label={RUNDOWN_WORDS.presentOnPrompter}
          />
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
