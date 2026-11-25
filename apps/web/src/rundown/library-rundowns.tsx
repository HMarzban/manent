// A Show or News project in the Library: its rundowns listed by date with nested stories and New rundown.
import {
  Button,
  LIBRARY_WORDS,
  READOUT_WORDS,
  RUNDOWN_WORDS,
  Row,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  VirtualRows,
  cn,
  formatTime,
  formatWhen,
  useCommandState,
} from "@manent/ui";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, SyntheticEvent } from "react";
import { KindIcon } from "../screens/library/project-kind.tsx";
import { PROJECT_ROW_ITEMS } from "../screens/library/project-row-items.ts";
import type { ProjectViewProps } from "../screens/library/project-views.ts";
import {
  PLACE_COLUMN,
  PLACE_HEAD,
  RowMenu,
  placeProps,
} from "../screens/library/row-place.tsx";
import type { EpisodeLastEdited } from "../screens/library/series/series-facts.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { rundownActions } from "../state/rundown.store.ts";
import {
  asRundownProjectKind,
  createProjectRundown,
} from "./create-rundown.ts";
import { formatAirDate } from "./dur-format.ts";
import { useRundownsData } from "./library-rundowns-data.ts";
import type {
  RundownViewItem,
  StoryViewItem,
} from "./library-rundowns-data.ts";

const VIRTUAL_LIMIT = 100;
const EMPTY_SET: ReadonlySet<string> = new Set();
const SKELETON_WIDTHS = ["w-32", "w-28", "w-36"] as const;
const COL_AIR = "w-16 shrink-0 tabular-nums";
const COL_ROWS = "hidden w-20 shrink-0 tabular-nums @lg:block";
const COL_STORY_ROW = "w-20 shrink-0 tabular-nums";
const COL_EDITED = "hidden w-col-edited shrink-0 truncate @xl:block";
const ROW_ITEMS = PROJECT_ROW_ITEMS.filter((item) =>
  item.targets.includes("project"),
);

const libraryNewHandlers = new Map<string, () => void>();
let activeLibraryProject: string | null = null;
const dispatchLibraryNew = (): void => {
  const active =
    activeLibraryProject === null
      ? undefined
      : libraryNewHandlers.get(activeLibraryProject);
  (active ?? [...libraryNewHandlers.values()].at(-1))?.();
};
const syncLibrarySlot = (): void =>
  rundownActions.provide(
    "library",
    libraryNewHandlers.size === 0
      ? Object.freeze({})
      : Object.freeze({ new: dispatchLibraryNew }),
  );

type FlatRow =
  | { readonly kind: "rundown"; readonly item: RundownViewItem }
  | { readonly kind: "story"; readonly story: StoryViewItem };

const stopRowEvent = (event: SyntheticEvent): void => event.stopPropagation();

function formatLastEdited(edited: EpisodeLastEdited, now: number): string {
  if (edited === null) return RUNDOWN_WORDS.dash;
  if ("changedSinceOpened" in edited) return LIBRARY_WORDS.changedSinceOpened;
  return LIBRARY_WORDS.edited(edited.byName, formatWhen(edited.at, now));
}

function NewRundownButton(props: {
  readonly disabled: boolean;
  readonly reason: string | null;
  readonly onClick: () => void;
}): ReactNode {
  const button = (
    <Button
      variant="outline"
      size="sm"
      disabled={props.disabled}
      className={props.disabled ? "cursor-not-allowed" : "cursor-pointer"}
      onClick={props.onClick}
    >
      <PlusIcon aria-hidden="true" data-icon="inline-start" />
      {RUNDOWN_WORDS.newRundown}
    </Button>
  );
  if (props.reason === null) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>
        {READOUT_WORDS.unavailable(RUNDOWN_WORDS.newRundown, props.reason)}
      </TooltipContent>
    </Tooltip>
  );
}

function RundownListRow(props: {
  readonly item: RundownViewItem;
  readonly expanded: boolean;
  readonly shell: "web" | "desktop";
  readonly now: number;
  readonly onToggle: () => void;
  readonly onOpen: () => void;
}): ReactNode {
  const { item, expanded, shell, now, onToggle, onOpen } = props;
  const fallback =
    item.fallbackTitle !== "" &&
    item.fallbackTitle !== LIBRARY_WORDS.untitledScript
      ? item.fallbackTitle
      : RUNDOWN_WORDS.dash;
  const dateLabel =
    (item.airDate === "" ? "" : formatAirDate(item.airDate, now)) || fallback;
  const ToggleIcon = expanded ? ChevronDownIcon : ChevronRightIcon;
  const { trailing, ...place } = placeProps(item.place, shell);
  return (
    <Row onActivate={onOpen} trailing={trailing} {...place}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          {item.stories.length > 0 ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={dateLabel}
              className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:bg-subtle hover:text-fg"
              onClick={(event) => (stopRowEvent(event), onToggle())}
              onKeyDown={stopRowEvent}
            >
              <ToggleIcon aria-hidden="true" className="size-icon" />
            </button>
          ) : (
            <span aria-hidden="true" className="size-6 shrink-0" />
          )}
          <span className="truncate font-semibold">{dateLabel}</span>
        </span>
        <span className={cn(COL_AIR, "text-meta text-fg-muted")}>
          {item.airAt === null ? RUNDOWN_WORDS.dash : formatTime(item.airAt)}
        </span>
        <span className={cn(COL_ROWS, "text-meta text-fg-muted")}>
          {item.rowCount === null
            ? RUNDOWN_WORDS.dash
            : RUNDOWN_WORDS.rowCount(item.rowCount)}
        </span>
        <span className={cn(COL_EDITED, "text-meta text-fg-muted")}>
          {formatLastEdited(item.lastEdited, now)}
        </span>
      </span>
    </Row>
  );
}

function StoryListRow(props: {
  readonly story: StoryViewItem;
  readonly shell: "web" | "desktop";
  readonly now: number;
  readonly onOpen: () => void;
}): ReactNode {
  const { story, shell, now, onOpen } = props;
  const { trailing, ...place } = placeProps(story.place, shell);
  return (
    <Row onActivate={onOpen} trailing={trailing} {...place}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate ps-8 text-ui text-fg">
          {story.title}
        </span>
        <span className={cn(COL_STORY_ROW, "text-meta text-fg-muted")}>
          {story.rowNumber === null
            ? RUNDOWN_WORDS.dash
            : RUNDOWN_WORDS.storyRowLabel(story.rowNumber)}
        </span>
        <span className={cn(COL_EDITED, "text-meta text-fg-muted")}>
          {formatLastEdited(story.lastEdited, now)}
        </span>
      </span>
    </Row>
  );
}

function RundownsSkeleton(): ReactNode {
  return (
    <div
      aria-busy="true"
      data-tour="library:rundowns"
      className="mn-table flex flex-col"
    >
      <div aria-hidden="true" className="flex flex-col">
        <div className="mn-table-head flex items-center gap-2 px-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ms-auto h-3 w-12 shrink-0" />
          <Skeleton className="h-3 w-16 shrink-0" />
        </div>
        {SKELETON_WIDTHS.map((width, index) => (
          <div
            key={index}
            className="flex min-h-row items-center gap-2 border-t border-line px-3 first:border-t-0"
          >
            <Skeleton className={cn("h-3.5", width)} />
            <Skeleton className="ms-auto h-3.5 w-12 shrink-0" />
            <Skeleton className="h-3.5 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A Show or News project in the Library: rundowns listed by date, nested stories, and New rundown. */
export function RundownsView(props: ProjectViewProps): ReactNode {
  const { project, shell, now, open } = props;
  const services = useServices();
  const { now: clockNow } = useEnvironment();
  const data = useRundownsData(project.projectId);
  const newCmd = useCommandState("rundown.new");
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(EMPTY_SET);

  const disabled =
    !data.canEdit || !newCmd.enabled || data.workspaceId === null || creating;
  const onNewRundown = (): void => {
    if (disabled || data.workspaceId === null) return;
    setCreating(true);
    void createProjectRundown({
      services,
      workspaceId: data.workspaceId,
      projectId: project.projectId,
      kind: asRundownProjectKind(project.kind),
      existing: data.rundowns,
      nowMs: clockNow(),
    })
      .then((created) => open(created.docId))
      .finally(() => setCreating(false));
  };

  const newRef = useRef(onNewRundown);
  newRef.current = onNewRundown;

  useEffect(() => {
    const id = project.projectId;
    libraryNewHandlers.set(id, () => newRef.current());
    activeLibraryProject ??= id;
    syncLibrarySlot();
    return () => {
      libraryNewHandlers.delete(id);
      if (activeLibraryProject === id)
        activeLibraryProject = [...libraryNewHandlers.keys()].at(-1) ?? null;
      syncLibrarySlot();
    };
  }, [project.projectId]);

  const markActive = () => {
    activeLibraryProject = project.projectId;
  };
  const toggleExpanded = (docId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(docId)) next.add(docId);
      return next;
    });

  const flatRows = useMemo<readonly FlatRow[]>(
    () =>
      data.rundowns.flatMap((item) => [
        { kind: "rundown" as const, item },
        ...(collapsed.has(item.docId)
          ? []
          : item.stories.map((story) => ({ kind: "story" as const, story }))),
      ]),
    [data.rundowns, collapsed],
  );

  const renderRow = (index: number): ReactNode => {
    const entry = flatRows[index];
    if (entry === undefined) return null;
    return entry.kind === "story" ? (
      <StoryListRow
        story={entry.story}
        shell={shell}
        now={now}
        onOpen={() => open(entry.story.docId)}
      />
    ) : (
      <RundownListRow
        item={entry.item}
        expanded={!collapsed.has(entry.item.docId)}
        shell={shell}
        now={now}
        onToggle={() => toggleExpanded(entry.item.docId)}
        onOpen={() => open(entry.item.docId)}
      />
    );
  };

  const loading = data.rundowns.length === 0 && !data.loaded;
  const newButton = (
    <NewRundownButton
      disabled={disabled}
      reason={newCmd.whyNot}
      onClick={onNewRundown}
    />
  );

  return (
    <section
      aria-label={project.title}
      className="flex flex-col gap-2"
      onFocusCapture={markActive}
      onPointerDownCapture={markActive}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <KindIcon
            kind={project.kind}
            className="size-icon shrink-0 text-fg-muted"
          />
          <h2 className="min-w-0 truncate text-title">{project.title}</h2>
        </span>
        {ROW_ITEMS.length > 0 && project.place.kind !== "not_on_device" ? (
          <RowMenu title={project.title}>
            {ROW_ITEMS.map(({ id, Item }) => (
              <Item
                key={id}
                target="project"
                id={project.projectId}
                firstDocId={project.firstDocId}
              />
            ))}
          </RowMenu>
        ) : null}
        {newButton}
      </div>
      {loading ? (
        <RundownsSkeleton />
      ) : data.rundowns.length === 0 ? (
        <div
          data-tour="library:rundowns"
          className="flex flex-col items-start gap-2 py-3"
        >
          <p className="text-ui text-fg-muted">{RUNDOWN_WORDS.noRundownsYet}</p>
          {newButton}
        </div>
      ) : (
        <div
          data-tour="library:rundowns"
          className={cn("mn-table flex flex-col", PLACE_COLUMN)}
        >
          <div className="mn-table-head flex shrink-0 items-center gap-2 px-3">
            <span className="min-w-0 flex-1">{RUNDOWN_WORDS.libraryDate}</span>
            <span className={COL_AIR}>{RUNDOWN_WORDS.libraryAir}</span>
            <span className={COL_ROWS}>{RUNDOWN_WORDS.libraryRows}</span>
            <span className={COL_EDITED}>
              {RUNDOWN_WORDS.libraryLastEdited}
            </span>
            <span aria-hidden="true" className={PLACE_HEAD} />
          </div>
          <div
            className={flatRows.length > VIRTUAL_LIMIT ? "h-96" : "shrink-0"}
          >
            <VirtualRows
              count={flatRows.length}
              rowHeight="one"
              label={project.title}
              renderRow={renderRow}
            />
          </div>
        </div>
      )}
    </section>
  );
}
