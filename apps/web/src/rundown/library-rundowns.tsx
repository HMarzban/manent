// A Show or News project in the Library: its rundowns listed by date with nested stories and New rundown.
import type { RundownTemplateSkeleton } from "@manent/crdt";
import {
  DEMO_WORDS,
  LIBRARY_WORDS,
  RUNDOWN_WORDS,
  Row,
  Skeleton,
  VirtualRows,
  cn,
  formatTime,
  formatWhen,
  useCommandState,
} from "@manent/ui";
import { ChevronRightIcon, ListOrderedIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";
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
import { asRundownProjectKind } from "./create-rundown.ts";
import { formatAirDate } from "./dur-format.ts";
import { registerLibraryNew, setActiveLibraryProject } from "./handlers.ts";
import { useRundownsData } from "./library-rundowns-data.ts";
import type {
  RundownViewItem,
  StoryViewItem,
} from "./library-rundowns-data.ts";
import {
  NewRundownSplitControl,
  createProjectRundownWithTemplate,
  useProjectRundownTemplates,
} from "./library-rundowns-template.tsx";

const VIRTUAL_LIMIT = 100;
const COL_AIR = "w-16 shrink-0 tabular-nums";
const COL_ROWS = "hidden w-20 shrink-0 tabular-nums @lg:block";
const COL_STORY_ROW = "hidden w-20 shrink-0 tabular-nums @lg:block";
const COL_EDITED = "hidden w-col-edited shrink-0 truncate @xl:block";
const ROW_ITEMS = PROJECT_ROW_ITEMS.filter((i) =>
  i.targets.includes("project"),
);

type FlatRow =
  | { readonly kind: "rundown"; readonly item: RundownViewItem }
  | { readonly kind: "story"; readonly story: StoryViewItem };

function formatLastEdited(edited: EpisodeLastEdited, now: number): string {
  if (edited === null) return RUNDOWN_WORDS.dash;
  if ("changedSinceOpened" in edited) return LIBRARY_WORDS.changedSinceOpened;
  return LIBRARY_WORDS.edited(edited.byName, formatWhen(edited.at, now));
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
  const { trailing, ...place } = placeProps(item.place, shell);
  const leadingControl =
    item.stories.length > 0 ? (
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={
          expanded
            ? RUNDOWN_WORDS.collapseRundown(dateLabel)
            : RUNDOWN_WORDS.expandRundown(dateLabel)
        }
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted hover:bg-subtle hover:text-fg"
        onClick={onToggle}
      >
        <ChevronRightIcon
          aria-hidden="true"
          data-open={expanded ? "true" : undefined}
          className="mn-tree-chevron size-icon"
        />
      </button>
    ) : (
      <span aria-hidden="true" className="size-6 shrink-0" />
    );
  return (
    <Row
      onActivate={onOpen}
      leadingControl={leadingControl}
      trailing={trailing}
      {...place}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">
          {dateLabel}
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
        <span aria-hidden="true" className={COL_AIR} />
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
        {(["w-32", "w-28", "w-36"] as const).map((width, index) => (
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
  const templates = useProjectRundownTemplates(
    data.workspaceId,
    project.projectId,
  );
  const newCmd = useCommandState("rundown.new");
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const disabled =
    !data.canEdit || !newCmd.enabled || data.workspaceId === null || creating;
  const onNewRundown = (
    skeleton: RundownTemplateSkeleton | null = templates.defaultRundown
      ?.skeleton ?? null,
  ): void => {
    if (disabled || data.workspaceId === null) return;
    setCreating(true);
    void createProjectRundownWithTemplate({
      services,
      workspaceId: data.workspaceId,
      projectId: project.projectId,
      kind: asRundownProjectKind(project.kind),
      existing: data.rundowns,
      nowMs: clockNow(),
      skeleton,
    })
      .then((created) => open(created.docId))
      .finally(() => setCreating(false));
  };

  const newRef = useRef(onNewRundown);
  newRef.current = onNewRundown;

  useEffect(
    () => registerLibraryNew(project.projectId, () => newRef.current()),
    [project.projectId],
  );

  const markActive = () => setActiveLibraryProject(project.projectId);
  const toggleExpanded = (docId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(docId)) next.add(docId);
      return next;
    });

  const flatRows = useMemo<readonly FlatRow[]>(
    () =>
      data.rundowns.flatMap((item) => [
        { kind: "rundown" as const, item },
        ...(expanded.has(item.docId)
          ? item.stories.map((story) => ({ kind: "story" as const, story }))
          : []),
      ]),
    [data.rundowns, expanded],
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
        expanded={expanded.has(entry.item.docId)}
        shell={shell}
        now={now}
        onToggle={() => toggleExpanded(entry.item.docId)}
        onOpen={() => open(entry.item.docId)}
      />
    );
  };

  const loading = data.rundowns.length === 0 && !data.loaded;
  const empty = !loading && data.rundowns.length === 0;
  const newButton = (
    <NewRundownSplitControl
      disabled={disabled}
      reason={newCmd.whyNot ?? (!data.canEdit ? DEMO_WORDS.needsEdit : null)}
      templates={templates}
      onCreate={onNewRundown}
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
        {empty ? null : newButton}
      </div>
      {loading ? (
        <RundownsSkeleton />
      ) : empty ? (
        <div data-tour="library:rundowns" className="flex justify-center py-4">
          <EmptyHeroCard
            icon={<ListOrderedIcon aria-hidden="true" className="size-5" />}
            title={RUNDOWN_WORDS.noRundownsYet}
            actions={newButton}
          />
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
