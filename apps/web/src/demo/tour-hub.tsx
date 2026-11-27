// Tour Journey Hub: pinned progress header, filter strip, conditional resume strip and collapsible scenario groups.
import type { TourGroup, TourScenario, TourTrackId } from "@manent/demo";
import { Button, DEMO_WORDS, TOUR_WORDS } from "@manent/ui";
import { CheckCircle2Icon, ChevronRightIcon, XIcon } from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";
import type { Where } from "../platform.ts";
import type { TourActive } from "../state/tour.store.ts";

export type TourFilter = "all" | "highlights" | "remaining";

/** Slim GPU-scaled progress bar shared by Browse and Focused Stepper modes. */
export function TourProgressBar(props: {
  done: number;
  total: number;
}): ReactNode {
  const { done, total } = props;
  const ratio = total === 0 ? 0 : Math.min(1, done / total);
  return (
    <div
      role="progressbar"
      aria-label={TOUR_WORDS.progressLabel}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="mn-tour-progress-track w-full"
    >
      <div
        className="mn-tour-progress-fill"
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}

function TourScenarioCard(props: {
  scenario: TourScenario;
  ticked: boolean;
  active: TourActive | null;
  shell: Where["shell"];
  onSelect: (scenarioId: string) => void;
  onMark: (scenarioId: string, done: boolean) => void;
}): ReactNode {
  const { scenario, ticked, active, shell, onSelect, onMark } = props;
  const isActive = active?.scenarioId === scenario.id;
  const windowCount = scenario.setup.extraWindows.length + 1;
  const isDesktop = scenario.setup.shell === "desktop" && shell !== "desktop";
  const hasBadges = windowCount > 1 || isDesktop || isActive;

  return (
    <li className="flex items-start gap-2 rounded-surface border border-line bg-raised p-2.5 text-ui transition-colors hover:border-line-strong">
      <input
        type="checkbox"
        aria-label={scenario.promise}
        checked={ticked}
        onChange={(event) => onMark(scenario.id, event.currentTarget.checked)}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <button
        type="button"
        data-tour-card={scenario.id}
        onClick={() => onSelect(scenario.id)}
        className="flex min-w-0 flex-1 flex-col items-start gap-1.5 rounded-micro text-start focus-visible:outline-2 focus-visible:outline-focus"
      >
        <span className={ticked ? "text-fg-muted line-through" : "text-fg"}>
          {scenario.promise}
        </span>
        {hasBadges ? (
          <span className="flex flex-wrap items-center gap-1">
            {isActive && active !== null ? (
              <span className="mn-tag tabular-nums">
                {TOUR_WORDS.ofSteps(active.step + 1, scenario.steps.length)}
              </span>
            ) : null}
            {windowCount > 1 ? (
              <span className="mn-tag">{TOUR_WORDS.windows(windowCount)}</span>
            ) : null}
            {isDesktop ? (
              <span className="mn-tag">{TOUR_WORDS.desktopApp}</span>
            ) : null}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function TourGroupSection(props: {
  group: TourGroup;
  scenarios: readonly TourScenario[];
  doneInGroup: number;
  totalInGroup: number;
  collapsible: boolean;
  expanded: boolean;
  doneSet: ReadonlySet<string>;
  active: TourActive | null;
  shell: Where["shell"];
  onToggle: () => void;
  onSelect: (scenarioId: string) => void;
  onMark: (scenarioId: string, done: boolean) => void;
}): ReactNode {
  const {
    group,
    scenarios,
    doneInGroup,
    totalInGroup,
    collapsible,
    expanded,
    doneSet,
    active,
    shell,
    onToggle,
    onSelect,
    onMark,
  } = props;
  const listId = useId();

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 flex-1 text-micro font-semibold tracking-wide text-fg-muted uppercase">
          {collapsible ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={onToggle}
              className="flex w-full items-center gap-1 rounded-micro py-1 text-start text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
            >
              <ChevronRightIcon
                aria-hidden="true"
                className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
              />
              <span className="truncate">{group}</span>
            </button>
          ) : (
            <span className="block truncate py-1">{group}</span>
          )}
        </h2>
        <span className="shrink-0 text-micro tabular-nums text-fg-muted">
          {doneInGroup}/{totalInGroup}
        </span>
      </div>
      {expanded ? (
        <ul id={listId} className="flex flex-col gap-1.5">
          {scenarios.map((scenario) => (
            <TourScenarioCard
              key={scenario.id}
              scenario={scenario}
              ticked={doneSet.has(scenario.id)}
              active={active}
              shell={shell}
              onSelect={onSelect}
              onMark={onMark}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export interface ActiveTrackBanner {
  readonly id: TourTrackId;
  readonly title: string;
  readonly done: number;
  readonly total: number;
  readonly nextScenarioId: string | null;
}

export function TourHub(props: {
  groups: readonly TourGroup[];
  listed: readonly TourScenario[];
  visible: readonly TourScenario[];
  doneSet: ReadonlySet<string>;
  filter: TourFilter;
  openGroups: ReadonlySet<TourGroup>;
  active: TourActive | null;
  activeScenario: TourScenario | null;
  activeTrack?: ActiveTrackBanner | null;
  shell: Where["shell"];
  onFilter: (filter: TourFilter) => void;
  onToggleGroup: (group: TourGroup) => void;
  onSelect: (scenarioId: string) => void;
  onStartNextInTrack?: (scenarioId: string) => void;
  onClearTrack?: () => void;
  onMark: (scenarioId: string, done: boolean) => void;
}): ReactNode {
  const {
    groups,
    listed,
    visible,
    doneSet,
    filter,
    openGroups,
    active,
    activeScenario,
    activeTrack = null,
    shell,
    onFilter,
    onToggleGroup,
    onSelect,
    onStartNextInTrack,
    onClearTrack,
    onMark,
  } = props;

  const filters: readonly { id: TourFilter; label: string }[] = [
    { id: "all", label: TOUR_WORDS.filterAll },
    { id: "highlights", label: TOUR_WORDS.filterHighlights },
    { id: "remaining", label: TOUR_WORDS.filterRemaining },
  ];

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2">
        <p className="text-meta font-medium tabular-nums text-fg">
          {TOUR_WORDS.progress(doneSet.size, listed.length)}
        </p>
        <TourProgressBar done={doneSet.size} total={listed.length} />
        <div
          role="group"
          aria-label={TOUR_WORDS.filterLabel}
          className="flex flex-wrap items-center gap-1 pt-0.5"
        >
          {filters.map(({ id, label }) => (
            <Button
              key={id}
              variant="ghost"
              size="sm"
              aria-pressed={filter === id}
              onClick={() => onFilter(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {activeTrack !== null ? (
        <div
          data-surface="demo"
          className="flex items-center justify-between gap-2 rounded-surface border border-line bg-raised px-2.5 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-meta font-semibold text-fg">
              {activeTrack.title}
            </p>
            <p className="text-micro tabular-nums text-fg-muted">
              {DEMO_WORDS.trackProgress(activeTrack.done, activeTrack.total)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {activeTrack.nextScenarioId !== null &&
            onStartNextInTrack !== undefined ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStartNextInTrack(activeTrack.nextScenarioId!)}
              >
                {DEMO_WORDS.continueTrack(activeTrack.title)}
              </Button>
            ) : null}
            {onClearTrack !== undefined ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={TOUR_WORDS.closeFloating}
                onClick={onClearTrack}
              >
                <XIcon aria-hidden="true" className="size-icon" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeScenario !== null && active !== null ? (
        <div className="flex items-center justify-between gap-2 rounded-surface border border-line bg-raised px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-micro font-semibold tracking-wide text-fg-muted uppercase">
              {TOUR_WORDS.inProgress}
            </p>
            <p className="truncate text-meta text-fg">
              {activeScenario.promise}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelect(activeScenario.id)}
          >
            {TOUR_WORDS.continueAction}
            <ChevronRightIcon aria-hidden="true" className="size-icon" />
          </Button>
        </div>
      ) : null}

      {filter === "remaining" && visible.length === 0 ? (
        <EmptyHeroCard
          compact
          icon={<CheckCircle2Icon aria-hidden="true" className="size-5" />}
          title={TOUR_WORDS.allTickedTitle}
          description={TOUR_WORDS.allTickedBody}
          actions={
            <Button variant="outline" size="sm" onClick={() => onFilter("all")}>
              {TOUR_WORDS.showAll}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => {
            const scenarios = visible.filter((s) => s.group === group);
            if (scenarios.length === 0) return null;
            const totalInGroup = listed.filter((s) => s.group === group);
            const doneInGroup = totalInGroup.filter((s) =>
              doneSet.has(s.id),
            ).length;
            const collapsible = filter === "all";
            return (
              <TourGroupSection
                key={group}
                group={group}
                scenarios={scenarios}
                doneInGroup={doneInGroup}
                totalInGroup={totalInGroup.length}
                collapsible={collapsible}
                expanded={!collapsible || openGroups.has(group)}
                doneSet={doneSet}
                active={active}
                shell={shell}
                onToggle={() => onToggleGroup(group)}
                onSelect={onSelect}
                onMark={onMark}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
