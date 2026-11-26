// Show and News Library New rundown control: stays a single button until templates exist, auto-uses project default, and adds a trailing menu when templates exist.
import type {
  RundownTemplateSkeleton,
  WorkspaceTemplateEntry,
} from "@manent/crdt";
import type { RundownFieldsJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  READOUT_WORDS,
  RUNDOWN_WORDS,
  SHOW_TEMPLATE_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { useServices } from "../services/context.tsx";
import type { CreateResult, PersonServices } from "../services/ports.ts";
import { liveMap } from "../services/sync/private-index.ts";
import {
  applyRundownTemplateToHandle,
  listWorkspaceTemplates,
  readProjectRundownDefault,
} from "../templates/template-service.ts";
import type { StoredProjectTemplate } from "../templates/template-service.ts";
import { createProjectRundown, planNewRundown } from "./create-rundown.ts";
import type {
  ExistingRundownSummary,
  RundownProjectKind,
} from "./create-rundown.ts";
import { formatAirDate } from "./dur-format.ts";

export interface ProjectRundownTemplates {
  readonly defaultRundown: StoredProjectTemplate<RundownTemplateSkeleton> | null;
  readonly workspaceRundowns: readonly WorkspaceTemplateEntry[];
}

const EMPTY_TEMPLATES: ProjectRundownTemplates = Object.freeze({
  defaultRundown: null,
  workspaceRundowns: Object.freeze([]),
});

/** Subscribes to the project's default rundown template and the workspace's shared rundown templates. */
export function useProjectRundownTemplates(
  workspaceId: string | null,
  projectId: string,
): ProjectRundownTemplates {
  const { projectIndex, openHandle } = useServices();
  const [defaultRundown, setDefaultRundown] =
    useState<StoredProjectTemplate<RundownTemplateSkeleton> | null>(null);
  const [workspaceRundowns, setWorkspaceRundowns] = useState<
    readonly WorkspaceTemplateEntry[]
  >([]);

  useEffect(() => {
    let shown = true;
    let stop = (): void => {};
    const index = projectIndex(projectId);
    void index
      .handle()
      .then(async (handle) => {
        if (!shown) return;
        const map = await index.map("template");
        const refresh = (): void => {
          if (shown)
            setDefaultRundown(
              readProjectRundownDefault(
                handle.doc(),
                SHOW_TEMPLATE_WORDS.defaultRundown,
              ),
            );
        };
        refresh();
        stop = map.subscribe(refresh);
      })
      .catch(() => {});
    return () => {
      shown = false;
      stop();
      void index.close();
    };
  }, [projectIndex, projectId]);

  useEffect(() => {
    if (workspaceId === null) {
      setWorkspaceRundowns(EMPTY_TEMPLATES.workspaceRundowns);
      return;
    }
    let shown = true;
    let stop = (): void => {};
    let handle: DocHandle | null = null;
    void openHandle(indexDocId("workspace", workspaceId))
      .then((opened) => {
        if (!shown) return void opened.close();
        handle = opened;
        const map = liveMap(opened, "templates");
        const refresh = (): void => {
          if (shown)
            setWorkspaceRundowns(
              listWorkspaceTemplates(opened.doc(), "rundown"),
            );
        };
        refresh();
        stop = map.subscribe(refresh);
      })
      .catch(() => {});
    return () => {
      shown = false;
      stop();
      if (handle !== null) void handle.close();
    };
  }, [openHandle, workspaceId]);

  return { defaultRundown, workspaceRundowns };
}

/** Creates a new rundown: blank when `skeleton` is null, or instantiated from `skeleton` with `createdFromTemplate: true`. */
export async function createProjectRundownWithTemplate(options: {
  readonly services: Pick<PersonServices, "library" | "messages" | "userId">;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly kind: RundownProjectKind;
  readonly existing: readonly ExistingRundownSummary[];
  readonly nowMs: number;
  readonly skeleton: RundownTemplateSkeleton | null;
}): Promise<CreateResult & { readonly fields: RundownFieldsJSON }> {
  const { services, workspaceId, projectId, kind, existing, nowMs, skeleton } =
    options;
  if (skeleton === null)
    return createProjectRundown({
      services,
      workspaceId,
      projectId,
      kind,
      existing,
      nowMs,
    });
  const planned = planNewRundown({ existing, nowMs });
  const fields: RundownFieldsJSON = {
    airDate: planned.airDate,
    airAt: planned.airAt,
    windowLeadMs: skeleton.rundown.windowLeadMs,
    targetMs: skeleton.rundown.targetMs ?? planned.targetMs,
  };
  const dateLabel = formatAirDate(fields.airDate, nowMs) || fields.airDate;
  const created = await services.library.addCopy(
    workspaceId,
    projectId,
    kind,
    dateLabel,
    {
      docKind: "rundown",
      airDate: fields.airDate,
      rundownId: null,
      createdFromTemplate: true,
      start: (handle) =>
        applyRundownTemplateToHandle(handle, skeleton, {
          userId: services.userId,
          now: () => nowMs,
          airDate: fields.airDate,
          airAt: fields.airAt,
        }),
    },
  );
  services.messages.push({
    id: `rundown.new.${nowMs}.${created.docId}`,
    text: RUNDOWN_WORDS.newRundownFor(dateLabel),
    lifetime: "brief",
    ownWork: false,
    actions: [],
  });
  return { ...created, fields };
}

/**
 * Single `New rundown` button when no templates exist; split button with trailing chevron menu
 * (`Blank rundown` + shared workspace templates) once a project default or workspace template exists.
 */
export function NewRundownSplitControl(props: {
  readonly disabled: boolean;
  readonly reason: string | null;
  readonly templates: ProjectRundownTemplates;
  readonly onCreate: (skeleton: RundownTemplateSkeleton | null) => void;
}): ReactNode {
  const { disabled, reason, templates, onCreate } = props;
  const reasonId = useId();
  const hasTemplates =
    templates.defaultRundown !== null || templates.workspaceRundowns.length > 0;
  const unavailable =
    reason === null
      ? null
      : READOUT_WORDS.unavailable(RUNDOWN_WORDS.newRundown, reason);

  const primaryButton = (
    <Button
      variant="outline"
      size="sm"
      data-tour="rundown.new"
      aria-disabled={disabled ? true : undefined}
      aria-describedby={unavailable === null ? undefined : reasonId}
      className={
        disabled
          ? "cursor-not-allowed opacity-50"
          : hasTemplates
            ? "cursor-pointer rounded-e-none border-e-0"
            : "cursor-pointer"
      }
      onClick={() => {
        if (!disabled) onCreate(templates.defaultRundown?.skeleton ?? null);
      }}
    >
      <PlusIcon aria-hidden="true" data-icon="inline-start" />
      {RUNDOWN_WORDS.newRundown}
    </Button>
  );

  const wrappedPrimary =
    unavailable === null ? (
      primaryButton
    ) : (
      <>
        <Tooltip>
          <TooltipTrigger render={primaryButton} />
          <TooltipContent>{unavailable}</TooltipContent>
        </Tooltip>
        <span id={reasonId} className="sr-only">
          {unavailable}
        </span>
      </>
    );

  if (!hasTemplates) return wrappedPrimary;

  return (
    <div className="inline-flex items-center">
      {wrappedPrimary}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              data-tour="rundown:new_menu"
              aria-label={SHOW_TEMPLATE_WORDS.moreNewRundownChoices}
              disabled={disabled}
              className={
                disabled
                  ? "cursor-not-allowed rounded-s-none opacity-50"
                  : "cursor-pointer rounded-s-none"
              }
            />
          }
        >
          <ChevronDownIcon aria-hidden="true" className="size-icon" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => onCreate(null)}
            >
              {SHOW_TEMPLATE_WORDS.blankRundown}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {templates.workspaceRundowns.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {templates.workspaceRundowns.map((entry) =>
                  entry.skeleton.kind === "rundown" ? (
                    <DropdownMenuItem
                      key={entry.id}
                      className="cursor-pointer"
                      onClick={() =>
                        onCreate(entry.skeleton as RundownTemplateSkeleton)
                      }
                    >
                      {entry.name}
                    </DropdownMenuItem>
                  ) : null,
                )}
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
