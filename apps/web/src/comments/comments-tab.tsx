// The right panel's Comments tab: exclusive filters with counts, round triage header, thread rows and empty states.
import type { Choice, SettingValue } from "@manent/settings";
import {
  Button,
  COMMENTS_WORDS,
  HISTORY_WORDS,
  Segmented,
  Skeleton,
  WRITING_WORDS,
} from "@manent/ui";
import { MessageSquareIcon, MessageSquarePlusIcon } from "lucide-react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import type { PanelTab } from "../shell/panel-tab.ts";
import {
  commentsActions,
  useComments,
  useCommentsUi,
  useRetainComments,
} from "../state/comments.store.ts";
import {
  commentCounts,
  filteredThreads,
  roundStats,
  sortedRounds,
} from "./comments-filter.ts";
import type { RoundThreadFilter } from "./comments-filter.ts";
import { anchorPlaceLabel } from "./comments-format.ts";
import { RoundRow } from "./round-row.tsx";
import { NoteRow, ThreadRow } from "./thread-rows.tsx";

const ROUND_FILTER_CHOICES: readonly Choice<RoundThreadFilter>[] = [
  { value: "all", label: COMMENTS_WORDS.filterAll },
  { value: "open", label: COMMENTS_WORDS.filterOpen },
  { value: "resolved", label: COMMENTS_WORDS.filterResolved },
];

function useScriptFormat(docId: string | null): SettingValue<"script.format"> {
  const { settings, openScriptStore } = useServices();
  const store = docId === null ? settings : openScriptStore(docId);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe("script.format", listener),
    [store],
  );
  return useSyncExternalStore(subscribe, () => store.get("script.format"));
}

const SKELETON_CARDS = [
  { author: "w-28", line: "w-4/5" },
  { author: "w-32", line: "w-2/3" },
  { author: "w-24", line: "w-3/4" },
] as const;

function CommentsSkeleton(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p role="status" aria-live="polite" className="sr-only">
        {COMMENTS_WORDS.loadingComments}
      </p>
      <div aria-busy="true" className="divide-y divide-line">
        {SKELETON_CARDS.map((card, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="flex flex-col gap-2 p-3"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="size-avatar-sm shrink-0 rounded-full" />
              <Skeleton className={`h-3 ${card.author}`} />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className={`h-3 ${card.line}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentsTab(props: { docId: string | null }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const { where, now } = useEnvironment();
  const state = useComments(docId);
  const ui = useCommentsUi(docId);
  const format = useScriptFormat(docId);
  const [roundFilter, setRoundFilter] = useState<RoundThreadFilter>("all");

  useEffect(() => {
    setRoundFilter("all");
  }, [ui.filter]);

  if (docId === null) return null;

  const counts = commentCounts(state, services.userId);
  const filterChoices: Choice<string>[] = [
    {
      value: "open",
      label: COMMENTS_WORDS.filterWithCount(
        COMMENTS_WORDS.filterOpen,
        counts.open,
      ),
    },
    {
      value: "mine",
      label: COMMENTS_WORDS.filterWithCount(
        COMMENTS_WORDS.filterMine,
        counts.mine,
      ),
    },
    ...(state.canEdit
      ? [
          {
            value: "writers",
            label: COMMENTS_WORDS.filterWithCount(
              COMMENTS_WORDS.writersOnly,
              counts.writers,
            ),
          },
        ]
      : []),
  ];
  const rounds = sortedRounds(state.rounds);
  const activeRoundId = ui.filter.startsWith("round:")
    ? ui.filter.slice("round:".length)
    : null;
  const activeRoundStats =
    activeRoundId !== null ? roundStats(state, activeRoundId) : null;
  const threads = filteredThreads(
    state,
    ui.filter,
    services.userId,
    roundFilter,
  );
  const notes = state.canEdit && ui.filter === "writers" ? state.notes : [];
  const currentNow = now();
  const isEmpty =
    ui.filter === "writers" ? notes.length === 0 : threads.length === 0;
  const defaultEmptyText =
    format === "variety"
      ? where.platform === "mac"
        ? COMMENTS_WORDS.emptyVarietyMac
        : COMMENTS_WORDS.emptyVarietyOther
      : where.platform === "mac"
        ? COMMENTS_WORDS.emptyMac
        : COMMENTS_WORDS.emptyOther;

  const emptyText =
    activeRoundId !== null
      ? roundFilter === "open"
        ? COMMENTS_WORDS.emptyRoundOpen
        : roundFilter === "resolved"
          ? COMMENTS_WORDS.emptyRoundResolved
          : COMMENTS_WORDS.emptyRoundAll
      : ui.filter === "mine"
        ? COMMENTS_WORDS.emptyMine
        : defaultEmptyText;

  const showOpenFallback =
    (ui.filter === "mine" && counts.open > 0) ||
    (activeRoundId !== null &&
      roundFilter !== "all" &&
      (activeRoundStats?.total ?? 0) > 0);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <Segmented
              label={HISTORY_WORDS.filter}
              size="sm"
              value={activeRoundId !== null ? "" : ui.filter}
              options={filterChoices}
              onChange={(next) => commentsActions.setFilter(docId, next)}
            />
          </div>
          {state.canComment ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={COMMENTS_WORDS.commentOnScriptCommand}
              title={COMMENTS_WORDS.commentOnScriptCommand}
              className="shrink-0 cursor-pointer text-fg-muted hover:text-fg"
              onClick={() =>
                commentsActions.openPopover(docId, { kind: "script_comment" })
              }
            >
              <MessageSquarePlusIcon aria-hidden="true" className="size-icon" />
            </Button>
          ) : null}
        </div>
        {rounds.length === 0 ? null : (
          <div className="flex flex-col gap-0.5">
            <h3 className="mn-group-label px-0 pt-1">
              {WRITING_WORDS.reviewRounds}
            </h3>
            {rounds.map(({ id, round }) => (
              <RoundRow
                key={id}
                docId={docId}
                roundId={id}
                round={round}
                stats={roundStats(state, id)}
                selected={ui.filter === `round:${id}`}
                canEdit={state.canEdit}
                services={services}
                onSelect={() => commentsActions.setFilter(docId, `round:${id}`)}
              />
            ))}
          </div>
        )}
        {activeRoundId !== null && activeRoundStats !== null ? (
          <div className="flex flex-col gap-2 border-t border-line pt-2">
            <div className="flex items-center justify-between gap-2 text-meta text-fg-muted tabular-nums">
              <span>
                {COMMENTS_WORDS.roundProgress(
                  activeRoundStats.resolved,
                  activeRoundStats.total,
                )}
              </span>
            </div>
            <div className="mn-progress-track">
              <div
                className="mn-progress-fill"
                style={{
                  transform: `scaleX(${
                    activeRoundStats.total === 0
                      ? 0
                      : activeRoundStats.resolved / activeRoundStats.total
                  })`,
                }}
              />
            </div>
            <Segmented
              label={WRITING_WORDS.reviewRounds}
              size="sm"
              value={roundFilter}
              options={ROUND_FILTER_CHOICES}
              onChange={(next) => {
                if (next === "all" || next === "open" || next === "resolved")
                  setRoundFilter(next);
              }}
            />
          </div>
        ) : null}
      </div>
      {state.loading && isEmpty ? (
        <CommentsSkeleton />
      ) : isEmpty ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col items-center justify-center p-4">
            <EmptyHeroCard
              compact
              icon={<MessageSquareIcon aria-hidden="true" className="size-4" />}
              description={emptyText}
              actions={
                showOpenFallback ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (activeRoundId !== null) setRoundFilter("all");
                      else commentsActions.setFilter(docId, "open");
                    }}
                  >
                    {activeRoundId !== null
                      ? COMMENTS_WORDS.filterAll
                      : COMMENTS_WORDS.showOpen}
                  </Button>
                ) : null
              }
            />
          </div>
        </div>
      ) : (
        <div
          role="list"
          aria-label={COMMENTS_WORDS.tab}
          className="min-h-0 flex-1 divide-y divide-line overflow-y-auto"
        >
          {ui.filter === "writers"
            ? notes.map((entry) => (
                <div key={entry.id} role="listitem">
                  <NoteRow
                    entry={entry}
                    removed={
                      entry.note.anchor !== null &&
                      state.removedIds.has(entry.id)
                    }
                    active={ui.activeId === entry.id}
                    now={currentNow}
                    place={anchorPlaceLabel(
                      entry.note.anchor,
                      state.blockScenes,
                    )}
                    onOpen={() =>
                      commentsActions.openPopover(docId, {
                        kind: "open_id",
                        id: entry.id,
                      })
                    }
                  />
                </div>
              ))
            : threads.map((entry) => (
                <div key={entry.id} role="listitem">
                  <ThreadRow
                    entry={entry}
                    state={state}
                    currentUserId={services.userId}
                    active={ui.activeId === entry.id}
                    now={currentNow}
                    onOpen={() =>
                      commentsActions.openPopover(docId, {
                        kind: "open_id",
                        id: entry.id,
                      })
                    }
                  />
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

export const commentsTab: PanelTab<"comments"> = {
  id: "comments",
  useTab(docId) {
    const services = useServices();
    useRetainComments(docId, services);
    return { present: docId !== null, label: COMMENTS_WORDS.tab };
  },
  Tab: CommentsTab,
};
